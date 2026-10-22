import type { AiEnv } from '../core/env.js';
import type { AiClient } from '../core/ports.js';
import { AnthropicAiClient } from './anthropic-client.js';
import { OpenAiCompatibleAiClient } from './openai-compatible-client.js';

/** Picks the AI adapter for the configured provider. */
export function createAiClient(env: AiEnv): AiClient {
  return env.provider === 'nvidia' ? new OpenAiCompatibleAiClient(env) : new AnthropicAiClient(env);
}
