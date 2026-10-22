import { describe, expect, it } from 'vitest';
import type { RunResult, RunView } from './results';
import { costByDay, groupByDay, latestPerFlow, openBugCount, shortId, stepTicks, verdictCounts } from './stats';

const mk = (id: string, flow: string, verdict: RunResult['verdict'], at: Date, usd = 0): RunView => ({
  id,
  status: 'finished',
  mode: usd === 0 ? 'replay' : 'ai',
  flow,
  startedAt: at,
  result: {
    runId: id, flow, verdict, reason: '', steps: 1, durationSeconds: 1,
    cost: { calls: 1, inputTokens: 1, outputTokens: 1, usd },
    stepResults: [], findings: [], finalUrl: '', promptVersion: 'agent-v2', model: 'm', startedAt: at.toISOString(), url: 'http://x', flowSource: 'f',
    artifacts: { screenshots: [] },
  },
});

const now = new Date(2026, 9, 22, 12);
const runs = [
  mk('A00001', 'Checkout', 'bug', new Date(2026, 9, 22, 2, 14), 0.31),
  mk('A00002', 'Search', 'pass', new Date(2026, 9, 22, 2, 20)),
  mk('A00003', 'Checkout', 'pass', new Date(2026, 9, 21, 2, 11)),
];

describe('stats', () => {
  it('keeps the newest finished run per flow and counts open bugs', () => {
    const latest = latestPerFlow(runs);
    expect(latest.get('Checkout')?.id).toBe('A00001');
    expect(openBugCount(runs)).toBe(1);
  });
  it('ignores unfinished runs', () => {
    const running: RunView = { id: 'R00001', status: 'running', mode: 'ai', flow: 'X', startedAt: now };
    expect(latestPerFlow([running]).size).toBe(0);
    expect(verdictCounts([running, ...runs])).toMatchObject({ pass: 2, bug: 1 });
  });
  it('groups by day, newest first', () => {
    const g = groupByDay(runs);
    expect(g.map((x) => x.runs.length)).toEqual([2, 1]);
  });
  it('sums cost per day over a fixed window, oldest first', () => {
    const c = costByDay(runs, now, 3);
    expect(c.map((x) => x.usd)).toEqual([0, 0, 0.31]);
    expect(c.map((x) => x.key)).toEqual(['2026-10-20', '2026-10-21', '2026-10-22']);
  });
  it('draws one tick per step', () => {
    const r = runs[0]?.result;
    if (!r) throw new Error('fixture');
    const withSteps = { ...r, stepResults: [{ index: 0, text: 'a', status: 'passed' as const }, { index: 1, text: 'b', status: 'failed' as const }, { index: 2, text: 'c', status: 'pending' as const }] };
    expect(stepTicks(withSteps)).toBe('obi');
    expect(stepTicks({ ...withSteps, verdict: 'needs_setup', stepResults: [{ index: 0, text: 'a', status: 'pending' }] })).toBe('v');
  });
  it('shortens ids for display', () => {
    expect(shortId('01M5H8FMS9SYKZNZKD3S27GJXK')).toBe('3S27GJXK'.slice(-6));
  });
});
