import type { Verdict } from './verdict.js';

export interface EvalCaseResult {
  readonly id: string;
  /** "bug": the shop has one seeded bug and the flow should find it. "clean": no bugs, nothing should be reported. */
  readonly kind: 'bug' | 'clean';
  readonly bugId?: string;
  readonly verdict: Verdict;
}

export interface EvalMetrics {
  readonly seededBugs: number;
  readonly bugsFound: number;
  readonly reports: number;
  readonly correctReports: number;
  /** Correct reports / all reports (1 when nothing was reported). */
  readonly precision: number;
  /** Seeded bugs found / seeded bugs. */
  readonly recall: number;
}

const round = (n: number): number => Math.round(n * 1000) / 1000;

/** Precision and recall of bug reports against the zoo's answer key. */
export function computeMetrics(
  results: readonly EvalCaseResult[],
  seededBugs: number,
): EvalMetrics {
  const reports = results.filter((r) => r.verdict === 'bug');
  const correct = reports.filter((r) => r.kind === 'bug');
  const found = new Set(correct.map((r) => r.bugId).filter((id): id is string => id !== undefined));
  return {
    seededBugs,
    bugsFound: found.size,
    reports: reports.length,
    correctReports: correct.length,
    precision: reports.length === 0 ? 1 : round(correct.length / reports.length),
    recall: seededBugs === 0 ? 1 : round(found.size / seededBugs),
  };
}

export interface Baseline {
  readonly precision: number;
  readonly recall: number;
}

/** CI gate: fails when precision or recall drops below the committed baseline. */
export function compareToBaseline(
  m: Pick<EvalMetrics, 'precision' | 'recall'>,
  baseline: Baseline,
): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  if (m.precision < baseline.precision)
    failures.push(
      `precision ${String(m.precision)} is below baseline ${String(baseline.precision)}`,
    );
  if (m.recall < baseline.recall)
    failures.push(`recall ${String(m.recall)} is below baseline ${String(baseline.recall)}`);
  return { ok: failures.length === 0, failures };
}
