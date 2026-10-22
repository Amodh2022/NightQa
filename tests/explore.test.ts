import { readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseBugSelection } from '../zoo/bugs.js';
import { startZoo, type ZooHandle } from '../zoo/server.js';
import { executeRun } from '../src/app/execute-run.js';
import { exploreFlow } from '../src/core/personas.js';
import type { AiClient, DecideResult } from '../src/core/ports.js';
import { readCoverage } from '../src/io/coverage.js';

const zoos: ZooHandle[] = [];
afterEach(async () => {
  await Promise.all(zoos.splice(0).map((z) => z.close()));
});

/** Visits one page per part (products, cart, orders) and vouches for what it sees. */
class WanderingAi implements AiClient {
  private readonly paths = ['/products', '/cart', '/orders'];
  decide(req: { userText: string }): Promise<DecideResult> {
    const t = req.userText;
    const step = Number(/CURRENT STEP (\d+)/.exec(t)?.[1] ?? '1');
    const target = this.paths[step - 1] ?? '/products';
    const path = new URL(/PAGE: (\S+)/.exec(t)?.[1] ?? 'http://x/').pathname;
    const page =
      /<untrusted_page_content>\n([\s\S]*?)\n<\/untrusted_page_content>/.exec(t)?.[1] ?? '';
    const firstLine = page.split('\n').find((l) => l.trim()) ?? '';
    const call =
      path !== target
        ? { name: 'navigate', input: { path: target } }
        : {
            name: 'expect',
            input: {
              statement: 'page looks fine',
              result: 'pass',
              evidence: 'saw it',
              visible_text: [firstLine],
            },
          };
    return Promise.resolve({
      reasoning: 'x',
      call,
      usage: { inputTokens: 1, outputTokens: 1 },
      costUsd: 0,
      model: 'wander',
    });
  }
}

async function explore(bugs: string, resultsDir: string, known: string[] = []) {
  const z = await startZoo({ bugs: parseBugSelection(bugs) });
  zoos.push(z);
  return executeRun({
    url: z.url,
    flow: exploreFlow('first-time-buyer', known, 3),
    flowSource: 'explore:first-time-buyer',
    resultsDir,
    budgets: { maxSteps: 40, maxSeconds: 120, maxCostUsd: 1 },
    ai: new WanderingAi(),
    policy: { allowPrivateNetwork: true },
    secrets: [],
    minRequestIntervalMs: 0,
    explore: { persona: 'first-time-buyer' },
  });
}

describe('exploration', () => {
  it('builds a persona flow that steers away from known pages', () => {
    const f = exploreFlow('careless-typer', ['/a', '/b'], 2);
    expect(f.steps).toHaveLength(2);
    expect(f.steps[0]?.text).toContain('+91 98765 43210');
    expect(f.steps[0]?.text).toContain('/a, /b');
  });

  it('records visited pages and coverage memory, and finds a blank page as a bug', async () => {
    const resultsDir = await mkdtemp(join(tmpdir(), 'nightqa-explore-'));
    const first = await explore('B06', resultsDir);
    const json = JSON.parse(readFileSync(join(first.dir, 'result.json'), 'utf8')) as {
      kind: string;
      persona: string;
      visited: string[];
      newPages: string[];
      verdict: string;
      findings: { kind: string }[];
    };
    expect(json.kind).toBe('explore');
    expect(json.persona).toBe('first-time-buyer');
    expect(json.visited).toEqual(expect.arrayContaining(['/products', '/cart', '/orders']));
    expect(json.newPages).toEqual(expect.arrayContaining(['/products', '/orders']));
    expect(json.verdict).toBe('bug');
    expect(json.findings.some((f) => f.kind === 'blank-page')).toBe(true);

    const cov = await readCoverage(resultsDir);
    expect(Object.keys(cov.pages)).toEqual(
      expect.arrayContaining(['/products', '/cart', '/orders']),
    );

    const second = await explore('none', resultsDir, Object.keys(cov.pages));
    const again = JSON.parse(readFileSync(join(second.dir, 'result.json'), 'utf8')) as {
      newPages: string[];
      verdict: string;
    };
    expect(again.newPages).toEqual([]);
    expect(again.verdict).toBe('pass');
    expect((await readCoverage(resultsDir)).pages['/products']?.visits).toBe(2);
  }, 120_000);
});
