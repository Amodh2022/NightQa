import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { z } from 'zod';
import { resultsDir } from './paths';

export const verdictSchema = z.enum(['pass', 'bug', 'app_changed', 'needs_setup', 'agent_stuck']);
export type Verdict = z.infer<typeof verdictSchema>;

const stepResultSchema = z.object({
  index: z.number(),
  text: z.string(),
  expect: z.string().optional(),
  status: z.enum(['pending', 'passed', 'failed', 'unclear']),
  statement: z.string().optional(),
  evidence: z.string().optional(),
  screenshot: z.string().optional(),
});

const findingSchema = z.object({ kind: z.string(), message: z.string(), stepIndex: z.number(), url: z.string() });

/** Shape of the engine's result.json (see src/core/agent/loop.ts RunResult plus run metadata). */
export const resultSchema = z.object({
  runId: z.string(),
  flow: z.string(),
  verdict: verdictSchema,
  reason: z.string(),
  steps: z.number(),
  durationSeconds: z.number(),
  cost: z.object({ calls: z.number(), inputTokens: z.number(), outputTokens: z.number(), usd: z.number() }),
  stepResults: z.array(stepResultSchema),
  findings: z.array(findingSchema),
  finalUrl: z.string(),
  promptVersion: z.string(),
  model: z.string(),
  startedAt: z.string(),
  url: z.string(),
  flowSource: z.string(),
  artifacts: z
    .object({ video: z.string().optional(), trace: z.string().optional(), screenshots: z.array(z.string()).default([]) })
    .default({ screenshots: [] }),
  attempts: z.number().optional(),
  flaky: z.boolean().optional(),
  /** Device conditions the run used. Absent on runs from before profiles existed (those ran with the defaults). */
  profile: z.object({ network: z.string(), screen: z.string() }).optional(),
  /** "explore" for `nightqa explore` runs; absent for flow runs. */
  kind: z.string().optional(),
  persona: z.string().optional(),
  /** Page paths an exploration run visited, and the ones it had never seen before. */
  visited: z.array(z.string()).optional(),
  newPages: z.array(z.string()).optional(),
});
export type RunResult = z.infer<typeof resultSchema>;
export type StepResult = z.infer<typeof stepResultSchema>;
export type Finding = z.infer<typeof findingSchema>;

export const jobSchema = z.object({
  flowName: z.string(),
  flowFile: z.string(),
  mode: z.enum(['run', 'replay']),
  startedAt: z.string(),
  pid: z.number().optional(),
  /** Who started it from the dashboard (GitHub login), for the activity record. */
  startedBy: z.string().optional(),
});
export type Job = z.infer<typeof jobSchema>;

export type RunStatus = 'finished' | 'running' | 'crashed';

export interface RunView {
  readonly id: string;
  readonly status: RunStatus;
  /** "replay" runs use no AI. */
  readonly mode: 'ai' | 'replay';
  readonly flow: string;
  readonly startedAt: Date;
  readonly result?: RunResult;
  readonly job?: Job;
}

const ID = /^[0-9A-Za-z_-]{6,64}$/;
export const isRunId = (s: string): boolean => ID.test(s);

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return undefined;
  }
}

export function pidAlive(pid: number | undefined): boolean {
  if (pid === undefined) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Decides what a run folder is: finished (has result.json), running (its process is alive), or crashed. */
export function deriveStatus(opts: { hasResult: boolean; pid?: number; logAgeMs?: number }): RunStatus {
  if (opts.hasResult) return 'finished';
  if (opts.pid !== undefined) return pidAlive(opts.pid) ? 'running' : 'crashed';
  // started outside the dashboard: judge by how recently it wrote its log
  return opts.logAgeMs !== undefined && opts.logAgeMs < 15 * 60_000 ? 'running' : 'crashed';
}

export async function getRun(id: string, root: string = resultsDir()): Promise<RunView | undefined> {
  if (!isRunId(id)) return undefined;
  const dir = join(root, id);
  const rawResult = await readJson(join(dir, 'result.json'));
  const parsed = resultSchema.safeParse(rawResult);
  const rawJob = await readJson(join(dir, 'job.json'));
  const job = jobSchema.safeParse(rawJob);
  const jobData = job.success ? job.data : undefined;
  if (!parsed.success && !jobData) {
    // a CLI run started by hand: only run.jsonl exists
    const log = await stat(join(dir, 'run.jsonl')).catch(() => undefined);
    if (!log) return undefined;
    return {
      id,
      status: deriveStatus({ hasResult: false, logAgeMs: Date.now() - log.mtimeMs }),
      mode: 'ai',
      flow: '(run started from the command line)',
      startedAt: log.birthtime,
    };
  }
  const result = parsed.success ? parsed.data : undefined;
  return {
    id,
    status: deriveStatus({ hasResult: result !== undefined, ...(jobData?.pid !== undefined ? { pid: jobData.pid } : {}) }),
    mode: result ? (result.promptVersion.startsWith('replay') ? 'replay' : 'ai') : jobData?.mode === 'replay' ? 'replay' : 'ai',
    flow: result?.flow ?? jobData?.flowName ?? id,
    startedAt: new Date(result?.startedAt ?? jobData?.startedAt ?? Date.now()),
    ...(result ? { result } : {}),
    ...(jobData ? { job: jobData } : {}),
  };
}

/** Every run in the results folder, newest first. */
export async function listRuns(root: string = resultsDir()): Promise<RunView[]> {
  const names = await readdir(root).catch(() => [] as string[]);
  const runs = await Promise.all(names.filter(isRunId).map((n) => getRun(n, root)));
  return runs
    .filter((r): r is RunView => r !== undefined)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
}

export interface LogEvent {
  readonly event: string;
  readonly [key: string]: unknown;
}

/** Parses run.jsonl, skipping lines that are not valid JSON. */
export function parseLog(text: string): LogEvent[] {
  const out: LogEvent[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line) as unknown;
      if (j && typeof j === 'object' && 'event' in j && typeof (j as { event: unknown }).event === 'string') out.push(j as LogEvent);
    } catch {
      /* ignore partial last line while a run is still writing */
    }
  }
  return out;
}

export async function readLog(id: string, root: string = resultsDir()): Promise<LogEvent[]> {
  if (!isRunId(id)) return [];
  return parseLog(await readFile(join(root, id, 'run.jsonl'), 'utf8').catch(() => ''));
}

export async function readCliLog(id: string, root: string = resultsDir()): Promise<string> {
  if (!isRunId(id)) return '';
  return (await readFile(join(root, id, 'cli.log'), 'utf8').catch(() => '')).slice(-1500);
}

const SERVABLE = /\.(webm|png|zip|json|jsonl|log)$/i;

/** Maps a path inside a run folder to an absolute file, refusing anything that escapes it. */
export function resolveEvidence(id: string, rel: string, root: string = resultsDir()): string | undefined {
  if (!isRunId(id) || !SERVABLE.test(rel)) return undefined;
  const base = resolve(root, id);
  const full = resolve(base, rel);
  return full.startsWith(base + sep) ? full : undefined;
}

/** The AI calls in a run, in order, from the structured log. */
export interface AiStep {
  readonly step: number;
  readonly stepIndex: number;
  readonly tool: string | null;
  readonly reasoning: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
}

export function aiSteps(log: readonly LogEvent[]): AiStep[] {
  return log
    .filter((e) => e.event === 'ai_call')
    .map((e) => ({
      step: Number(e.step ?? 0),
      stepIndex: Number(e.stepIndex ?? 0),
      tool: typeof e.tool === 'string' ? e.tool : null,
      reasoning: typeof e.reasoning === 'string' ? e.reasoning : '',
      inputTokens: Number(e.inputTokens ?? 0),
      outputTokens: Number(e.outputTokens ?? 0),
      costUsd: Number(e.costUsd ?? 0),
    }));
}
