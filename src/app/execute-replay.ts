import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import pino from 'pino';
import { replayRecording } from '../core/agent/replay.js';
import type { Budgets } from '../core/env.js';
import { newRunId } from '../core/ids.js';
import { DEFAULT_PROFILE, type RunProfile } from '../core/profiles.js';
import type { Clock, DriverArtifacts } from '../core/ports.js';
import type { Recording } from '../core/recording.js';
import { redactString, type Account } from '../core/redact.js';
import type { RunResult } from '../core/agent/loop.js';
import { exitCodeFor } from '../core/summary.js';
import { checkTestUrl, type UrlPolicyOptions } from '../core/url-policy.js';
import { decideVerdict } from '../core/verdict.js';
import { createRunLogger } from '../io/logger.js';
import { PlaywrightDriver } from '../io/playwright-driver.js';
import { writeRunResults } from '../io/results.js';

export interface ExecuteReplayParams {
  readonly url: string;
  readonly recording: Recording;
  readonly recordingSource: string;
  readonly resultsDir: string;
  readonly budgets: Budgets;
  readonly policy?: UrlPolicyOptions;
  readonly account?: Account;
  readonly secrets: readonly string[];
  readonly headless?: boolean;
  readonly executablePath?: string;
  readonly minRequestIntervalMs?: number;
  readonly blockedPaths?: readonly string[];
  readonly profile?: RunProfile;
  /** How long each saved on-page check may wait. Default 5000 ms. */
  readonly assertTimeoutMs?: number;
  readonly clock?: Clock;
  readonly runId?: string;
}

export interface ExecuteReplayOutcome {
  readonly result: RunResult;
  readonly dir: string;
  readonly artifacts: DriverArtifacts;
  readonly attempts: number;
  /** Failed once, then passed on the retry. */
  readonly flaky: boolean;
  readonly exitCode: number;
}

/**
 * Replays a saved regression test with no AI. A failed replay is retried once in a fresh browser to rule out a
 * random glitch. There is deliberately no AI client here: replays cannot make AI calls.
 * @throws UrlPolicyError when the URL breaks the staging-only or SSRF rules
 */
export async function executeReplay(p: ExecuteReplayParams): Promise<ExecuteReplayOutcome> {
  const startUrl = checkTestUrl(new URL(p.recording.start, p.url).href, p.policy);
  const runId = p.runId ?? newRunId();
  const dir = join(p.resultsDir, runId);
  await mkdir(dir, { recursive: true });
  const clock: Clock = p.clock ?? { now: () => Date.now() };
  const startedAtMs = clock.now();
  const log = createRunLogger(
    runId,
    p.secrets,
    pino.destination({ dest: join(dir, 'run.jsonl'), sync: true }),
  );

  const attempt = async (n: number): Promise<{ result: RunResult; artifacts: DriverArtifacts }> => {
    const driver = new PlaywrightDriver({
      baseUrl: startUrl.href,
      evidenceDir: join(dir, `attempt-${String(n)}`),
      ...(p.policy ? { urlPolicy: p.policy } : {}),
      ...(p.headless !== undefined ? { headless: p.headless } : {}),
      ...(p.executablePath ? { executablePath: p.executablePath } : {}),
      ...(p.minRequestIntervalMs !== undefined
        ? { minRequestIntervalMs: p.minRequestIntervalMs }
        : {}),
      ...(p.blockedPaths ? { blockedPaths: p.blockedPaths } : {}),
      ...(p.profile ? { profile: p.profile } : {}),
    });
    let result: RunResult;
    let artifacts: DriverArtifacts;
    try {
      result = await run(driver);
    } finally {
      artifacts = await driver.stop();
    }
    return { result, artifacts };
  };

  const run = async (driver: PlaywrightDriver): Promise<RunResult> => {
    if (p.recording.login && !p.account) {
      return noStart(`no saved test account "${p.recording.login}" was found in the environment`);
    }
    try {
      await driver.start();
    } catch (e) {
      const msg = redactString(
        e instanceof Error ? (e.message.split('\n')[0] ?? 'error') : String(e),
        p.secrets,
      );
      log.error({ event: 'start_failed', error: msg });
      return noStart(`could not open the app: ${msg}`);
    }
    return replayRecording(
      { driver, clock, log, ...(p.account ? { account: p.account } : {}), secrets: p.secrets },
      p.recording,
      {
        runId,
        maxSeconds: p.budgets.maxSeconds,
        ...(p.assertTimeoutMs !== undefined ? { assertTimeoutMs: p.assertTimeoutMs } : {}),
      },
    );
  };

  const noStart = (problem: string): RunResult => {
    const { verdict, reason } = decideVerdict({
      setupProblem: problem,
      findings: [],
      allStepsPassed: false,
    });
    return {
      runId,
      flow: p.recording.flow,
      verdict,
      reason,
      steps: 0,
      durationSeconds: (clock.now() - startedAtMs) / 1000,
      cost: { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 },
      stepResults: p.recording.steps.map((text, index) => ({
        index,
        text,
        status: 'pending' as const,
      })),
      findings: [],
      actions: [],
      assertions: [],
      finalUrl: '',
      promptVersion: 'replay-v1',
      model: '',
    };
  };

  let attempts = 1;
  let { result, artifacts } = await attempt(1);
  let flaky = false;
  if (result.verdict === 'bug') {
    log.warn({ event: 'replay_retry', runId, reason: result.reason });
    attempts = 2;
    const second = await attempt(2);
    if (second.result.verdict === 'pass') flaky = true;
    result = second.result;
    artifacts = second.artifacts;
  }
  await writeRunResults(
    dir,
    result,
    artifacts,
    {
      startedAt: new Date(startedAtMs).toISOString(),
      url: p.url,
      flowSource: p.recordingSource,
      budgets: p.budgets,
      attempts,
      flaky,
      profile: p.profile ?? DEFAULT_PROFILE,
    },
    p.secrets,
  );
  return { result, dir, artifacts, attempts, flaky, exitCode: exitCodeFor(result.verdict) };
}
