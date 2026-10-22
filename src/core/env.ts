import { z } from 'zod';
import { EnvError } from './errors.js';

const aiSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, 'is required'),
  NIGHTQA_MODEL_STRONG: z.string().min(1, 'is required (model for decisions and test writing)'),
  NIGHTQA_MODEL_CHEAP: z.string().min(1).optional(),
  NIGHTQA_PRICE_STRONG_INPUT_PER_MTOK: z.coerce
    .number({ error: 'is required (USD per million input tokens of the strong model)' })
    .positive(),
  NIGHTQA_PRICE_STRONG_OUTPUT_PER_MTOK: z.coerce
    .number({ error: 'is required (USD per million output tokens of the strong model)' })
    .positive(),
  NIGHTQA_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('low'),
});

const budgetSchema = z.object({
  NIGHTQA_MAX_STEPS: z.coerce.number().int().positive().default(40),
  NIGHTQA_MAX_SECONDS: z.coerce.number().positive().default(300),
  NIGHTQA_MAX_COST_USD: z.coerce.number().positive().default(0.5),
});

export interface AiEnv {
  readonly apiKey: string;
  readonly modelStrong: string;
  readonly modelCheap?: string;
  readonly priceInputPerMtok: number;
  readonly priceOutputPerMtok: number;
  readonly effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}

export interface Budgets {
  readonly maxSteps: number;
  readonly maxSeconds: number;
  readonly maxCostUsd: number;
}

type Env = Readonly<Record<string, string | undefined>>;

function problems(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.map(String).join('.')}: ${i.message}`);
}

/** Validates the AI settings once at startup. Model names and prices are never hard-coded. */
export function loadAiEnv(env: Env): AiEnv {
  const r = aiSchema.safeParse(env);
  if (!r.success) throw new EnvError(problems(r.error));
  const d = r.data;
  return {
    apiKey: d.ANTHROPIC_API_KEY,
    modelStrong: d.NIGHTQA_MODEL_STRONG,
    ...(d.NIGHTQA_MODEL_CHEAP !== undefined ? { modelCheap: d.NIGHTQA_MODEL_CHEAP } : {}),
    priceInputPerMtok: d.NIGHTQA_PRICE_STRONG_INPUT_PER_MTOK,
    priceOutputPerMtok: d.NIGHTQA_PRICE_STRONG_OUTPUT_PER_MTOK,
    effort: d.NIGHTQA_EFFORT,
  };
}

/** Per-flow budgets. Defaults: 40 steps, 300 seconds, $0.50. */
export function loadBudgets(env: Env): Budgets {
  const r = budgetSchema.safeParse(env);
  if (!r.success) throw new EnvError(problems(r.error));
  return {
    maxSteps: r.data.NIGHTQA_MAX_STEPS,
    maxSeconds: r.data.NIGHTQA_MAX_SECONDS,
    maxCostUsd: r.data.NIGHTQA_MAX_COST_USD,
  };
}
