import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import pino from 'pino';
import { runFlow, type RunResult } from '../core/agent/loop.js';
import { PROMPT_VERSION } from '../core/agent/prompts.js';
import type { Budgets } from '../core/env.js';
import type { Flow } from '../core/flow/schema.js';
import { newRunId } from '../core/ids.js';
import type { AiClient, Clock, DriverArtifacts } from '../core/ports.js';
import { redactString, type Account } from '../core/redact.js';
import { exitCodeFor } from '../core/summary.js';
import { checkTestUrl, type UrlPolicyOptions } from '../core/url-policy.js';
import { decideVerdict } from '../core/verdict.js';
import { createRunLogger } from '../io/logger.js';
import { PlaywrightDriver } from '../io/playwright-driver.js';
import { writeRunResults } from '../io/results.js';

export interface ExecuteRunParams {
  /** The staging app, such as https://staging.shop.example. The flow's `start` is resolved against it. */
  readonly url: string;
  readonly flow: Flow;
  readonly flowSource: string;
  readonly resultsDir: string;
  readonly budgets: Budgets;
  readonly ai: AiClient;
  readonly policy?: UrlPolicyOptions;
  readonly account?: Account;
  /** Secret values to scrub everywhere. */
  readonly secrets: readonly string[];
  readonly signal?: AbortSignal;
  readonly headless?: boolean;
  readonly executablePath?: string;
  readonly minRequestIntervalMs?: number;
  readonly blockedPaths?: readonly string[];
  readonly clock?: Clock;
  readonly runId?: string;
}

export interface ExecuteRunOutcome {
  readonly result: RunResult;
  readonly dir: string;
  readonly artifacts: DriverArtifacts;
  readonly exitCode: number;
}

function setupFailure(
  runId: string,
  flow: Flow,
  problem: string,
  elapsedSeconds: number,
): RunResult {
  const { verdict, reason } = decideVerdict({
    setupProblem: problem,
    findings: [],
    allStepsPassed: false,
  });
  return {
    runId,
    flow: flow.flow,
    verdict,
    reason,
    steps: 0,
    durationSeconds: elapsedSeconds,
    cost: { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 },
    stepResults: flow.steps.map((s, i) => ({
      index: i,
      text: s.text,
      ...(s.expect !== undefined ? { expect: s.expect } : {}),
      status: 'pending' as const,
    })),
    findings: [],
    actions: [],
    assertions: [],
    finalUrl: '',
    promptVersion: PROMPT_VERSION,
    model: '',
  };
}

/**
 * Runs one flow end to end: opens the browser, runs the agent loop, always closes the browser, and writes
 * everything to `<resultsDir>/<run-id>/`. Never throws for run problems: they become verdicts.
 * @throws UrlPolicyError when the URL breaks the staging-only or SSRF rules (nothing is started).
 */
export async function executeRun(p: ExecuteRunParams): Promise<ExecuteRunOutcome> {
  const startUrl = checkTestUrl(new URL(p.flow.start, p.url).href, p.policy);
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

  const driver = new PlaywrightDriver({
    baseUrl: startUrl.href,
    evidenceDir: dir,
    ...(p.policy ? { urlPolicy: p.policy } : {}),
    ...(p.headless !== undefined ? { headless: p.headless } : {}),
    ...(p.executablePath ? { executablePath: p.executablePath } : {}),
    ...(p.minRequestIntervalMs !== undefined
      ? { minRequestIntervalMs: p.minRequestIntervalMs }
      : {}),
    ...(p.blockedPaths ? { blockedPaths: p.blockedPaths } : {}),
  });

  const execute = async (): Promise<RunResult> => {
    if (p.flow.login && !p.account) {
      return setupFailure(
        runId,
        p.flow,
        `no saved test account "${p.flow.login}" was found in the environment`,
        0,
      );
    }
    try {
      await driver.start();
    } catch (e) {
      const msg = redactString(
        e instanceof Error ? (e.message.split('\n')[0] ?? 'error') : String(e),
        p.secrets,
      );
      log.error({ event: 'start_failed', error: msg });
      return setupFailure(
        runId,
        p.flow,
        `could not open the app: ${msg}`,
        (clock.now() - startedAtMs) / 1000,
      );
    }
    return runFlow(
      {
        driver,
        ai: p.ai,
        clock,
        log,
        ...(p.account ? { account: p.account } : {}),
        secrets: p.secrets,
      },
      p.flow,
      { runId, budgets: p.budgets, ...(p.signal ? { signal: p.signal } : {}) },
    );
  };

  let result: RunResult;
  let artifacts: DriverArtifacts;
  try {
    result = await execute();
  } finally {
    artifacts = await driver.stop();
  }
  await writeRunResults(
    dir,
    result,
    artifacts,
    {
      startedAt: new Date(startedAtMs).toISOString(),
      url: p.url,
      flowSource: p.flowSource,
      budgets: p.budgets,
    },
    p.secrets,
  );
  return { result, dir, artifacts, exitCode: exitCodeFor(result.verdict) };
}
