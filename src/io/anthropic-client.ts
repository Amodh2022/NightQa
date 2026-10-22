import Anthropic from '@anthropic-ai/sdk';
import type { AiEnv } from '../core/env.js';
import { TOOL_DEFS } from '../core/agent/tools.js';
import type { AiClient, DecideRequest, DecideResult } from '../core/ports.js';

const TOOLS: Anthropic.Tool[] = TOOL_DEFS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: {
    type: 'object',
    properties: t.properties,
    required: [...t.required],
    additionalProperties: false,
  },
}));

/** USD for one call. Prices come from env, never from code. */
export function costUsd(
  env: Pick<AiEnv, 'priceInputPerMtok' | 'priceOutputPerMtok'>,
  input: number,
  output: number,
): number {
  return (input * env.priceInputPerMtok + output * env.priceOutputPerMtok) / 1_000_000;
}

/**
 * Anthropic adapter for the agent's THINK step. Uses tool_choice "auto" (forced tool choice is rejected by
 * current models) with parallel tool calls off, and leaves validation to the caller. No sampling parameters are
 * sent: current models reject temperature, so determinism comes from low effort and the short, fresh prompt.
 */
export class AnthropicAiClient implements AiClient {
  private readonly client: Anthropic;

  constructor(
    private readonly env: AiEnv,
    client?: Anthropic,
  ) {
    this.client = client ?? new Anthropic({ apiKey: env.apiKey, timeout: 60_000, maxRetries: 2 });
  }

  async decide(req: DecideRequest): Promise<DecideResult> {
    const res = await this.client.messages.create({
      model: this.env.modelStrong,
      max_tokens: 2048,
      system: req.system,
      tools: TOOLS,
      tool_choice: { type: 'auto', disable_parallel_tool_use: true },
      output_config: { effort: this.env.effort },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: Buffer.from(req.screenshot).toString('base64'),
              },
            },
            { type: 'text', text: req.userText },
          ],
        },
      ],
    });
    let reasoning = '';
    let call: DecideResult['call'];
    for (const block of res.content) {
      if (block.type === 'text') reasoning += block.text;
      else if (block.type === 'tool_use' && call === undefined)
        call = { name: block.name, input: block.input };
    }
    if (res.stop_reason === 'refusal') reasoning = `(refused) ${reasoning}`;
    const inputTokens = res.usage.input_tokens;
    const outputTokens = res.usage.output_tokens;
    return {
      reasoning: reasoning.trim(),
      call,
      usage: { inputTokens, outputTokens },
      costUsd: costUsd(this.env, inputTokens, outputTokens),
      model: res.model,
    };
  }
}
