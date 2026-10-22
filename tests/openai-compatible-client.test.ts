import { readFileSync } from 'node:fs';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadAiEnv } from '../src/core/env.js';
import { AiHttpError, OpenAiCompatibleAiClient } from '../src/io/openai-compatible-client.js';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/nvidia-tool-call.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;
const env = loadAiEnv({
  NIGHTQA_PROVIDER: 'nvidia',
  NVIDIA_API_KEY: 'nvapi-test-key',
  NIGHTQA_MODEL_STRONG: 'meta/muse-glimmer-30b',
});
const URL_ = 'https://integrate.api.nvidia.com/v1/chat/completions';
const req = {
  system: 'sys',
  userText: 'hello',
  screenshot: new Uint8Array([137, 80, 78, 71]),
  promptVersion: 'v1',
};

let lastBody: Record<string, unknown> = {};
let lastAuth: string | null = null;
let hits = 0;
const server = setupServer();
beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  hits = 0;
});
afterAll(() => {
  server.close();
});

function ok(body: unknown = fixture) {
  return http.post(URL_, async ({ request }) => {
    hits++;
    lastAuth = request.headers.get('authorization');
    lastBody = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(body as Record<string, unknown>);
  });
}

const noSleep = { sleep: () => Promise.resolve(), random: () => 0.5 };

describe('OpenAiCompatibleAiClient (contract, recorded fixture)', () => {
  it('sends the NVIDIA model, a screenshot, system prompt, tools and the key', async () => {
    server.use(ok());
    await new OpenAiCompatibleAiClient(env, noSleep).decide(req);
    expect(lastAuth).toBe('Bearer nvapi-test-key');
    expect(lastBody.model).toBe('meta/muse-glimmer-30b');
    expect(lastBody.temperature).toBe(0.2);
    expect(lastBody.tool_choice).toBe('auto');
    const tools = lastBody.tools as { type: string; function: { name: string } }[];
    expect(tools.every((t) => t.type === 'function')).toBe(true);
    expect(tools.map((t) => t.function.name).sort()).toEqual([
      'click',
      'done',
      'expect',
      'navigate',
      'scroll',
      'stuck',
      'type',
      'wait',
    ]);
    const messages = lastBody.messages as { role: string; content: unknown }[];
    expect(messages[0]).toEqual({ role: 'system', content: 'sys' });
    const parts = messages[1]?.content as { type: string; image_url?: { url: string } }[];
    expect(parts.map((p) => p.type)).toEqual(['image_url', 'text']);
    expect(parts[0]?.image_url?.url).toMatch(/^data:image\/png;base64,/);
  });

  it('returns the tool call, reasoning, usage and a $0 cost for the free trial', async () => {
    server.use(ok());
    const r = await new OpenAiCompatibleAiClient(env, noSleep).decide(req);
    expect(r.call).toEqual({ name: 'click', input: { target: 'e4' } });
    expect(r.reasoning).toContain('cart link');
    expect(r.usage).toEqual({ inputTokens: 1800, outputTokens: 120 });
    expect(r.costUsd).toBe(0);
    expect(r.model).toBe('meta/muse-glimmer-30b');
  });

  it('computes cost when prices are configured', async () => {
    server.use(ok());
    const priced = loadAiEnv({
      NIGHTQA_PROVIDER: 'nvidia',
      NVIDIA_API_KEY: 'k',
      NIGHTQA_MODEL_STRONG: 'm',
      NIGHTQA_PRICE_STRONG_INPUT_PER_MTOK: '1',
      NIGHTQA_PRICE_STRONG_OUTPUT_PER_MTOK: '2',
    });
    const r = await new OpenAiCompatibleAiClient(priced, noSleep).decide(req);
    expect(r.costUsd).toBeCloseTo((1800 * 1 + 120 * 2) / 1_000_000);
  });

  it('turns malformed tool arguments into a null input (the loop rejects it)', async () => {
    const bad = structuredClone(fixture) as {
      choices: { message: { tool_calls: { function: { arguments: string } }[] } }[];
    };
    const call = bad.choices[0]?.message.tool_calls[0];
    if (call) call.function.arguments = '{not json';
    server.use(ok(bad));
    const r = await new OpenAiCompatibleAiClient(env, noSleep).decide(req);
    expect(r.call).toEqual({ name: 'click', input: null });
  });

  it('returns no call when the model answers in plain text', async () => {
    server.use(
      ok({
        choices: [{ message: { content: 'I think the cart is open.' } }],
        usage: { prompt_tokens: 5, completion_tokens: 5 },
      }),
    );
    const r = await new OpenAiCompatibleAiClient(env, noSleep).decide(req);
    expect(r.call).toBeUndefined();
    expect(r.reasoning).toContain('cart is open');
  });

  it('falls back to the separate reasoning field when content is empty', async () => {
    server.use(
      ok({
        choices: [
          {
            message: {
              content: null,
              reasoning_content: 'The footer link is visible.',
              tool_calls: [{ function: { name: 'click', arguments: '{"target":"e2"}' } }],
            },
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 5 },
      }),
    );
    const r = await new OpenAiCompatibleAiClient(env, noSleep).decide(req);
    expect(r.reasoning).toBe('The footer link is visible.');
    expect(r.call).toEqual({ name: 'click', input: { target: 'e2' } });
  });

  it('retries rate limits and server errors with backoff, then succeeds', async () => {
    const waits: number[] = [];
    let n = 0;
    server.use(
      http.post(URL_, () => {
        n++;
        if (n === 1)
          return new HttpResponse('slow down', { status: 429, headers: { 'retry-after': '2' } });
        if (n === 2) return new HttpResponse('oops', { status: 503 });
        return HttpResponse.json(fixture);
      }),
    );
    const client = new OpenAiCompatibleAiClient(env, {
      sleep: (ms) => Promise.resolve(void waits.push(ms)),
      random: () => 1,
    });
    const r = await client.decide(req);
    expect(r.call?.name).toBe('click');
    expect(n).toBe(3);
    expect(waits[0]).toBe(2000); // honours Retry-After
    expect(waits[1]).toBe(1000); // 500ms * 2^1 with jitter 1.0
  });

  it('gives up after the attempt limit', async () => {
    server.use(http.post(URL_, () => (hits++, new HttpResponse('down', { status: 500 }))));
    await expect(
      new OpenAiCompatibleAiClient(env, { ...noSleep, maxAttempts: 3 }).decide(req),
    ).rejects.toBeInstanceOf(AiHttpError);
    expect(hits).toBe(3);
  });

  it('does not retry client errors such as a bad key', async () => {
    server.use(http.post(URL_, () => (hits++, new HttpResponse('unauthorized', { status: 401 }))));
    await expect(new OpenAiCompatibleAiClient(env, noSleep).decide(req)).rejects.toMatchObject({
      status: 401,
      retryable: false,
    });
    expect(hits).toBe(1);
  });

  it('rejects a response that is not the expected shape', async () => {
    server.use(ok({ nope: true }));
    await expect(new OpenAiCompatibleAiClient(env, noSleep).decide(req)).rejects.toThrow(
      'Unexpected response',
    );
  });
});
