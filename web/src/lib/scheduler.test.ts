import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BugRecord } from './bugs';
import type { FlowInfo } from './flows';
import { LaunchError } from './launcher';
import { runNightlyBatch, waitForRun, type NightlyDeps } from './nightly';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import { alertCriticalBugs, resetSchedulerFlags, tick, type TickDeps } from './scheduler';
import type { SchedulerFile } from './scheduler-state';
import type { RunView } from './results';

const flow = (name: string, hasSavedTest: boolean, error?: string): FlowInfo => ({ file: `flows/${name}.yaml`, name, tags: [], steps: 1, expectations: 0, variations: 0, hasSavedTest, ...(error ? { error } : {}) });
const doneRun = (id: string): RunView => ({ id, status: 'finished', mode: 'ai', flow: 'x', startedAt: new Date(), result: {} as RunView['result'] });

function nightlyDeps(over: Partial<NightlyDeps> = {}): NightlyDeps {
  return {
    listFlows: () => Promise.resolve([flow('a', true), flow('b', false)]),
    startRun: vi.fn().mockImplementation(() => Promise.resolve({ id: 'run-1234567' })),
    getRun: () => Promise.resolve(doneRun('run-1234567')),
    getSettings: () => Promise.resolve(DEFAULT_SETTINGS),
    audit: vi.fn().mockResolvedValue(undefined),
    sleep: () => Promise.resolve(),
    now: () => 0,
    pollMs: 1,
    ...over,
  };
}

describe('runNightlyBatch', () => {
  it('replays flows with a saved test and runs the rest with the AI, one at a time', async () => {
    const order: string[] = [];
    let busy = false;
    const deps = nightlyDeps({
      startRun: vi.fn().mockImplementation((i: { mode: string; flowFile: string; startedBy?: string }) => {
        expect(busy).toBe(false); // the previous run must be finished first
        busy = true;
        order.push(`${i.mode}:${i.flowFile}:${i.startedBy ?? ''}`);
        return Promise.resolve({ id: 'run-1234567' });
      }),
      getRun: () => {
        busy = false;
        return Promise.resolve(doneRun('run-1234567'));
      },
    });
    const s = await runNightlyBatch(deps);
    expect(order).toEqual(['replay:flows/a.yaml:scheduler', 'run:flows/b.yaml:scheduler']);
    expect(s).toMatchObject({ started: 2, timedOut: 0, failedToStart: 0 });
    expect(deps.audit).toHaveBeenCalledWith('scheduler', 'nightly.start', '2 flows');
  });

  it('skips flows that cannot be read', async () => {
    const deps = nightlyDeps({ listFlows: () => Promise.resolve([flow('bad', false, 'broken'), flow('ok', false)]) });
    expect((await runNightlyBatch(deps)).started).toBe(1);
  });

  it('stops at once when paused', async () => {
    const paused: Settings = { ...DEFAULT_SETTINGS, autonomy: { ...DEFAULT_SETTINGS.autonomy, paused: true } };
    const deps = nightlyDeps({ getSettings: () => Promise.resolve(paused) });
    const s = await runNightlyBatch(deps);
    expect(s).toMatchObject({ started: 0, skipped: 2, stopped: 'paused' });
    expect(deps.startRun).not.toHaveBeenCalled();
  });

  it('stops when the launcher says it is paused, and carries on after other launch errors', async () => {
    const pausedDeps = nightlyDeps({ startRun: vi.fn().mockRejectedValue(new LaunchError('NightQA is paused. Resume it.')) });
    expect((await runNightlyBatch(pausedDeps)).stopped).toBe('paused');
    const failing = vi.fn().mockRejectedValueOnce(new LaunchError('That flow could not be read.')).mockResolvedValue({ id: 'run-1234567' });
    const s = await runNightlyBatch(nightlyDeps({ startRun: failing }));
    expect(s).toMatchObject({ started: 1, failedToStart: 1 });
  });

  it('moves on after the run budget plus 120 s', async () => {
    let t = 0;
    const running: RunView = { id: 'r', status: 'running', mode: 'ai', flow: 'x', startedAt: new Date() };
    const deps = nightlyDeps({
      listFlows: () => Promise.resolve([flow('slow', false)]),
      getRun: () => Promise.resolve(running),
      now: () => t,
      sleep: (ms) => {
        t += ms * 1000;
        return Promise.resolve();
      },
      pollMs: 10,
    });
    const s = await runNightlyBatch(deps);
    expect(s.timedOut).toBe(1);
    expect(t).toBeGreaterThanOrEqual((DEFAULT_SETTINGS.budgets.maxSeconds + 120) * 1000);
  });

  it('never throws', async () => {
    await expect(runNightlyBatch(nightlyDeps({ listFlows: () => Promise.reject(new Error('boom')) }))).resolves.toMatchObject({ started: 0 });
  });
});

describe('waitForRun', () => {
  const base = { sleep: () => Promise.resolve(), now: () => 0, pollMs: 1 };
  it('ends when the process exited without a result', async () => {
    const crashed: RunView = { id: 'r', status: 'crashed', mode: 'ai', flow: 'x', startedAt: new Date() };
    expect(await waitForRun('r', 1000, { ...base, getRun: () => Promise.resolve(crashed) })).toBe('ended');
  });
});

// ---- tick ----

const bug = (over: Partial<BugRecord>): BugRecord => ({
  version: 1, id: 'bug-aaaaaaaaaaaa', runId: 'r1', flow: 'Checkout', title: 'Payment fails', severity: 'critical', status: 'reported', statusNote: '', reproduced: 3, attempts: 3,
  recipe: [], expected: '', actual: '', evidence: [], createdAt: '2026-10-22T01:00:00Z', updatedAt: '2026-10-22T01:00:00Z', ...over,
});

function tickDeps(over: Partial<TickDeps> = {}, settings: Settings = DEFAULT_SETTINGS) {
  let state: SchedulerFile = { version: 1, notifiedBugIds: [] };
  const deps: TickDeps = {
    getSettings: () => Promise.resolve(settings),
    getState: () => Promise.resolve(state),
    updateState: (change) => {
      state = change(state);
      return Promise.resolve(state);
    },
    listRuns: () => Promise.resolve([]),
    listBugs: () => Promise.resolve([]),
    runBatch: vi.fn().mockResolvedValue({ started: 0, timedOut: 0, failedToStart: 0, skipped: 0 }),
    deliver: vi.fn().mockResolvedValue([{ channel: 'slack', ok: true, reason: 'Delivered' }]),
    audit: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
  return { deps, getState: () => state };
}

const on: Settings = { ...DEFAULT_SETTINGS, schedule: { ...DEFAULT_SETTINGS.schedule, nightlyEnabled: true, timezone: 'UTC', nightlyTime: '02:00', morningReportTime: '08:00' } };

describe('tick', () => {
  beforeEach(() => {
    resetSchedulerFlags();
  });

  it('starts the nightly batch once per day', async () => {
    const { deps, getState } = tickDeps({}, on);
    await tick(new Date('2026-10-22T02:00:30Z'), deps);
    await tick(new Date('2026-10-22T02:01:00Z'), deps);
    expect(deps.runBatch).toHaveBeenCalledTimes(1);
    expect(getState().lastNightlyDate).toBe('2026-10-22');
  });

  it('does not overlap a slow batch', async () => {
    let release: () => void = () => undefined;
    const slow = vi.fn().mockImplementation(() => new Promise((r) => { release = () => r({ started: 1 }); }));
    const { deps } = tickDeps({ runBatch: slow }, on);
    await tick(new Date('2026-10-22T02:00:30Z'), deps);
    // a manual reset of the day must not start a second batch while the first runs
    await deps.updateState((s) => ({ ...s, lastNightlyDate: undefined }));
    await tick(new Date('2026-10-22T02:01:00Z'), deps);
    expect(slow).toHaveBeenCalledTimes(1);
    release();
  });

  it('does not start while paused, and starts after it is resumed within the catch-up window', async () => {
    const paused: Settings = { ...on, autonomy: { ...on.autonomy, paused: true } };
    const a = tickDeps({}, paused);
    await tick(new Date('2026-10-22T02:00:30Z'), a.deps);
    expect(a.deps.runBatch).not.toHaveBeenCalled();
    expect(a.getState().lastNightlyDate).toBeUndefined();
    const b = tickDeps({}, on);
    await tick(new Date('2026-10-22T03:00:00Z'), b.deps);
    expect(b.deps.runBatch).toHaveBeenCalledTimes(1);
  });

  it('sends the morning report once and builds it from real data', async () => {
    const runs: RunView[] = [{ id: 'r1', status: 'finished', mode: 'ai', flow: 'Login', startedAt: new Date('2026-10-22T02:10:00Z'), result: { verdict: 'pass', reason: '' } as unknown as RunView['result'] }];
    const { deps } = tickDeps({ listRuns: () => Promise.resolve(runs) }, { ...on, schedule: { ...on.schedule, nightlyEnabled: false } });
    await tick(new Date('2026-10-22T08:00:30Z'), deps);
    await tick(new Date('2026-10-22T08:01:00Z'), deps);
    expect(deps.deliver).toHaveBeenCalledTimes(1);
    const [report, opts] = (deps.deliver as ReturnType<typeof vi.fn>).mock.calls[0] as [{ kind: string; subject: string }, { kind: string }];
    expect(opts.kind).toBe('morning');
    expect(report.kind).toBe('all_clear');
  });

  it('sends nothing when there were no runs, and marks the day handled', async () => {
    const { deps, getState } = tickDeps({}, { ...on, schedule: { ...on.schedule, nightlyEnabled: false } });
    await tick(new Date('2026-10-22T08:00:30Z'), deps);
    expect(deps.deliver).not.toHaveBeenCalled();
    expect(getState().lastReportDate).toBe('2026-10-22');
  });

  it('never throws, even when everything fails', async () => {
    const boom = (): Promise<never> => Promise.reject(new Error('boom'));
    const { deps } = tickDeps({ getSettings: boom });
    await expect(tick(new Date(), deps)).resolves.toBeUndefined();
    const b = tickDeps({ listRuns: boom, listBugs: boom, deliver: boom }, on);
    await expect(tick(new Date('2026-10-22T08:00:30Z'), b.deps)).resolves.toBeUndefined();
  });
});

describe('alertCriticalBugs', () => {
  const now = new Date('2026-10-22T02:30:00Z');
  it('alerts once per new proven critical bug', async () => {
    const { deps, getState } = tickDeps({ listBugs: () => Promise.resolve([bug({}), bug({ id: 'bug-bbbbbbbbbbbb', severity: 'high' })]) });
    expect(await alertCriticalBugs(now, DEFAULT_SETTINGS, deps)).toBe(1);
    expect(await alertCriticalBugs(now, DEFAULT_SETTINGS, deps)).toBe(0);
    expect(deps.deliver).toHaveBeenCalledTimes(1);
    expect(getState().notifiedBugIds).toEqual(['bug-aaaaaaaaaaaa']);
  });
  it('ignores old bugs, unproven bugs and the off switch', async () => {
    const { deps } = tickDeps({ listBugs: () => Promise.resolve([bug({ createdAt: '2026-09-01T00:00:00Z' }), bug({ id: 'bug-cccccccccccc', status: 'needs_look' })]) });
    expect(await alertCriticalBugs(now, DEFAULT_SETTINGS, deps)).toBe(0);
    const off: Settings = { ...DEFAULT_SETTINGS, notifications: { ...DEFAULT_SETTINGS.notifications, criticalImmediately: false } };
    const fresh = tickDeps({ listBugs: () => Promise.resolve([bug({})]) });
    expect(await alertCriticalBugs(now, off, fresh.deps)).toBe(0);
  });
  it('does not mark a bug when no channel was tried, so it alerts once one is switched on', async () => {
    const { deps, getState } = tickDeps({ listBugs: () => Promise.resolve([bug({})]), deliver: vi.fn().mockResolvedValue([]) });
    expect(await alertCriticalBugs(now, DEFAULT_SETTINGS, deps)).toBe(0);
    expect(getState().notifiedBugIds).toEqual([]);
  });
  it('marks a bug when delivery was tried but failed (no repeated storms)', async () => {
    const { deps, getState } = tickDeps({ listBugs: () => Promise.resolve([bug({})]), deliver: vi.fn().mockResolvedValue([{ channel: 'slack', ok: false, reason: 'x' }]) });
    await alertCriticalBugs(now, DEFAULT_SETTINGS, deps);
    expect(getState().notifiedBugIds).toEqual(['bug-aaaaaaaaaaaa']);
  });
});
