import { z } from 'zod';
import { readJson, updateJson } from './store';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'use HH:MM, 24 hour');
const severity = z.enum(['low', 'medium', 'high', 'critical']);

export const NETWORKS = ['none', 'fast-4g', 'slow-4g', 'fast-3g', 'slow-3g'] as const;
export const SCREENS = ['desktop', 'laptop', 'tablet', 'iphone', 'android-small', 'android'] as const;
export const PERSONAS = ['first-time-buyer', 'returning-user', 'careless-typer', 'impatient-clicker', 'keyboard-only'] as const;

export const settingsSchema = z.object({
  version: z.literal(1),
  app: z.object({
    name: z.string().trim().min(1).max(60),
    /** Staging URL. Blank means "use NIGHTQA_TARGET_URL from the server environment". Checked by the engine too. */
    targetUrl: z.string().trim().max(300),
  }),
  budgets: z.object({
    maxSteps: z.number().int().min(5).max(200),
    maxSeconds: z.number().int().min(30).max(1800),
    maxCostUsd: z.number().min(0.01).max(20),
  }),
  schedule: z.object({
    nightlyEnabled: z.boolean(),
    nightlyTime: hhmm,
    timezone: z.string().min(1).max(60),
    morningReportTime: hhmm,
    quietNight: z.enum(['all_clear', 'nothing']),
  }),
  github: z.object({
    /** owner/name. The token lives in the vault, never here. */
    repo: z.string().trim().max(140),
    minSeverity: severity,
    maxFixPerNight: z.number().int().min(0).max(20),
  }),
  autonomy: z.object({
    /** L0 report only, L1 open issues, L2 issues plus fix requests. L3 (auto-merge) is not available: nothing merges without a human. */
    level: z.enum(['L0', 'L1', 'L2']),
    paused: z.boolean(),
    blockedPaths: z.array(z.string().trim().min(1).max(200)).max(50),
    blockedActions: z.array(z.string().trim().min(1).max(200)).max(50),
  }),
  notifications: z.object({
    email: z.object({ enabled: z.boolean(), to: z.array(z.string().trim().max(200)).max(20) }),
    slack: z.object({ enabled: z.boolean() }),
    webhook: z.object({ enabled: z.boolean() }),
    criticalImmediately: z.boolean(),
  }),
  profiles: z.object({
    network: z.enum(NETWORKS),
    screen: z.enum(SCREENS),
    /** Flow file (relative to the repo) -> profile that flow uses instead of the default. */
    perFlow: z.record(z.string(), z.object({ network: z.enum(NETWORKS), screen: z.enum(SCREENS) })),
  }),
  exploration: z.object({
    enabled: z.boolean(),
    personas: z.array(z.enum(PERSONAS)).max(PERSONAS.length),
    maxSteps: z.number().int().min(5).max(100),
  }),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  app: { name: 'My app', targetUrl: '' },
  budgets: { maxSteps: 40, maxSeconds: 300, maxCostUsd: 0.5 },
  schedule: { nightlyEnabled: false, nightlyTime: '02:00', timezone: 'Asia/Kolkata', morningReportTime: '08:00', quietNight: 'all_clear' },
  github: { repo: '', minSeverity: 'medium', maxFixPerNight: 3 },
  autonomy: { level: 'L1', paused: false, blockedPaths: ['/admin', '/billing'], blockedActions: ['delete account', 'email all users'] },
  notifications: { email: { enabled: false, to: [] }, slack: { enabled: false }, webhook: { enabled: false }, criticalImmediately: true },
  profiles: { network: 'none', screen: 'desktop', perFlow: {} },
  exploration: { enabled: false, personas: ['first-time-buyer'], maxSteps: 30 },
};

const FILE = 'settings.json';

export function getSettings(dir?: string): Promise<Settings> {
  return readJson(FILE, settingsSchema, DEFAULT_SETTINGS, dir);
}

/** Merges a partial change into the saved settings and validates the result. Throws a ZodError if it is invalid. */
export async function saveSettings(patch: DeepPartial<Settings>, dir?: string): Promise<Settings> {
  return updateJson(
    FILE,
    settingsSchema,
    DEFAULT_SETTINGS,
    (current) => settingsSchema.parse(mergeDeep(current, patch)),
    dir,
  );
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends readonly unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K] };

function mergeDeep<T>(base: T, patch: unknown): T {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return (patch === undefined ? base : patch) as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch)) {
    // the per-flow map is replaced as a whole so an entry can be removed
    out[k] = v !== null && typeof v === 'object' && !Array.isArray(v) && k !== 'perFlow' ? mergeDeep(out[k], v) : v;
  }
  return out as T;
}

/** Autonomy level -> what the engine may do (see docs/adr/0007). */
export function reportingFor(level: Settings['autonomy']['level']): { file: boolean; fixMode: 'auto' | 'manual' | 'off' } {
  if (level === 'L0') return { file: false, fixMode: 'off' };
  if (level === 'L1') return { file: true, fixMode: 'manual' };
  return { file: true, fixMode: 'auto' };
}
