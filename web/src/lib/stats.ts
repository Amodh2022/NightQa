import { dayKey, startOfDay } from './format';
import type { RunResult, RunView, Verdict } from './results';

export type FinishedRun = RunView & { readonly result: RunResult };

export const isFinished = (r: RunView): r is FinishedRun => r.status === 'finished' && r.result !== undefined;

/** Latest finished run for each flow name. `runs` must be newest first (as listRuns returns them). */
export function latestPerFlow(runs: readonly RunView[]): Map<string, FinishedRun> {
  const out = new Map<string, FinishedRun>();
  for (const r of runs) if (isFinished(r) && !out.has(r.flow)) out.set(r.flow, r);
  return out;
}

/** Flows whose latest run found a bug. Drives the badge in the top bar. */
export function openBugCount(runs: readonly RunView[]): number {
  return [...latestPerFlow(runs).values()].filter((r) => r.result.verdict === 'bug').length;
}

export interface DayGroup {
  readonly key: string;
  readonly date: Date;
  readonly runs: RunView[];
}

/** Groups runs by calendar day, newest day first. */
export function groupByDay(runs: readonly RunView[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const r of runs) {
    const key = dayKey(r.startedAt);
    const g = map.get(key) ?? { key, date: startOfDay(r.startedAt), runs: [] };
    g.runs.push(r);
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function verdictCounts(runs: readonly RunView[]): Record<Verdict, number> {
  const c: Record<Verdict, number> = { pass: 0, bug: 0, app_changed: 0, needs_setup: 0, agent_stuck: 0 };
  for (const r of runs) if (isFinished(r)) c[r.result.verdict]++;
  return c;
}

/** One entry per calendar day for the last `days` days ending at `now`, oldest first. */
export function lastDays(now: Date, days: number): Date[] {
  const today = startOfDay(now);
  return Array.from({ length: days }, (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1 - i)));
}

export function costByDay(runs: readonly RunView[], now: Date, days = 7): { key: string; date: Date; usd: number }[] {
  return lastDays(now, days).map((date) => ({
    key: dayKey(date),
    date,
    usd: runs.filter((r) => isFinished(r) && dayKey(r.startedAt) === dayKey(date)).reduce((s, r) => s + (r.result?.cost.usd ?? 0), 0),
  }));
}

/** Counts of finished runs per day matching `pick`, for sparklines. */
export function countByDay(runs: readonly RunView[], now: Date, pick: (r: FinishedRun) => boolean, days = 7): number[] {
  return lastDays(now, days).map((date) => runs.filter((r): r is FinishedRun => isFinished(r) && dayKey(r.startedAt) === dayKey(date) && pick(r)).length);
}

/**
 * One tick per step for the run list: o passed, b failed (bug), s stuck or unclear, v needs setup, i not run.
 * A step that did not finish takes the color of the run's verdict.
 */
export function stepTicks(result: RunResult): string {
  return result.stepResults
    .map((s) => {
      if (s.status === 'passed') return 'o';
      if (s.status === 'failed') return 'b';
      if (s.status === 'unclear') return 's';
      return result.verdict === 'needs_setup' ? 'v' : 'i';
    })
    .join('');
}

/** "Expectation failed", "JS error" ... for finding kinds. */
export const FINDING_LABELS: Record<string, string> = {
  'expectation-failed': 'Expectation failed',
  'js-error': 'JS error',
  'http-5xx': 'Server error',
  'blank-page': 'Blank page',
  spinner: 'Endless spinner',
  'dead-link': 'Dead link',
  'console-error': 'Console error',
};

export const findingLabel = (kind: string): string => FINDING_LABELS[kind] ?? kind;

export function shortId(id: string): string {
  return id.slice(-6).toUpperCase();
}
