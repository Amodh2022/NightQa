import { z } from 'zod';
import { TOOL_DEFS } from '../core/agent/tools.js';
import type { AiEnv } from '../core/env.js';
import type { AiClient, DecideRequest, DecideResult } from '../core/ports.js';

const TOOLS = TOOL_DEFS.map((t) => ({
  type: 'function' as const,
  function: {
    name: t.name,
    description: t.description,
    parameters: {
      type: 'object',
      properties: t.properties,
      required: [...t.required],
      additionalProperties: false,
    },
  },
}));

const responseSchema = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullish(),
          tool_calls: z
            .array(
              z.object({
                function: z.object({ name: z.string(), arguments: z.string().nullish() }),
              }),
            )
            .nullish(),
        }),
        finish_reason: z.string().nullish(),
      }),
    )
    .min(1),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).optional(),
});

/** Thrown for HTTP failures. `retryable` is true for rate limits and server errors. */
export class AiHttpError extends Error {
  override readonly name = 'AiHttpError';

  constructor(
    readonly status: number,
    readonly retryable: boolean,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

export interface OpenAiClientOptions {
  /** Injected for tests. */
  readonly fetchFn?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
}

/** USD for one call. Prices come from env; free trial models are priced at 0. */
export function costUsd(
  env: Pick<AiEnv, 'priceInputPerMtok' | 'priceOutputPerMtok'>,
  input: number,
  output: number,
): number {
  return (input * env.priceInputPerMtok + output * env.priceOutputPerMtok) / 1_000_000;
}

/**
 * AI client for any OpenAI-compatible chat-completions endpoint, such as NVIDIA's API catalog.
 * Sends the screenshot as an image part and the eight tools as functions, then returns the first tool call.
 * Every response is validated with Zod; the loop validates the tool call itself.
 * Timeouts on every call; rate limits and 5xx are retried with exponential backoff and jitter, other errors are not.
 */
export class OpenAiCompatibleAiClient implements AiClient {
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(
    private readonly env: AiEnv,
    private readonly opts: OpenAiClientOptions = {},
  ) {
    this.fetchFn = opts.fetchFn ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.random = opts.random ?? Math.random;
  }

  async decide(req: DecideRequest): Promise<DecideResult> {
    const body = JSON.stringify({
      model: this.env.modelStrong,
      max_tokens: 4096,
      temperature: this.env.temperature,
      messages: [
        { role: 'system', content: req.system },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${Buffer.from(req.screenshot).toString('base64')}`,
              },
            },
            { type: 'text', text: req.userText },
          ],
        },
      ],
      tools: TOOLS,
      tool_choice: 'auto',
    });
    const json = await this.post(body);
    const parsed = responseSchema.safeParse(json);
    if (!parsed.success)
      throw new Error(
        `Unexpected response from the model API: ${parsed.error.issues[0]?.message ?? 'invalid'}`,
      );
    const choice = parsed.data.choices[0];
    const message = choice?.message;
    const first = message?.tool_calls?.[0]?.function;
    let input: unknown = null;
    if (first?.arguments) {
      try {
        input = JSON.parse(first.arguments);
      } catch {
        input = null; // the loop rejects it as an invalid tool call
      }
    } else if (first) {
      input = {};
    }
    const inputTokens = parsed.data.usage?.prompt_tokens ?? 0;
    const outputTokens = parsed.data.usage?.completion_tokens ?? 0;
    return {
      reasoning: (message?.content ?? '').trim(),
      call: first ? { name: first.name, input } : undefined,
      usage: { inputTokens, outputTokens },
      costUsd: costUsd(this.env, inputTokens, outputTokens),
      model: parsed.data.model ?? this.env.modelStrong,
    };
  }

  private async post(body: string): Promise<unknown> {
    const maxAttempts = this.opts.maxAttempts ?? 4;
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await this.fetchFn(`${this.env.baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.env.apiKey}`,
          },
          body,
          signal: AbortSignal.timeout(this.opts.timeoutMs ?? 120_000),
        });
        if (res.ok) return await res.json();
        const text = (await res.text()).slice(0, 300);
        const retryAfter = Number(res.headers.get('retry-after'));
        throw new AiHttpError(
          res.status,
          res.status === 429 || res.status >= 500,
          `Model API returned ${String(res.status)}: ${text}`,
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
        );
      } catch (e) {
        const transient =
          e instanceof AiHttpError
            ? e.retryable
            : e instanceof Error && ['TimeoutError', 'TypeError'].includes(e.name);
        if (!transient || attempt >= maxAttempts) throw e;
        const backoff = Math.min(30_000, 500 * 2 ** (attempt - 1));
        const wait =
          (e instanceof AiHttpError ? e.retryAfterMs : undefined) ??
          backoff * (0.5 + this.random() / 2);
        await this.sleep(wait);
      }
    }
  }
}
