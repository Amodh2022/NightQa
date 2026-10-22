import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { parseBugSelection } from '../zoo/bugs.js';
import { startZoo, type ZooHandle } from '../zoo/server.js';
import { executeReplay } from '../src/app/execute-replay.js';
import { executeRun } from '../src/app/execute-run.js';
import { buildRecording, parseRecording } from '../src/core/recording.js';
import { loadFlowFile } from '../src/io/load-flow.js';
import { saveRegressionTest } from '../src/io/save-test.js';
import { ZooCheckoutAi } from '../zoo/scripted-ai.js';

const run = promisify(execFile);
const budgets = { maxSteps: 40, maxSeconds: 120, maxCostUsd: 0.5 };
const policy = { allowPrivateNetwork: true };
const zoos: ZooHandle[] = [];

afterEach(async () => {
  await Promise.all(zoos.splice(0).map((z) => z.close()));
});

async function zoo(bugs: string): Promise<ZooHandle> {
  const z = await startZoo({ bugs: parseBugSelection(bugs) });
  zoos.push(z);
  return z;
}

/** Records a passing run on the clean shop and saves it as a regression test. */
async function recordRegression() {
  const clean = await zoo('none');
  const { flow } = await loadFlowFile('flows/checkout.yaml');
  const out = await executeRun({
    url: clean.url,
    flow,
    flowSource: 'flows/checkout.yaml',
    resultsDir: await mkdtemp(join(tmpdir(), 'nightqa-results-')),
    budgets,
    ai: new ZooCheckoutAi(),
    policy,
    secrets: [],
    minRequestIntervalMs: 0,
  });
  expect(out.result.verdict, out.result.reason).toBe('pass');
  const rec = buildRecording(out.result, flow, {
    flowSource: 'flows/checkout.yaml',
    createdAt: new Date().toISOString(),
  });
  const testsDir = await mkdtemp(join(tmpdir(), 'nightqa-tests-'));
  const saved = await saveRegressionTest(testsDir, rec);
  return { rec, saved, testsDir };
}

describe('saved regression tests', () => {
  it('saves a recording and a plain Playwright spec, and never overwrites silently', async () => {
    const { rec, saved } = await recordRegression();
    expect(saved.saved).toBe(true);
    expect(parseRecording(readFileSync(saved.recordingPath, 'utf8')).runId).toBe(rec.runId);
    const spec = readFileSync(saved.specPath, 'utf8');
    expect(spec).toContain("from '@playwright/test'");
    expect(spec).not.toContain('nightqa');
    const again = await saveRegressionTest(join(saved.recordingPath, '..'), {
      ...rec,
      runId: 'OTHER',
    });
    expect(again.saved).toBe(false);
    expect(parseRecording(readFileSync(saved.recordingPath, 'utf8')).runId).toBe(rec.runId);
  });

  it('replays with zero AI calls and zero cost, and passes on the clean shop', async () => {
    const { rec } = await recordRegression();
    const clean = await zoo('none');
    const out = await executeReplay({
      url: clean.url,
      recording: rec,
      recordingSource: 'rec.json',
      resultsDir: await mkdtemp(join(tmpdir(), 'nightqa-results-')),
      budgets,
      policy,
      secrets: [],
      minRequestIntervalMs: 0,
    });
    expect(out.result.verdict, out.result.reason).toBe('pass');
    expect(out.attempts).toBe(1);
    expect(out.flaky).toBe(false);
    expect(out.result.cost).toEqual({ calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 });
    const log = (await readFile(join(out.dir, 'run.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(log.some((l) => l.event === 'ai_call')).toBe(false);
    expect(log.find((l) => l.event === 'replay_finished')).toMatchObject({
      aiCalls: 0,
      costUsd: 0,
    });
    expect(existsSync(join(out.dir, 'result.json'))).toBe(true);
    expect(existsSync(join(out.dir, 'attempt-1', 'trace.zip'))).toBe(true);
  });

  it('retries once, then reports a bug candidate when the app regressed (B08)', async () => {
    const { rec } = await recordRegression();
    const broken = await zoo('B08');
    const out = await executeReplay({
      url: broken.url,
      recording: rec,
      recordingSource: 'rec.json',
      resultsDir: await mkdtemp(join(tmpdir(), 'nightqa-results-')),
      budgets,
      policy,
      secrets: [],
      minRequestIntervalMs: 0,
      assertTimeoutMs: 1000,
    });
    expect(out.result.verdict).toBe('bug');
    expect(out.attempts).toBe(2);
    expect(out.flaky).toBe(false);
    expect(out.result.findings[0]?.message).toContain('size M');
    expect(out.exitCode).toBe(1);
  });

  it('reports needs_setup, not a bug, when the app is down', async () => {
    const { rec } = await recordRegression();
    const down = await zoo('none');
    const url = down.url;
    await down.close();
    zoos.length = 0;
    const out = await executeReplay({
      url,
      recording: rec,
      recordingSource: 'rec.json',
      resultsDir: await mkdtemp(join(tmpdir(), 'nightqa-results-')),
      budgets,
      policy,
      secrets: [],
    });
    expect(out.result.verdict).toBe('needs_setup');
    expect(out.attempts).toBe(1);
  });

  it('generates a spec the customer can run with plain Playwright, without NightQA', async () => {
    const { saved } = await recordRegression();
    const dir = join(process.cwd(), 'tests', '.generated', String(Date.now()));
    await mkdir(dir, { recursive: true });
    try {
      await writeFile(join(dir, 'checkout.spec.ts'), readFileSync(saved.specPath, 'utf8'));
      await writeFile(
        join(dir, 'playwright.config.mjs'),
        `export default { testDir: '.', testMatch: '*.spec.ts', reporter: 'line', workers: 1, outputDir: ${JSON.stringify(join(dir, 'out'))} };\n`,
      );
      const bin = join(process.cwd(), 'node_modules', '.bin', 'playwright');
      const cfg = join(dir, 'playwright.config.mjs');
      const clean = await zoo('none');
      const ok = await run(bin, ['test', '--config', cfg], {
        env: { ...process.env, NIGHTQA_BASE_URL: clean.url },
      });
      expect(ok.stdout).toMatch(/1 passed/);
      const broken = await zoo('B08');
      await expect(
        run(bin, ['test', '--config', cfg], {
          env: { ...process.env, NIGHTQA_BASE_URL: broken.url },
        }),
      ).rejects.toMatchObject({ code: 1 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
