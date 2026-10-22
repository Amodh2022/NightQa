import { describeAction, type RecordedAction } from '../agent/loop.js';
import type { BrowserDriver, DriverSignal, Log } from '../ports.js';
import { redactString, resolvePlaceholders, type Account } from '../redact.js';
import { findingKindFor } from '../signals.js';
import { findingKey, pathOf } from './fingerprint.js';
import type { AttemptOutcome, BugCandidate } from './types.js';

export interface AttemptDeps {
  /** A fresh browser that has already started on the flow's start page. */
  readonly driver: BrowserDriver;
  readonly log: Log;
  readonly account?: Account;
  readonly secrets: readonly string[];
}

const PROOF_WAIT_MS = 3000;
const ABSENT_WAIT_MS = 1200;

function shortError(e: unknown): string {
  const first = (e instanceof Error ? e.message : String(e)).split('\n')[0] ?? 'error';
  return first.length > 160 ? `${first.slice(0, 157)}...` : first;
}

/**
 * One replay of a bug recipe in a fresh browser, with no AI: does the SAME problem happen again?
 * Same means the same kind of finding on the same page (for failed expectations: the recorded proof holds).
 */
export async function attemptReproduction(
  deps: AttemptDeps,
  candidate: BugCandidate,
  actions: readonly RecordedAction[],
): Promise<AttemptOutcome> {
  const { driver } = deps;
  const target = candidate.finding;
  const key = findingKey(target);
  const seen = { hit: false };
  const absorb = (signals: readonly DriverSignal[]): void => {
    for (const s of signals) {
      const kind = findingKindFor(s);
      if (kind && findingKey({ kind, message: s.message, url: s.url ?? target.url }) === key) {
        seen.hit = true;
      }
    }
  };
  const finish = async (reproduced: boolean, note: string): Promise<AttemptOutcome> => {
    const clean = redactString(note, deps.secrets);
    if (!reproduced) return { reproduced, note: clean };
    try {
      return { reproduced, note: clean, screenshot: await driver.saveScreenshot('bug-state') };
    } catch {
      return { reproduced, note: clean };
    }
  };

  absorb(driver.drainSignals()); // problems that show on the first page load
  for (const rec of actions) {
    const a = rec.action;
    try {
      await driver.perform(
        a.kind === 'type' ? { ...a, text: resolvePlaceholders(a.text, deps.account) } : a,
      );
    } catch (e) {
      absorb(driver.drainSignals());
      return seen.hit
        ? finish(true, `${target.kind} seen while replaying`)
        : finish(false, `could not ${describeAction(a)}: ${shortError(e)}`);
    }
    absorb(driver.drainSignals());
  }

  switch (target.kind) {
    case 'blank-page': {
      await driver.wait({ kind: 'idle', timeoutMs: 3000 }).catch(() => undefined);
      const obs = await driver.observe();
      absorb(driver.drainSignals());
      return obs.blank && pathOf(obs.url) === pathOf(target.url)
        ? finish(true, 'the page is blank again')
        : finish(false, 'the page showed content this time');
    }
    case 'spinner': {
      let obs = await driver.observe();
      if (obs.busy) {
        await driver.wait({ kind: 'idle', timeoutMs: 3000 }).catch(() => undefined);
        obs = await driver.observe();
      }
      return obs.busy && pathOf(obs.url) === pathOf(target.url)
        ? finish(true, 'the loading indicator never went away again')
        : finish(false, 'the page finished loading this time');
    }
    case 'expectation-failed': {
      const proof = candidate.proof;
      if (!proof) return finish(false, 'no replayable proof was recorded for this failure');
      await driver.wait({ kind: 'idle', timeoutMs: 2000 }).catch(() => undefined);
      for (const text of proof.visibleText) {
        try {
          await driver.wait({ kind: 'text', text, timeoutMs: PROOF_WAIT_MS });
        } catch {
          return finish(false, `the wrong text "${text}" was not shown this time`);
        }
      }
      for (const text of proof.missingText) {
        const appeared = await driver
          .wait({ kind: 'text', text, timeoutMs: ABSENT_WAIT_MS })
          .then(() => true)
          .catch(() => false);
        if (appeared) return finish(false, `"${text}" was shown this time`);
      }
      if (proof.disabledControls.length > 0) {
        const { elements } = await driver.observe();
        for (const c of proof.disabledControls) {
          const el = elements.find((e) => e.role === c.role && e.name === c.name);
          if (!el || el.enabled)
            return finish(false, `"${c.name}" was ${el ? 'enabled' : 'not found'} this time`);
        }
      }
      return finish(true, 'the same wrong result appeared again');
    }
    default:
      absorb(driver.drainSignals());
      return seen.hit
        ? finish(true, `${target.kind} happened again`)
        : finish(false, `${target.kind} did not happen this time`);
  }
}
