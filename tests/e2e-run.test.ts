import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseBugSelection } from '../zoo/bugs.js';
import { startZoo, type ZooHandle } from '../zoo/server.js';
import { executeRun } from '../src/app/execute-run.js';
import { UrlPolicyError } from '../src/core/url-policy.js';
import { loadFlowFile } from '../src/io/load-flow.js';
import { ZooCheckoutAi } from './helpers/zoo-ai.js';

const budgets = { maxSteps: 40, maxSeconds: 120, maxCostUsd: 0.5 };
let zoo: ZooHandle | undefined;

afterEach(async () => {
  await zoo?.close();
  zoo = undefined;
});

async function run(bugs: string, extra: Record<string, unknown> = {}) {
  zoo = await startZoo({ bugs: parseBugSelection(bugs) });
  const { flow } = await loadFlowFile('flows/checkout.yaml');
  const resultsDir = await mkdtemp(join(tmpdir(), 'nightqa-results-'));
  const ai = new ZooCheckoutAi();
  const outcome = await executeRun({
    url: zoo.url,
    flow,
    flowSource: 'flows/checkout.yaml',
    resultsDir,
    budgets,
    ai,
    policy: { allowPrivateNetwork: true },
    secrets: [],
    minRequestIntervalMs: 0,
    ...extra,
  });
  return { outcome, ai, resultsDir };
}

describe('nightqa run on the zoo (scripted model, real browser)', () => {
  it('passes on the clean shop and writes every artifact', async () => {
    const { outcome, ai } = await run('none');
    expect(outcome.result.verdict).toBe('pass');
    expect(outcome.exitCode).toBe(0);
    expect(outcome.result.cost.calls).toBe(ai.calls);
    expect(outcome.result.cost.usd).toBeGreaterThan(0);
    expect(outcome.result.stepResults.map((s) => s.status)).toEqual(['passed', 'passed', 'passed']);

    const files = readdirSync(outcome.dir);
    expect(files).toEqual(
      expect.arrayContaining([
        'result.json',
        'actions.json',
        'run.jsonl',
        'trace.zip',
        'video',
        'screenshots',
      ]),
    );
    expect(readdirSync(join(outcome.dir, 'video')).length).toBeGreaterThan(0);
    expect(readdirSync(join(outcome.dir, 'screenshots')).length).toBeGreaterThanOrEqual(3);

    const json = JSON.parse(readFileSync(join(outcome.dir, 'result.json'), 'utf8')) as {
      verdict: string;
      artifacts: { video: string; trace: string };
      cost: { usd: number };
      promptVersion: string;
    };
    expect(json.verdict).toBe('pass');
    expect(json.promptVersion).toBe('agent-v1');
    expect(existsSync(join(outcome.dir, json.artifacts.trace))).toBe(true);
    expect(existsSync(join(outcome.dir, json.artifacts.video))).toBe(true);

    const log = readFileSync(join(outcome.dir, 'run.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(log.every((l) => l.runId === outcome.result.runId)).toBe(true);
    expect(log.filter((l) => l.event === 'ai_call').length).toBe(ai.calls);
    expect(log.at(-1)?.event).toBe('run_finished');
  });

  it('finds B08 (wrong size) as a bug', async () => {
    const { outcome } = await run('B08');
    expect(outcome.result.verdict).toBe('bug');
    expect(outcome.exitCode).toBe(1);
    expect(outcome.result.findings[0]?.kind).toBe('expectation-failed');
    expect(outcome.result.findings[0]?.message).toContain('size M');
  });

  it('finds B09 (Pay button disabled) as a bug', async () => {
    const { outcome } = await run('B09');
    expect(outcome.result.verdict).toBe('bug');
    expect(outcome.result.findings[0]?.message).toContain('disabled');
  });

  it('finds B10 (order number undefined) as a bug', async () => {
    const { outcome } = await run('B10');
    expect(outcome.result.verdict).toBe('bug');
    expect(outcome.result.findings[0]?.message).toContain('undefined');
  });

  it('is needs_setup, not a bug, when staging is down, and still closes cleanly', async () => {
    zoo = await startZoo({ bugs: parseBugSelection('none') });
    const url = zoo.url;
    await zoo.close();
    zoo = undefined;
    const { flow } = await loadFlowFile('flows/checkout.yaml');
    const outcome = await executeRun({
      url,
      flow,
      flowSource: 'x',
      resultsDir: await mkdtemp(join(tmpdir(), 'nightqa-results-')),
      budgets,
      ai: new ZooCheckoutAi(),
      policy: { allowPrivateNetwork: true },
      secrets: [],
    });
    expect(outcome.result.verdict).toBe('needs_setup');
    expect(outcome.result.cost.calls).toBe(0);
    expect(outcome.exitCode).toBe(3);
  });

  it('is needs_setup when the flow needs a test account that is not configured', async () => {
    zoo = await startZoo({ bugs: parseBugSelection('none') });
    const { flow } = await loadFlowFile('flows/checkout.yaml');
    const outcome = await executeRun({
      url: zoo.url,
      flow: { ...flow, login: 'test-buyer' },
      flowSource: 'x',
      resultsDir: await mkdtemp(join(tmpdir(), 'nightqa-results-')),
      budgets,
      ai: new ZooCheckoutAi(),
      policy: { allowPrivateNetwork: true },
      secrets: [],
    });
    expect(outcome.result.verdict).toBe('needs_setup');
    expect(outcome.result.reason).toContain('test-buyer');
  });

  it('refuses production-looking URLs before starting anything', async () => {
    const { flow } = await loadFlowFile('flows/checkout.yaml');
    const resultsDir = await mkdtemp(join(tmpdir(), 'nightqa-results-'));
    await expect(
      executeRun({
        url: 'https://shopkart.in',
        flow,
        flowSource: 'x',
        resultsDir,
        budgets,
        ai: new ZooCheckoutAi(),
        secrets: [],
      }),
    ).rejects.toBeInstanceOf(UrlPolicyError);
    expect(readdirSync(resultsDir)).toEqual([]);
  });
});
