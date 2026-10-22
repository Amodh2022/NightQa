import { join } from 'node:path';
import { reproduce, type ReproduceOptions } from '../core/repro/reproduce.js';
import { attemptReproduction } from '../core/repro/attempt.js';
import type { BugCandidate, Reproduction } from '../core/repro/types.js';
import type { RecordedAction } from '../core/agent/loop.js';
import type { Log } from '../core/ports.js';
import { redactString, type Account } from '../core/redact.js';
import type { UrlPolicyOptions } from '../core/url-policy.js';
import { PlaywrightDriver } from '../io/playwright-driver.js';

export interface ExecuteReproParams {
  readonly url: string;
  readonly candidate: BugCandidate;
  /** Evidence of every replay goes under here: attempt-1, attempt-2, ... */
  readonly evidenceDir: string;
  readonly log: Log;
  readonly policy?: UrlPolicyOptions;
  readonly account?: Account;
  readonly secrets: readonly string[];
  readonly headless?: boolean;
  readonly executablePath?: string;
  readonly minRequestIntervalMs?: number;
  readonly blockedPaths?: readonly string[];
  readonly options?: ReproduceOptions;
}

/**
 * Replays a suspected bug in fresh browsers (no AI, no cost) and classifies it.
 * Each replay gets its own browser context, so nothing leaks from one attempt to the next.
 */
export async function executeReproduction(p: ExecuteReproParams): Promise<Reproduction> {
  let n = 0;
  const attempt = async (actions: readonly RecordedAction[]) => {
    n++;
    const driver = new PlaywrightDriver({
      baseUrl: new URL(p.candidate.start, p.url).href,
      evidenceDir: join(p.evidenceDir, `attempt-${String(n)}`),
      // Replays only need a screenshot of the bug; the original run already has the video.
      record: false,
      ...(p.candidate.profile ? { profile: p.candidate.profile } : {}),
      ...(p.blockedPaths ? { blockedPaths: p.blockedPaths } : {}),
      ...(p.policy ? { urlPolicy: p.policy } : {}),
      ...(p.headless !== undefined ? { headless: p.headless } : {}),
      ...(p.executablePath ? { executablePath: p.executablePath } : {}),
      ...(p.minRequestIntervalMs !== undefined
        ? { minRequestIntervalMs: p.minRequestIntervalMs }
        : {}),
    });
    try {
      await driver.start();
      return await attemptReproduction(
        {
          driver,
          log: p.log,
          ...(p.account ? { account: p.account } : {}),
          secrets: p.secrets,
        },
        p.candidate,
        actions,
      );
    } catch (e) {
      const msg = redactString(
        e instanceof Error ? (e.message.split('\n')[0] ?? 'error') : String(e),
        p.secrets,
      );
      p.log.warn({ event: 'repro_attempt_error', bug: p.candidate.id, attempt: n, error: msg });
      return { reproduced: false, note: `replay could not run: ${msg}` };
    } finally {
      await driver.stop();
    }
  };
  const result = await reproduce(p.candidate, { attempt }, p.options);
  p.log.info({
    event: 'repro_finished',
    bug: p.candidate.id,
    status: result.status,
    reproduced: result.reproducedCount,
    of: result.attemptCount,
    recipeLength: result.recipe.length,
    aiCalls: 0,
  });
  return result;
}
