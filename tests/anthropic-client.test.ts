import { readFileSync } from 'node:fs';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadAiEnv } from '../src/core/env.js';
import { AnthropicAiClient, costUsd } from '../src/io/anthropic-client.js';

const fixture: unknown = JSON.parse(
  readFileSync(new URL('./fixtures/anthropic-tool-use.json', import.meta.url), 'utf8'),
);
const env = loadAiEnv({
  ANTHROPIC_API_KEY: 'test-key',
  NIGHTQA_MODEL_STRONG: 'fixture-model',
  NIGHTQA_PRICE_STRONG_INPUT_PER_MTOK: '2',
  NIGHTQA_PRICE_STRONG_OUTPUT_PER_MTOK: '10',
});

let lastBody: Record<string, unknown> = {};
const server = setupServer(
  http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
    lastBody = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(fixture as Record<string, unknown>);
  }),
);
beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

describe('AnthropicAiClient (contract, recorded fixture)', () => {
  it('sends the env model, the eight tools and a screenshot, with no sampling parameters', async () => {
    const client = new AnthropicAiClient(env);
    await client.decide({
      system: 'sys',
      userText: 'hello',
      screenshot: new Uint8Array([137, 80, 78, 71]),
      promptVersion: 'v1',
    });
    expect(lastBody.model).toBe('fixture-model');
    expect(lastBody).not.toHaveProperty('temperature');
    expect(lastBody.tool_choice).toEqual({ type: 'auto', disable_parallel_tool_use: true });
    expect((lastBody.tools as { name: string }[]).map((t) => t.name).sort()).toEqual([
      'click',
      'done',
      'expect',
      'navigate',
      'scroll',
      'stuck',
      'type',
      'wait',
    ]);
    const content = (lastBody.messages as { content: { type: string }[] }[])[0]?.content.map(
      (c) => c.type,
    );
    expect(content).toEqual(['image', 'text']);
  });

  it('returns the tool call, reasoning, token usage and USD cost', async () => {
    const r = await new AnthropicAiClient(env).decide({
      system: 's',
      userText: 'u',
      screenshot: new Uint8Array([1]),
      promptVersion: 'v1',
    });
    expect(r.call).toEqual({ name: 'click', input: { target: 'e4' } });
    expect(r.reasoning).toContain('cart link');
    expect(r.usage).toEqual({ inputTokens: 1200, outputTokens: 80 });
    expect(r.costUsd).toBeCloseTo((1200 * 2 + 80 * 10) / 1_000_000);
    expect(r.model).toBe('fixture-model');
  });

  it('computes cost from configured prices', () => {
    expect(costUsd({ priceInputPerMtok: 4, priceOutputPerMtok: 20 }, 1_000_000, 1_000_000)).toBe(
      24,
    );
  });
});
