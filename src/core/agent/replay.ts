import { BudgetExceededError } from '../errors.js';
import type { Budgets } from '../env.js';
import type { BrowserDriver, Clock, DriverSignal, Log } from '../ports.js';
import type { Recording } from '../recording.js';
import { redactString, resolvePlaceholders, type Account } from '../redact.js';
import { findingKindFor } from '../signals.js';
import { decideVerdict, type Finding, type FindingKind } from '../verdict.js';
import {
  describeAction,
  type RecordedAction,
  type RecordedAssertion,
  type RecordedFailure,
  type RunResult,
  type StepResult,
} from './loop.js';

export interface ReplayDeps {
  readonly driver: BrowserDriver;
  readonly clock: Clock;
  readonly log: Log;
  readonly account?: Account;
  readonly secrets: readonly string[];
}

export interface ReplayOptions {
  readonly runId: string;
  /** How long each on-page check may wait before it counts as failed. Default 5000 ms. */
  readonly assertTimeoutMs?: number;
  /** Overall time limit for the replay. */
  readonly maxSeconds?: number;
}

export const REPLAY_VERSION = 'replay-v1';

function shortError(e: unknown): string {
  const first = (e instanceof Error ? e.message : String(e)).split('\n')[0] ?? 'error';
  return first.length > 160 ? `${first.slice(0, 157)}...` : first;
}

/**
 * Replays a saved recording with NO AI calls: performs the recorded actions and re-checks each saved
 * on-page text. A failure is reported as a bug candidate (the self-healing judge decides bug vs app changed later).
 */
export async function replayRecording(
  deps: ReplayDeps,
  rec: Recording,
  opts: ReplayOptions,
): Promise<RunResult> {
  const { driver, log } = deps;
  const clean = (s: string): string => redactString(s, deps.secrets);
  const startedAt = deps.clock.now();
  const timeout = opts.assertTimeoutMs ?? 5000;
  const findings: Finding[] = [];
  const seen = new Set<string>();
  const performed: RecordedAction[] = [];
  const checked: RecordedAssertion[] = [];
  const status: StepResult['status'][] = rec.steps.map(() => 'pending');
  const evidence: (string | undefined)[] = rec.steps.map(() => undefined);
  let failure: RecordedFailure | undefined;
  let stepIndex = 0;
  let url = '';
  let events = 0;
  let stuckReason: string | undefined;

  const add = (kind: FindingKind, message: string, at: string): void => {
    const key = `${kind}|${at}|${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ kind, message: clean(message), stepIndex, url: at });
  };
  const absorb = (signals: readonly DriverSignal[]): void => {
    for (const s of signals) {
      const kind = findingKindFor(s);
      if (kind) add(kind, s.message, s.url ?? url);
    }
  };

  try {
    for (const e of rec.events) {
      if (
        opts.maxSeconds !== undefined &&
        (deps.clock.now() - startedAt) / 1000 >= opts.maxSeconds
      ) {
        throw new BudgetExceededError('seconds', opts.maxSeconds);
      }
      stepIndex = e.stepIndex;
      events++;
      if (e.type === 'action') {
        const action =
          e.action.kind === 'type'
            ? { ...e.action, text: resolvePlaceholders(e.action.text, deps.account) }
            : e.action;
        try {
          await driver.perform(action);
        } catch (err) {
          absorb(driver.drainSignals());
          add(
            'expectation-failed',
            `replay could not ${describeAction(e.action)}: ${shortError(err)}`,
            url,
          );
          status[stepIndex] = 'failed';
          break;
        }
        performed.push({ stepIndex, action: e.action });
        absorb(driver.drainSignals());
        continue;
      }
      // assert: every saved snippet must be visible (auto-waits)
      const obs = await driver.observe();
      url = obs.url;
      absorb(driver.drainSignals());
      if (obs.blank) add('blank-page', 'the page is blank', url);
      let failed: string | undefined;
      for (const text of e.visibleText) {
        try {
          await driver.wait({ kind: 'text', text, timeoutMs: timeout });
        } catch {
          failed = text;
          break;
        }
      }
      absorb(driver.drainSignals());
      if (failed !== undefined) {
        add(
          'expectation-failed',
          `replay check failed: "${failed}" is not visible (${e.statement})`,
          url,
        );
        failure = {
          stepIndex,
          afterActions: performed.length,
          statement: clean(e.statement),
          visibleText: [],
          missingText: [clean(failed)],
          disabledControls: [],
        };
        status[stepIndex] = 'failed';
        evidence[stepIndex] = `"${failed}" not visible`;
        break;
      }
      checked.push({
        stepIndex,
        afterActions: performed.length,
        statement: e.statement,
        visibleText: e.visibleText,
      });
      status[stepIndex] = 'passed';
    }
    absorb(driver.drainSignals());
  } catch (err) {
    stuckReason =
      err instanceof BudgetExceededError
        ? err.message
        : `unexpected error: ${clean(shortError(err))}`;
    log.error({ event: 'replay_error', runId: opts.runId, error: stuckReason });
  }

  const { verdict, reason } = decideVerdict({
    findings,
    ...(stuckReason !== undefined ? { stuckReason } : {}),
    allStepsPassed: status.every((s) => s === 'passed'),
  });
  const result: RunResult = {
    runId: opts.runId,
    flow: rec.flow,
    verdict,
    reason,
    steps: events,
    durationSeconds: Math.round(((deps.clock.now() - startedAt) / 1000) * 10) / 10,
    cost: { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 },
    stepResults: rec.steps.map((text, index) => ({
      index,
      text,
      status: status[index] ?? 'pending',
      ...(evidence[index] !== undefined ? { evidence: evidence[index] } : {}),
    })),
    findings,
    actions: performed,
    assertions: checked,
    ...(failure ? { failure } : {}),
    finalUrl: url,
    promptVersion: REPLAY_VERSION,
    model: '',
  };
  log.info({
    event: 'replay_finished',
    runId: opts.runId,
    verdict,
    reason,
    aiCalls: 0,
    costUsd: 0,
  });
  return result;
}

/** Budgets are for AI runs; replays only use the time limit. */
export function replayTimeLimit(b: Budgets): number {
  return b.maxSeconds;
}
