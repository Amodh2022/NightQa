import { describe, expect, it } from 'vitest';
import { autonomyBody, autonomyRoute } from './autonomy-request';
import { chartPoints, costPerNight, costVsCap, summarizeMonth } from './billing';
import { isBlockedPath, parseCoverage, summarizeCoverage } from './coverage';
import { exploreFindings, findingsPerPersona } from './explore';
import { buildMatrix } from './profile-matrix';
import { explorationBody, profilesBody } from './profiles-request';
import { resultSchema, type RunResult, type RunView } from './results';
import { DEFAULT_SETTINGS } from './settings';
import type { BugRecord } from './bugs';

const base = {
  runId: 'r',
  flow: 'Checkout',
  verdict: 'pass',
  reason: '',
  steps: 3,
  durationSeconds: 10,
  cost: { calls: 2, inputTokens: 1000, outputTokens: 200, usd: 0.1 },
  stepResults: [],
  findings: [],
  finalUrl: '',
  promptVersion: 'v1',
  model: 'm',
  startedAt: '2026-10-22T10:00:00Z',
  url: 'http://x',
  flowSource: '',
};

function run(id: string, at: string, over: Record<string, unknown> = {}, mode: 'ai' | 'replay' = 'ai'): RunView {
  const result: RunResult = resultSchema.parse({ ...base, runId: id, startedAt: at, ...over });
  return { id, status: 'finished', mode, flow: result.flow, startedAt: new Date(at), result };
}

const NOW = new Date(2026, 9, 22, 12, 0, 0); // 22 Oct 2026, local time
const at = (d: number, h = 2): string => new Date(2026, 9, d, h).toISOString();

describe('resultSchema additions', () => {
  it('stays valid without the new fields and reads them when present', () => {
    expect(resultSchema.parse(base).profile).toBeUndefined();
    const r = resultSchema.parse({ ...base, profile: { network: 'slow-3g', screen: 'iphone' }, kind: 'explore', persona: 'careless-typer', visited: ['/a'], newPages: ['/a'] });
    expect(r.profile?.network).toBe('slow-3g');
    expect(r.newPages).toEqual(['/a']);
  });
});

describe('billing', () => {
  const runs = [
    run('a1', at(22), { cost: { calls: 3, inputTokens: 3000, outputTokens: 300, usd: 0.3 } }),
    run('a2', at(22, 5), { cost: { calls: 1, inputTokens: 100, outputTokens: 10, usd: 0.5 }, flow: 'Search' }),
    run('a3', at(21), { cost: { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 } }, 'replay'),
    run('a4', at(3), { cost: { calls: 1, inputTokens: 10, outputTokens: 5, usd: 0.05 } }),
    run('old', new Date(2026, 8, 30, 3).toISOString(), { cost: { calls: 1, inputTokens: 1, outputTokens: 1, usd: 9 } }),
  ];
  it('sums cost per night over 30 nights, oldest first, ignoring older days', () => {
    const n = costPerNight(runs, NOW, 30);
    expect(n).toHaveLength(30);
    expect(n[29]?.key).toBe('2026-10-22');
    expect(n[29]?.usd).toBeCloseTo(0.8);
    expect(n[28]?.usd).toBe(0);
    expect(n.find((d) => d.key === '2026-10-03')?.usd).toBeCloseTo(0.05);
    expect(n.find((d) => d.key === '2026-09-30')?.usd).toBe(9); // last month, still inside the 30 nights
    expect(n.reduce((s, d) => s + d.usd, 0)).toBeCloseTo(9.85);
  });
  it('splits the month into replay and AI-assisted by week, with tokens', () => {
    const m = summarizeMonth(runs, NOW);
    expect(m.runs).toBe(4);
    expect(m.replays).toBe(1);
    expect(m.aiRuns).toBe(3);
    expect(m.usd).toBeCloseTo(0.85);
    expect(m.inputTokens).toBe(3110);
    expect(m.outputTokens).toBe(315);
    expect(m.maxRunUsd).toBe(0.5);
    expect(m.weeks.map((w) => w.label)).toEqual(['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4']);
    expect(m.weeks[0]).toEqual({ label: 'Wk 1', replay: 0, ai: 1 });
    expect(m.weeks[2]).toEqual({ label: 'Wk 3', replay: 1, ai: 0 }); // 21 Oct
    expect(m.weeks[3]).toEqual({ label: 'Wk 4', replay: 0, ai: 2 }); // 22 Oct
  });
  it('compares AI runs with the cap per flow and skips replays', () => {
    const c = costVsCap(runs, NOW, 0.5);
    expect(c.map((x) => x.flow)).toEqual(['Search', 'Checkout']);
    expect(c[0]).toMatchObject({ aiRuns: 1, atCap: 1, maxUsd: 0.5 });
    expect(c[1]).toMatchObject({ aiRuns: 2, atCap: 0 });
  });
  it('draws a flat line for no data without dividing by zero', () => {
    const p = chartPoints([0, 0, 0]);
    expect(p.line).toBe('0,180 320,180 640,180');
    expect(p.last).toEqual([640, 180]);
  });
});

describe('profile matrix', () => {
  const runs = [
    run('n1', at(22, 4), { flow: 'Checkout', verdict: 'bug', profile: { network: 'slow-3g', screen: 'android-small' } }),
    run('n2', at(22, 3), { flow: 'Checkout' }),
    run('n3', at(21), { flow: 'Checkout', verdict: 'pass' }),
    run('n4', at(21), { flow: 'Search', flaky: true }),
    run('x1', at(22, 5), { flow: 'Explore: careless-typer', kind: 'explore', persona: 'careless-typer' }),
  ];
  it('uses the latest run per flow and profile, and treats a missing profile as the default', () => {
    const m = buildMatrix(runs, ['Checkout', 'Search', 'Refund']);
    expect(m.columns).toEqual([
      { network: 'none', screen: 'desktop' },
      { network: 'slow-3g', screen: 'android-small' },
    ]);
    expect(m.rows[0]?.cells).toEqual([
      { runId: 'n2', kind: 'pass' },
      { runId: 'n1', kind: 'bug' },
    ]);
    expect(m.rows[1]?.cells).toEqual([{ runId: 'n4', kind: 'flaky' }, undefined]);
    expect(m.rows[2]?.cells).toEqual([undefined, undefined]);
  });
  it('shows configured profiles even before they have run, and leaves exploration out', () => {
    const m = buildMatrix(runs, ['Checkout'], [{ network: 'fast-4g', screen: 'tablet' }]);
    expect(m.columns[0]).toEqual({ network: 'fast-4g', screen: 'tablet' });
    expect(m.rows[0]?.cells[0]).toBeUndefined();
    expect(buildMatrix(runs, ['Explore: careless-typer']).rows[0]?.cells.every((c) => c === undefined)).toBe(true);
  });
  it('caps the number of columns', () => {
    expect(buildMatrix(runs, [], [], 1).columns).toHaveLength(1);
  });
});

describe('coverage', () => {
  const good = JSON.stringify({
    version: 1,
    pages: {
      '/': { firstSeen: '2026-10-20T00:00:00Z', lastSeen: '2026-10-22T00:00:00Z', visits: 4 },
      '/cart': { firstSeen: '2026-10-22T00:00:00Z', lastSeen: '2026-10-22T01:00:00Z', visits: 1 },
      '/admin/users': { firstSeen: '2026-10-21T00:00:00Z', lastSeen: '2026-10-21T00:00:00Z', visits: 1 },
    },
  });
  it('is empty for a missing, broken, wrong-version or empty file', () => {
    expect(parseCoverage(undefined)).toBeUndefined();
    expect(parseCoverage('{nope')).toBeUndefined();
    expect(parseCoverage('{"version":2,"pages":{}}')).toBeUndefined();
    expect(parseCoverage('{"version":1,"pages":{}}')).toBeUndefined();
    expect(parseCoverage('{"version":1,"pages":{"/a":{"visits":"x"}}}')).toBeUndefined();
  });
  it('summarizes visited, new and blocked pages, most recent first, with no percentage', () => {
    const s = summarizeCoverage(parseCoverage(good), ['/cart'], ['/admin/*']);
    expect(s.total).toBe(3);
    expect(s.newCount).toBe(1);
    expect(s.tiles.map((t) => [t.path, t.state])).toEqual([
      ['/cart', 'new'],
      ['/', 'visited'],
      ['/admin/users', 'blocked'],
    ]);
    expect('percent' in s).toBe(false);
    expect(summarizeCoverage(undefined, [], [])).toEqual({ total: 0, newCount: 0, tiles: [] });
  });
  it('matches blocked entries by path prefix, not by accident', () => {
    expect(isBlockedPath('/admin', ['/admin'])).toBe(true);
    expect(isBlockedPath('/administrator', ['/admin'])).toBe(false);
    expect(isBlockedPath('/billing/x', ['/billing/*'])).toBe(true);
  });
});

describe('exploration findings', () => {
  const bug = (id: string, runId: string, createdAt: string): BugRecord => ({
    version: 1, id, runId, flow: 'Explore: careless-typer', title: 'T', severity: 'high', status: 'reported', statusNote: '', reproduced: 3, attempts: 3,
    recipe: [], expected: '', actual: '', evidence: [], createdAt, updatedAt: createdAt,
  });
  it('keeps only bugs from exploration runs and counts them per persona', () => {
    const runs = [run('x1', at(22), { kind: 'explore', persona: 'careless-typer' }), run('f1', at(22))];
    const f = exploreFindings([bug('bug-000000000001', 'x1', at(22)), bug('bug-000000000002', 'f1', at(22)), bug('bug-000000000003', 'x1', at(1))], runs);
    expect(f).toHaveLength(2);
    expect(findingsPerPersona(f, new Date(2026, 9, 15)).get('careless-typer')).toBe(1);
  });
});

describe('settings request validation', () => {
  it('accepts level, pause and lists, and rejects auto-merge levels and unknown keys', () => {
    expect(autonomyBody.safeParse({ level: 'L2' }).success).toBe(true);
    expect(autonomyBody.safeParse({ paused: true, blockedPaths: ['/admin'] }).success).toBe(true);
    expect(autonomyBody.safeParse({ level: 'L3' }).success).toBe(false);
    expect(autonomyBody.safeParse({ autoMerge: true }).success).toBe(false);
    expect(autonomyBody.safeParse({}).success).toBe(false);
    expect(autonomyBody.safeParse({ blockedActions: [''] }).success).toBe(false);
  });
  it('builds a patch that de-duplicates lists and only touches what was sent', () => {
    const patch = autonomyRoute.toPatch({ blockedPaths: ['/a', '/a', '/b'], paused: false });
    expect(patch).toEqual({ autonomy: { paused: false, blockedPaths: ['/a', '/b'] } });
    expect(autonomyRoute.describe({ level: 'L0', paused: true }, DEFAULT_SETTINGS)).toBe('level L1 to L0; paused all runs');
  });
  it('validates profiles and exploration bodies', () => {
    expect(profilesBody.safeParse({ network: 'slow-3g', screen: 'iphone', perFlow: { 'flows/a.yaml': { network: 'none', screen: 'tablet' } } }).success).toBe(true);
    expect(profilesBody.safeParse({ network: 'dialup', screen: 'iphone', perFlow: {} }).success).toBe(false);
    expect(profilesBody.safeParse({ network: 'none', screen: 'desktop', perFlow: { '../etc/passwd': { network: 'none', screen: 'desktop' } } }).success).toBe(false);
    expect(explorationBody.safeParse({ enabled: true, personas: ['careless-typer'], maxSteps: 30 }).success).toBe(true);
    expect(explorationBody.safeParse({ enabled: true, personas: ['nope'], maxSteps: 30 }).success).toBe(false);
    expect(explorationBody.safeParse({ enabled: true, personas: [], maxSteps: 2 }).success).toBe(false);
  });
});
