import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseBugSelection } from '../zoo/bugs.js';
import { ZooCheckoutAi } from '../zoo/scripted-ai.js';
import { startZoo, type ZooHandle } from '../zoo/server.js';
import { executeReplay } from '../src/app/execute-replay.js';
import { executeRun } from '../src/app/execute-run.js';
import { investigateRun, nullLog } from '../src/app/investigate.js';
import { buildRecording, flowFromRecording } from '../src/core/recording.js';
import { loadFlowFile } from '../src/io/load-flow.js';

const policy = { allowPrivateNetwork: true };
const budgets = { maxSteps: 40, maxSeconds: 120, maxCostUsd: 0.5 };
const zoos: ZooHandle[] = [];
afterEach(async () => {
  await Promise.all(zoos.splice(0).map((z) => z.close()));
});
const zoo = async (bugs: string) => {
  const z = await startZoo({ bugs: parseBugSelection(bugs) });
  zoos.push(z);
  return z;
};

describe('a saved test that starts failing', () => {
  it('goes through the same proof gates as an AI-found bug', async () => {
    const clean = await zoo('none');
    const { flow } = await loadFlowFile('flows/checkout.yaml');
    const resultsDir = await mkdtemp(join(tmpdir(), 'nightqa-regr-'));
    const first = await executeRun({
      url: clean.url,
      flow,
      flowSource: 'x',
      resultsDir,
      budgets,
      ai: new ZooCheckoutAi(),
      policy,
      secrets: [],
      minRequestIntervalMs: 0,
    });
    expect(first.result.verdict, first.result.reason).toBe('pass');
    const rec = buildRecording(first.result, flow, {
      flowSource: 'x',
      createdAt: new Date().toISOString(),
    });

    const broken = await zoo('B10');
    const replay = await executeReplay({
      url: broken.url,
      recording: rec,
      recordingSource: 'x',
      resultsDir,
      budgets,
      policy,
      secrets: [],
      minRequestIntervalMs: 0,
      assertTimeoutMs: 1500,
    });
    expect(replay.result.verdict).toBe('bug');
    expect(replay.result.failure?.missingText).toEqual(['Your order number is ORD-']);

    const records = await investigateRun({
      url: broken.url,
      result: replay.result,
      flow: flowFromRecording(rec),
      artifacts: replay.artifacts,
      resultsDir,
      testsDir: 'tests/nightqa',
      minSeverity: 'medium',
      maxBugs: 5,
      policy,
      secrets: [],
      minRequestIntervalMs: 0,
      log: nullLog,
    });
    expect(records).toHaveLength(1);
    expect(records[0]?.status).toBe('ready');
    expect(records[0]?.reproduced).toBe(3);
    expect(records[0]?.test?.proven).toBe(true);
  }, 240_000);
});
