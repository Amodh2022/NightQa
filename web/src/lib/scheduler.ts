import { audit } from './audit';
import { latestPerBug, listBugs, type BugRecord } from './bugs';
import { deliver } from './notify/dispatch';
import type { DeliveryResult } from './notify/port';
import { runNightlyBatch, SCHEDULER, type NightlySummary } from './nightly';
import { buildReport, criticalAlert, type Report } from './report';
import { listRuns, type RunView } from './results';
import { decideDue } from './schedule';
import { getSchedulerState, markNotified, updateSchedulerState, type SchedulerFile } from './scheduler-state';
import { getSettings, type Settings } from './settings';

export interface TickDeps {
  readonly getSettings: () => Promise<Settings>;
  readonly getState: () => Promise<SchedulerFile>;
  readonly updateState: (change: (s: SchedulerFile) => SchedulerFile) => Promise<SchedulerFile>;
  readonly listRuns: () => Promise<RunView[]>;
  readonly listBugs: () => Promise<BugRecord[]>;
  readonly runBatch: () => Promise<NightlySummary>;
  readonly deliver: (report: Report, opts: { kind: 'morning' | 'critical'; bugId?: string }) => Promise<DeliveryResult[]>;
  readonly audit: (who: string, action: string, detail?: string) => Promise<void>;
}

export const defaultTickDeps: TickDeps = {
  getSettings: () => getSettings(),
  getState: () => getSchedulerState(),
  updateState: (change) => updateSchedulerState(change),
  listRuns: () => listRuns(),
  listBugs: () => listBugs(),
  runBatch: () => runNightlyBatch(),
  deliver: (report, opts) => deliver(report, opts),
  audit: (who, action, detail) => audit(who, action, detail),
};

/** A critical alert only covers bugs confirmed recently, so turning this on never replays old history. */
export const CRITICAL_LOOKBACK_MS = 24 * 3_600_000;
export const REPORT_WINDOW_MS = 24 * 3_600_000;

/** Module state: one tick at a time, and one nightly batch at a time (a batch can outlast many ticks). */
const flags = { ticking: false, batchRunning: false };
export const schedulerBusy = (): { ticking: boolean; batchRunning: boolean } => ({ ...flags });
/** For tests. */
export function resetSchedulerFlags(): void {
  flags.ticking = false;
  flags.batchRunning = false;
}

/** Sends one immediate alert per new proven critical bug. A bug is marked as notified only if a channel was tried. */
export async function alertCriticalBugs(now: Date, settings: Settings, deps: TickDeps): Promise<number> {
  if (!settings.notifications.criticalImmediately) return 0;
  const state = await deps.getState();
  const floor = new Date(now.getTime() - CRITICAL_LOOKBACK_MS).toISOString();
  const fresh = latestPerBug(await deps.listBugs()).filter((b) => b.severity === 'critical' && (b.status === 'reported' || b.status === 'ready') && b.createdAt >= floor && !state.notifiedBugIds.includes(b.id));
  let sent = 0;
  for (const bug of fresh) {
    const results = await deps.deliver(criticalAlert(bug, settings.app.name, now, settings.schedule.timezone), { kind: 'critical', bugId: bug.id });
    if (results.length === 0) continue; // no channel is on: try again when one is
    await deps.updateState((s) => markNotified(s, [bug.id]));
    await deps.audit(SCHEDULER, 'notify.critical', `${results.filter((r) => r.ok).length}/${String(results.length)} delivered`);
    sent++;
  }
  return sent;
}

/** One pass of the scheduler. Never throws: every step has its own guard so one failure cannot stop the others. */
export async function tick(now: Date = new Date(), deps: TickDeps = defaultTickDeps): Promise<void> {
  if (flags.ticking) return;
  flags.ticking = true;
  try {
    const settings = await deps.getSettings();
    const state = await deps.getState();
    const due = decideDue(now, settings.schedule, state);

    if (due.dueNightly && !settings.autonomy.paused && !flags.batchRunning) {
      try {
        // recorded before the batch starts, so a restart in the middle never runs the whole night twice
        await deps.updateState((s) => ({ ...s, lastNightlyDate: due.nightlyDate }));
        flags.batchRunning = true;
        void deps
          .runBatch()
          .catch(() => undefined)
          .finally(() => {
            flags.batchRunning = false;
          });
      } catch {
        flags.batchRunning = false;
      }
    }

    // the morning report waits for a batch that is still running, so it never goes out half-finished
    if (due.dueMorningReport && !flags.batchRunning) {
      try {
        await deps.updateState((s) => ({ ...s, lastReportDate: due.reportDate }));
        const report = buildReport({
          runs: await deps.listRuns(),
          bugs: await deps.listBugs(),
          appName: settings.app.name,
          now,
          since: new Date(now.getTime() - REPORT_WINDOW_MS),
          timeZone: settings.schedule.timezone,
          quietNight: settings.schedule.quietNight,
        });
        if (report.send) {
          const results = await deps.deliver(report, { kind: 'morning' });
          await deps.audit(SCHEDULER, 'notify.report', results.length === 0 ? 'no channel is on' : `${results.filter((r) => r.ok).length}/${String(results.length)} delivered`);
        } else {
          await deps.audit(SCHEDULER, 'notify.report.skipped', report.kind === 'no_runs' ? 'no runs in the last night' : 'quiet night, nothing sent');
        }
      } catch {
        /* the next tick will not retry today's report: it is recorded as handled */
      }
    }

    try {
      await alertCriticalBugs(now, settings, deps);
    } catch {
      /* try again on the next tick */
    }
  } catch {
    /* settings or state unreadable: do nothing this tick */
  } finally {
    flags.ticking = false;
  }
}

const KEY = Symbol.for('nightqa.scheduler');
const TICK_MS = 30_000;

/** Starts the 30-second tick once per server process (guarded against double start, also across hot reloads). */
export function startScheduler(): boolean {
  const g = globalThis as unknown as Record<symbol, ReturnType<typeof setInterval> | undefined>;
  if (g[KEY]) return false;
  const run = (): void => {
    void tick().catch(() => undefined);
  };
  const handle = setInterval(run, TICK_MS);
  handle.unref();
  g[KEY] = handle;
  setTimeout(run, 10_000).unref();
  return true;
}

export function stopScheduler(): void {
  const g = globalThis as unknown as Record<symbol, ReturnType<typeof setInterval> | undefined>;
  const h = g[KEY];
  if (h) clearInterval(h);
  g[KEY] = undefined;
}
