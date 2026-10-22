import { audit } from './audit';
import { listFlows, type FlowInfo } from './flows';
import { LaunchError, startRun, type StartRunInput } from './launcher';
import { getRun, type RunView } from './results';
import { getSettings, type Settings } from './settings';

export interface NightlyDeps {
  readonly listFlows: () => Promise<FlowInfo[]>;
  readonly startRun: (input: StartRunInput) => Promise<{ id: string }>;
  readonly getRun: (id: string) => Promise<RunView | undefined>;
  readonly getSettings: () => Promise<Settings>;
  readonly audit: (who: string, action: string, detail?: string) => Promise<void>;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
  /** How often to look at the run folder while waiting. */
  readonly pollMs: number;
}

export const SCHEDULER = 'scheduler';

export const defaultNightlyDeps: NightlyDeps = {
  listFlows,
  startRun,
  getRun: (id) => getRun(id),
  getSettings: () => getSettings(),
  audit: (who, action, detail) => audit(who, action, detail),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Date.now(),
  pollMs: 3000,
};

export interface NightlySummary {
  readonly started: number;
  readonly timedOut: number;
  readonly failedToStart: number;
  readonly skipped: number;
  /** Why the batch ended early, when it did. */
  readonly stopped?: 'paused' | 'launch_refused';
}

export type WaitOutcome = 'finished' | 'ended' | 'timeout';

/** Waits for a run to write result.json, or for its process to exit, but never longer than `timeoutMs`. */
export async function waitForRun(id: string, timeoutMs: number, deps: Pick<NightlyDeps, 'getRun' | 'sleep' | 'now' | 'pollMs'>): Promise<WaitOutcome> {
  const deadline = deps.now() + timeoutMs;
  for (;;) {
    const run = await deps.getRun(id).catch(() => undefined);
    if (run?.result) return 'finished';
    if (run && run.status !== 'running') return 'ended'; // the process exited without a result
    if (deps.now() >= deadline) return 'timeout';
    await deps.sleep(deps.pollMs);
  }
}

/**
 * The nightly batch: every flow, one at a time so staging is not hammered. A flow with a saved test is replayed (no
 * AI); the others get a normal AI run. Stops at once when NightQA is paused. Never throws.
 */
export async function runNightlyBatch(deps: NightlyDeps = defaultNightlyDeps): Promise<NightlySummary> {
  let started = 0;
  let timedOut = 0;
  let failedToStart = 0;
  let skipped = 0;
  const note = (action: string, detail?: string): Promise<void> => deps.audit(SCHEDULER, action, detail).catch(() => undefined);
  try {
    const flows = (await deps.listFlows()).filter((f) => !f.error);
    await note('nightly.start', `${String(flows.length)} flow${flows.length === 1 ? '' : 's'}`);
    for (const [idx, flow] of flows.entries()) {
      const settings = await deps.getSettings();
      if (settings.autonomy.paused) {
        skipped = flows.length - idx;
        await note('nightly.stopped', 'paused');
        return { started, timedOut, failedToStart, skipped, stopped: 'paused' };
      }
      const mode = flow.hasSavedTest ? 'replay' : 'run';
      try {
        const { id } = await deps.startRun({ flowFile: flow.file, mode, startedBy: SCHEDULER });
        started++;
        const outcome = await waitForRun(id, (settings.budgets.maxSeconds + 120) * 1000, deps);
        if (outcome === 'timeout') {
          timedOut++;
          await note('nightly.timeout', `${flow.name} (${mode})`);
        }
      } catch (e) {
        if (e instanceof LaunchError && /paused/i.test(e.message)) {
          await note('nightly.stopped', 'paused');
          return { started, timedOut, failedToStart, skipped: flows.length - idx, stopped: 'paused' };
        }
        failedToStart++;
        await note('nightly.skip', `${flow.name}: ${e instanceof LaunchError ? e.message : 'could not start'}`);
      }
    }
    await note('nightly.done', `${String(started)} started, ${String(timedOut)} timed out, ${String(failedToStart)} not started`);
  } catch {
    await note('nightly.error', 'The nightly batch stopped unexpectedly.');
  }
  return { started, timedOut, failedToStart, skipped };
}
