import { z } from 'zod';
import { EnvError } from './errors.js';

const required = (what: string) =>
  z.string({ error: () => `is required (${what})` }).min(1, `is required (${what})`);

export type Provider = 'anthropic' | 'nvidia';

/** Default endpoints per provider. NVIDIA's catalog speaks the OpenAI chat-completions protocol. */
export const DEFAULT_BASE_URL: Record<Provider, string> = {
  anthropic: 'https://api.anthropic.com',
  nvidia: 'https://integrate.api.nvidia.com/v1',
};

const aiSchema = z.object({
  NIGHTQA_PROVIDER: z
    .enum(['anthropic', 'nvidia'], { error: 'must be "anthropic" or "nvidia"' })
    .default('anthropic'),
  ANTHROPIC_API_KEY: z.string().optional(),
  NVIDIA_API_KEY: z.string().optional(),
  NIGHTQA_BASE_URL: z.url({ error: 'must be a URL' }).optional(),
  NIGHTQA_MODEL_STRONG: required('model name for decisions and test writing'),
  NIGHTQA_MODEL_CHEAP: z.string().min(1).optional(),
  // Optional: free trial models have no price. Required for Anthropic so the cost cap is real.
  NIGHTQA_PRICE_STRONG_INPUT_PER_MTOK: z.coerce
    .number({ error: 'must be a number' })
    .nonnegative()
    .optional(),
  NIGHTQA_PRICE_STRONG_OUTPUT_PER_MTOK: z.coerce
    .number({ error: 'must be a number' })
    .nonnegative()
    .optional(),
  NIGHTQA_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('low'),
  NIGHTQA_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),
});

const budgetSchema = z.object({
  NIGHTQA_MAX_STEPS: z.coerce.number().int().positive().default(40),
  NIGHTQA_MAX_SECONDS: z.coerce.number().positive().default(300),
  NIGHTQA_MAX_COST_USD: z.coerce.number().positive().default(0.5),
});

export interface AiEnv {
  readonly provider: Provider;
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly modelStrong: string;
  readonly modelCheap?: string;
  readonly priceInputPerMtok: number;
  readonly priceOutputPerMtok: number;
  /** Anthropic only: how hard the model thinks per step. */
  readonly effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  /** NVIDIA / OpenAI-compatible only. Anthropic models reject sampling parameters. */
  readonly temperature: number;
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
  const provider: Provider = env.NIGHTQA_PROVIDER === 'nvidia' ? 'nvidia' : 'anthropic';
  const keyName = provider === 'nvidia' ? 'NVIDIA_API_KEY' : 'ANTHROPIC_API_KEY';
  const apiKey = env[keyName];
  // Report every problem at once, including the ones zod does not know about.
  const issues = r.success ? [] : problems(r.error);
  if (!apiKey) issues.push(`${keyName}: is required for provider "${provider}"`);
  if (provider === 'anthropic') {
    if (env.NIGHTQA_PRICE_STRONG_INPUT_PER_MTOK === undefined) {
      issues.push(
        'NIGHTQA_PRICE_STRONG_INPUT_PER_MTOK: is required (USD per million input tokens of the strong model)',
      );
    }
    if (env.NIGHTQA_PRICE_STRONG_OUTPUT_PER_MTOK === undefined) {
      issues.push(
        'NIGHTQA_PRICE_STRONG_OUTPUT_PER_MTOK: is required (USD per million output tokens of the strong model)',
      );
    }
  }
  if (!r.success || issues.length > 0 || !apiKey) throw new EnvError(issues);
  const d = r.data;
  return {
    provider: d.NIGHTQA_PROVIDER,
    apiKey,
    baseUrl: d.NIGHTQA_BASE_URL ?? DEFAULT_BASE_URL[d.NIGHTQA_PROVIDER],
    modelStrong: d.NIGHTQA_MODEL_STRONG,
    ...(d.NIGHTQA_MODEL_CHEAP !== undefined ? { modelCheap: d.NIGHTQA_MODEL_CHEAP } : {}),
    priceInputPerMtok: d.NIGHTQA_PRICE_STRONG_INPUT_PER_MTOK ?? 0,
    priceOutputPerMtok: d.NIGHTQA_PRICE_STRONG_OUTPUT_PER_MTOK ?? 0,
    effort: d.NIGHTQA_EFFORT,
    temperature: d.NIGHTQA_TEMPERATURE,
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

const reportSchema = z.object({
  NIGHTQA_GITHUB_REPO: z.string().min(1).optional(),
  GITHUB_TOKEN: z.string().min(1).optional(),
  NIGHTQA_MIN_SEVERITY: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  NIGHTQA_FIX_PRS: z.enum(['auto', 'manual', 'off']).default('auto'),
  NIGHTQA_MAX_FIX_PRS: z.coerce.number().int().min(0).max(20).default(3),
  NIGHTQA_MAX_BUGS_PER_RUN: z.coerce.number().int().min(1).max(20).default(5),
  NIGHTQA_PUBLIC_URL: z.url({ error: 'must be a URL' }).optional(),
});

export interface ReportEnv {
  /** Without a repository bugs are proven and saved, but nothing is filed. */
  readonly repo?: string;
  readonly token?: string;
  readonly minSeverity: 'low' | 'medium' | 'high' | 'critical';
  readonly fixMode: 'auto' | 'manual' | 'off';
  readonly maxFixPerNight: number;
  readonly maxBugsPerRun: number;
  readonly evidenceBaseUrl?: string;
}

/** Reporting settings. A repository without a token is an error: the run would find bugs it cannot file. */
export function loadReportEnv(env: Env): ReportEnv {
  // A blank value in .env (as .env.example ships them) means "not set".
  const r = reportSchema.safeParse(
    Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v.trim() !== '')),
  );
  if (!r.success) throw new EnvError(problems(r.error));
  const d = r.data;
  if (d.NIGHTQA_GITHUB_REPO && !d.GITHUB_TOKEN) {
    throw new EnvError([
      'GITHUB_TOKEN: is required when NIGHTQA_GITHUB_REPO is set (a fine-grained token with Issues: read and write on that one repository)',
    ]);
  }
  return {
    ...(d.NIGHTQA_GITHUB_REPO ? { repo: d.NIGHTQA_GITHUB_REPO } : {}),
    ...(d.GITHUB_TOKEN ? { token: d.GITHUB_TOKEN } : {}),
    minSeverity: d.NIGHTQA_MIN_SEVERITY,
    fixMode: d.NIGHTQA_FIX_PRS,
    maxFixPerNight: d.NIGHTQA_MAX_FIX_PRS,
    maxBugsPerRun: d.NIGHTQA_MAX_BUGS_PER_RUN,
    ...(d.NIGHTQA_PUBLIC_URL ? { evidenceBaseUrl: d.NIGHTQA_PUBLIC_URL } : {}),
  };
}

const dbSchema = z.object({
  DATABASE_URL: z
    .string()
    .refine((u) => /^postgres(ql)?:\/\//.test(u), {
      error: 'must start with postgres:// or postgresql://',
    })
    .refine((u) => URL.canParse(u), { error: 'must be a valid URL' }),
  NIGHTQA_DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
  NIGHTQA_DB_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(500).max(60_000).default(5_000),
  NIGHTQA_DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(500).max(120_000).default(15_000),
});

export interface DbEnv {
  readonly url: string;
  readonly poolMax: number;
  readonly connectTimeoutMs: number;
  readonly statementTimeoutMs: number;
}

/** Database settings. No DATABASE_URL (or a blank one) means the file store is used, so this returns undefined. */
export function loadDbEnv(env: Env): DbEnv | undefined {
  if (!env.DATABASE_URL?.trim()) return undefined;
  const r = dbSchema.safeParse(
    Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v.trim() !== '')),
  );
  // Zod messages never echo the value, so a bad URL cannot leak its password here.
  if (!r.success) throw new EnvError(problems(r.error));
  return {
    url: r.data.DATABASE_URL,
    poolMax: r.data.NIGHTQA_DB_POOL_MAX,
    connectTimeoutMs: r.data.NIGHTQA_DB_CONNECT_TIMEOUT_MS,
    statementTimeoutMs: r.data.NIGHTQA_DB_STATEMENT_TIMEOUT_MS,
  };
}

/** The connection string with the password hidden, safe to print. */
export function redactDbUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return '(invalid database url)';
  }
}
