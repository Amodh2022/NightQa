import { describe, expect, it } from 'vitest';
import { compareToBaseline, computeMetrics, type EvalCaseResult } from './eval-metrics.js';

const r = (
  id: string,
  kind: 'bug' | 'clean',
  verdict: EvalCaseResult['verdict'],
  bugId?: string,
): EvalCaseResult => ({
  id,
  kind,
  verdict,
  ...(bugId ? { bugId } : {}),
});

describe('computeMetrics', () => {
  it('computes precision and recall against the answer key', () => {
    const m = computeMetrics(
      [
        r('a', 'bug', 'bug', 'B01'),
        r('b', 'bug', 'agent_stuck', 'B02'),
        r('c', 'bug', 'bug', 'B03'),
        r('d', 'clean', 'bug'),
      ],
      10,
    );
    expect(m).toMatchObject({
      reports: 3,
      correctReports: 2,
      bugsFound: 2,
      precision: 0.667,
      recall: 0.2,
    });
  });
  it('counts a bug once even if two cases find it', () => {
    expect(
      computeMetrics([r('a', 'bug', 'bug', 'B01'), r('b', 'bug', 'bug', 'B01')], 10).bugsFound,
    ).toBe(1);
  });
  it('has precision 1 when nothing was reported, and never counts needs_setup or stuck as reports', () => {
    const m = computeMetrics([r('a', 'bug', 'needs_setup', 'B01'), r('b', 'clean', 'pass')], 10);
    expect(m).toMatchObject({ reports: 0, precision: 1, recall: 0 });
  });
});

describe('compareToBaseline', () => {
  it('passes at or above baseline', () => {
    expect(compareToBaseline({ precision: 1, recall: 0.3 }, { precision: 1, recall: 0.3 }).ok).toBe(
      true,
    );
    expect(
      compareToBaseline({ precision: 1, recall: 0.5 }, { precision: 0.9, recall: 0.3 }).ok,
    ).toBe(true);
  });
  it('fails when either metric drops, naming it', () => {
    const c = compareToBaseline({ precision: 0.8, recall: 0.1 }, { precision: 0.9, recall: 0.3 });
    expect(c.ok).toBe(false);
    expect(c.failures).toHaveLength(2);
    expect(c.failures[0]).toContain('precision');
  });
});
