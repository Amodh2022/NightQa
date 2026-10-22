import { describe, expect, it } from 'vitest';
import type { BugRecord } from './bugs';
import { buildReport, clean, criticalAlert, previewWindow, testReport, type BuildReportInput } from './report';
import type { RunResult, RunView, Verdict } from './results';

const now = new Date('2026-10-22T02:30:00Z'); // 08:00 IST
const since = new Date('2026-10-21T02:30:00Z');

function run(id: string, flow: string, verdict: Verdict, startedAt = '2026-10-21T20:30:00Z', reason = 'ok'): RunView {
  const result = { runId: id, flow, verdict, reason, steps: 3, durationSeconds: 60, startedAt, findings: [], stepResults: [] } as unknown as RunResult;
  return { id, status: 'finished', mode: 'ai', flow, startedAt: new Date(startedAt), result };
}

function bug(over: Partial<BugRecord>): BugRecord {
  return {
    version: 1,
    id: 'bug-aaaaaaaaaaaa',
    runId: 'run1',
    flow: 'Checkout',
    title: 'Expired coupon is accepted',
    severity: 'high',
    status: 'reported',
    statusNote: '',
    reproduced: 3,
    attempts: 3,
    recipe: [],
    expected: '',
    actual: '',
    evidence: [],
    createdAt: '2026-10-21T21:00:00Z',
    updatedAt: '2026-10-21T21:00:00Z',
    ...over,
  };
}

const input = (over: Partial<BuildReportInput>): BuildReportInput => ({ runs: [], bugs: [], appName: 'ShopKart staging', now, since, timeZone: 'Asia/Kolkata', quietNight: 'all_clear', ...over });

describe('buildReport', () => {
  it('counts only real flows and bugs, as in the design', () => {
    const runs = [run('r1', 'Checkout', 'bug'), run('r2', 'Login', 'pass'), run('r3', 'Refund', 'needs_setup', '2026-10-21T21:30:00Z', 'test account is locked')];
    const bugs = [
      bug({ issue: { number: 142, url: 'https://github.com/o/r/issues/142', state: 'open', action: 'created' }, pull: { number: 143, url: 'https://github.com/o/r/pull/143', state: 'open' } }),
      bug({ id: 'bug-bbbbbbbbbbbb', severity: 'medium', title: 'Photo upload fails', issue: { number: 144, url: 'https://github.com/o/r/issues/144', state: 'open', action: 'created' } }),
    ];
    const r = buildReport(input({ runs, bugs }));
    expect(r.kind).toBe('report');
    expect(r.subject).toBe('ShopKart staging · 2 new bugs confirmed, 1 fix PR ready, 1 flow needs setup');
    expect(r.summary[0]).toBe('1 of 3 flows passed · 22 Oct');
    expect(r.items.map((i) => i.tag)).toEqual(['HIGH', 'MED', 'SETUP']);
    expect(r.items[0]?.refs).toBe('Issue #142 · PR #143');
    expect(r.items[0]?.url).toBe('https://github.com/o/r/pull/143');
    expect(r.items[2]?.refs).toBe('Not counted as a bug');
    expect(r.headline).toEqual(['2 bugs proven.', '1 fix waiting.']);
  });

  it('latest run of a flow wins', () => {
    const runs = [run('r1', 'Checkout', 'bug', '2026-10-21T20:00:00Z'), run('r2', 'Checkout', 'pass', '2026-10-21T21:00:00Z')];
    expect(buildReport(input({ runs })).counts).toMatchObject({ flowsPassed: 1, flowsTotal: 1 });
  });

  it('ignores runs outside the window and runs that have not finished', () => {
    const old = run('r0', 'Old', 'pass', '2026-10-01T00:00:00Z');
    const running: RunView = { id: 'r9', status: 'running', mode: 'ai', flow: 'Live', startedAt: new Date('2026-10-22T02:00:00Z') };
    expect(buildReport(input({ runs: [old, running] })).kind).toBe('no_runs');
  });

  it('does not call an old bug new, and mentions merged PRs', () => {
    const runs = [run('r1', 'Checkout', 'pass')];
    const old = bug({ createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-21T10:00:00Z', pull: { number: 138, url: 'https://github.com/o/r/pull/138', state: 'merged' } });
    const r = buildReport(input({ runs, bugs: [old] }));
    expect(r.counts.newBugs).toBe(0);
    expect(r.counts.prsMerged).toBe(1);
    expect(r.notes).toContain('PR #138 was merged.');
    expect(r.kind).toBe('report');
  });

  it('a quiet night is an all-clear, or nothing when the user chose that', () => {
    const runs = [run('r1', 'A', 'pass'), run('r2', 'B', 'pass')];
    const r = buildReport(input({ runs }));
    expect(r.kind).toBe('all_clear');
    expect(r.summary[0]).toBe('All clear. 2 of 2 flows passed.');
    expect(r.send).toBe(true);
    expect(buildReport(input({ runs, quietNight: 'nothing' })).send).toBe(false);
  });

  it('with no runs there is nothing to send and no invented numbers', () => {
    const r = buildReport(input({}));
    expect(r.kind).toBe('no_runs');
    expect(r.send).toBe(false);
    expect(r.counts.flowsTotal).toBe(0);
  });

  it('ignores discarded bugs and refuses non-GitHub links', () => {
    const runs = [run('r1', 'A', 'bug')];
    const bugs = [bug({ status: 'discarded' }), bug({ id: 'bug-cccccccccccc', pull: { number: 1, url: 'https://evil.example/x', state: 'open' } })];
    const r = buildReport(input({ runs, bugs }));
    expect(r.counts.newBugs).toBe(1);
    expect(r.items.every((i) => i.url === undefined)).toBe(true);
  });

  it('caps the list and says how many more there are', () => {
    const runs = Array.from({ length: 12 }, (_, i) => run(`r${String(i)}`, `Flow ${String(i)}`, 'needs_setup'));
    const r = buildReport(input({ runs }));
    expect(r.items).toHaveLength(8);
    expect(r.notes.join(' ')).toContain('4 more');
  });
});

describe('clean', () => {
  it('flattens control characters and newlines and caps length', () => {
    expect(clean('a\nb\u0000c\t d')).toBe('a b c d');
    expect(clean('x'.repeat(300), 10)).toHaveLength(10);
  });
});

describe('criticalAlert and testReport', () => {
  it('builds the immediate alert from the bug record', () => {
    const a = criticalAlert(bug({ severity: 'critical', title: 'Payment cannot be completed', test: { file: 'f', repoPath: 'p', proven: true } }), 'ShopKart', now, 'Asia/Kolkata');
    expect(a.kind).toBe('critical');
    expect(a.subject).toBe('ShopKart · CRITICAL: Payment cannot be completed');
    expect(a.summary[0]).toContain('Reproduced 3 of 3');
    expect(a.summary[0]).toContain('failing test attached');
  });
  it('labels a test message and carries no data', () => {
    const t = testReport('slack', 'ShopKart', now, 'UTC');
    expect(t.subject.startsWith('[TEST]')).toBe(true);
    expect(t.items).toEqual([]);
  });
});

describe('previewWindow', () => {
  it('uses the last 24 hours when runs are recent', () => {
    const w = previewWindow([run('r1', 'A', 'pass', '2026-10-21T20:00:00Z')], now);
    expect(w.asOf).toEqual(now);
  });
  it('falls back to the latest night when nothing is recent', () => {
    const w = previewWindow([run('r1', 'A', 'pass', '2026-09-01T20:00:00Z')], now);
    expect(w.asOf.getTime()).toBeLessThan(now.getTime());
    expect(w.since.getTime()).toBeLessThan(new Date('2026-09-01T20:00:00Z').getTime());
  });
});
