import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { parseBugSelection } from '../zoo/bugs.js';
import { startZoo, type ZooHandle } from '../zoo/server.js';
import { executeRun } from '../src/app/execute-run.js';
import { buildRecording } from '../src/core/recording.js';
import { loadFlowFile } from '../src/io/load-flow.js';
import { saveRegressionTest } from '../src/io/save-test.js';
import { ZooCheckoutAi } from './helpers/zoo-ai.js';

const exec = promisify(execFile);
const tsx = join(process.cwd(), 'node_modules', '.bin', 'tsx');
const zoos: ZooHandle[] = [];

afterEach(async () => {
  await Promise.all(zoos.splice(0).map((z) => z.close()));
});

async function cli(args: string[]): Promise<{ code: number; out: string }> {
  // no API key in the environment: replay must work without one
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  try {
    const r = await exec(tsx, ['src/cli.ts', ...args], { env });
    return { code: 0, out: r.stdout + r.stderr };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return { code: err.code ?? -1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

describe('nightqa CLI (real process under tsx)', () => {
  it('shows help and rejects unknown commands', async () => {
    expect((await cli(['--help'])).out).toContain('nightqa replay');
    expect((await cli(['frobnicate'])).code).toBe(2);
  });

  it('refuses production-looking URLs and loopback by default, before anything else', async () => {
    const prod = await cli([
      'run',
      '--url',
      'https://shopkart.in',
      '--flow',
      'flows/checkout.yaml',
    ]);
    expect(prod.code).toBe(2);
    expect(prod.out).toContain('looks like production');
    const local = await cli([
      'run',
      '--url',
      'http://127.0.0.1:4010',
      '--flow',
      'flows/checkout.yaml',
    ]);
    expect(local.code).toBe(2);
    expect(local.out).toContain('--allow-private-network');
  });

  it('replays a saved test with no AI and no API key: pass on a clean shop, exit 1 on a regression', async () => {
    const clean = await startZoo({ bugs: parseBugSelection('none') });
    const broken = await startZoo({ bugs: parseBugSelection('B08') });
    zoos.push(clean, broken);
    const { flow } = await loadFlowFile('flows/checkout.yaml');
    const base = await mkdtemp(join(tmpdir(), 'nightqa-cli-'));
    const recorded = await executeRun({
      url: clean.url,
      flow,
      flowSource: 'flows/checkout.yaml',
      resultsDir: join(base, 'results'),
      budgets: { maxSteps: 40, maxSeconds: 120, maxCostUsd: 0.5 },
      ai: new ZooCheckoutAi(),
      policy: { allowPrivateNetwork: true },
      secrets: [],
      minRequestIntervalMs: 0,
    });
    expect(recorded.result.verdict, recorded.result.reason).toBe('pass');
    const testsDir = join(base, 'tests');
    await saveRegressionTest(
      testsDir,
      buildRecording(recorded.result, flow, {
        flowSource: 'flows/checkout.yaml',
        createdAt: new Date().toISOString(),
      }),
    );

    const ok = await cli([
      'replay',
      '--url',
      clean.url,
      '--test',
      testsDir,
      '--allow-private-network',
      '--results',
      join(base, 'r1'),
    ]);
    expect(ok.code, ok.out).toBe(0);
    expect(ok.out).toContain('PASS  Checkout with card');
    expect(ok.out).toContain('ai calls: 0');
    expect(ok.out).toContain('cost: $0.0000');

    const bad = await cli([
      'replay',
      '--url',
      broken.url,
      '--test',
      testsDir,
      '--allow-private-network',
      '--results',
      join(base, 'r2'),
    ]);
    expect(bad.code, bad.out).toBe(1);
    expect(bad.out).toContain('BUG  Checkout with card');
  });
});
