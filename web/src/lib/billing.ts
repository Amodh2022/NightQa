import type { RunView } from './results';
import { costByDay, isFinished, type FinishedRun } from './stats';

/** Finished runs that started in the same calendar month as `now`. */
export function runsThisMonth(runs: readonly RunView[], now: Date): FinishedRun[] {
  return runs.filter(isFinished).filter((r) => r.startedAt.getFullYear() === now.getFullYear() && r.startedAt.getMonth() === now.getMonth());
}

export interface WeekBucket {
  readonly label: string;
  readonly replay: number;
  readonly ai: number;
}

export interface MonthUsage {
  readonly runs: number;
  readonly replays: number;
  readonly aiRuns: number;
  readonly usd: number;
  readonly aiCalls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly maxRunUsd: number;
  /** Week 1 is days 1 to 7, and so on; week 5 is days 29 to 31. Only weeks up to today are listed. */
  readonly weeks: readonly WeekBucket[];
}

/** Totals for the month from real result.json files: replays use no AI, every other run is AI-assisted. */
export function summarizeMonth(runs: readonly RunView[], now: Date): MonthUsage {
  const month = runsThisMonth(runs, now);
  const count = Math.floor((now.getDate() - 1) / 7) + 1;
  const replay = Array.from({ length: count }, () => 0);
  const ai = Array.from({ length: count }, () => 0);
  let usd = 0;
  let aiCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let maxRunUsd = 0;
  for (const r of month) {
    usd += r.result.cost.usd;
    aiCalls += r.result.cost.calls;
    inputTokens += r.result.cost.inputTokens;
    outputTokens += r.result.cost.outputTokens;
    maxRunUsd = Math.max(maxRunUsd, r.result.cost.usd);
    const w = Math.min(count - 1, Math.floor((r.startedAt.getDate() - 1) / 7));
    const bucket = r.mode === 'replay' ? replay : ai;
    bucket[w] = (bucket[w] ?? 0) + 1;
  }
  const replays = replay.reduce((s, n) => s + n, 0);
  return {
    runs: month.length,
    replays,
    aiRuns: month.length - replays,
    usd,
    aiCalls,
    inputTokens,
    outputTokens,
    maxRunUsd,
    weeks: replay.map((n, i) => ({ label: `Wk ${String(i + 1)}`, replay: n, ai: ai[i] ?? 0 })),
  };
}

/** AI cost per night for the last `nights` nights ending today, oldest first. */
export function costPerNight(runs: readonly RunView[], now: Date, nights = 30): { key: string; usd: number }[] {
  return costByDay(runs, now, nights).map((d) => ({ key: d.key, usd: d.usd }));
}

/** SVG polyline points for a series, scaled to the largest value (at least `floor`), plus the closed area. */
export function chartPoints(values: readonly number[], width = 640, height = 180, floor = 0.01): { line: string; area: string; last: [number, number] | undefined } {
  const max = Math.max(floor, ...values);
  const pts = values.map((v, i): [number, number] => [
    Math.round(values.length < 2 ? width : i * (width / (values.length - 1))),
    Math.round(height - (v / max) * (height - 30)),
  ]);
  const line = pts.map((p) => p.join(',')).join(' ');
  return { line, area: `0,${String(height)} ${line} ${String(width)},${String(height)}`, last: pts[pts.length - 1] };
}

export interface FlowCost {
  readonly flow: string;
  readonly aiRuns: number;
  readonly avgUsd: number;
  readonly maxUsd: number;
  /** AI runs that spent at least the cap (the run was cut off by its budget). */
  readonly atCap: number;
}

/** Per flow, how much AI runs cost this month compared with the per-run cost cap. Replays are not counted. */
export function costVsCap(runs: readonly RunView[], now: Date, capUsd: number): FlowCost[] {
  const by = new Map<string, number[]>();
  for (const r of runsThisMonth(runs, now)) {
    if (r.mode === 'replay') continue;
    by.set(r.flow, [...(by.get(r.flow) ?? []), r.result.cost.usd]);
  }
  return [...by.entries()]
    .map(([flow, costs]) => ({
      flow,
      aiRuns: costs.length,
      avgUsd: costs.reduce((s, c) => s + c, 0) / costs.length,
      maxUsd: Math.max(...costs),
      atCap: costs.filter((c) => c >= capUsd).length,
    }))
    .sort((a, b) => b.avgUsd - a.avgUsd);
}
