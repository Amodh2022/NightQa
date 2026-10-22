import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseBugSelection } from '../zoo/bugs.js';
import { ZooCheckoutAi } from '../zoo/scripted-ai.js';
import { startZoo, type ZooHandle } from '../zoo/server.js';
import { executeRun } from '../src/app/execute-run.js';
import { writeFailingTest } from '../src/app/write-failing-test.js';
import { buildCandidates } from '../src/core/repro/candidate.js';
import { bugId } from '../src/core/repro/fingerprint.js';
import { recipeActions } from '../src/core/repro/reproduce.js';
import { rateSeverity } from '../src/core/repro/severity.js';
import type { BugCandidate, Reproduction } from '../src/core/repro/types.js';
import { runSpec } from '../src/io/run-spec.js';
import { loadFlowFile } from '../src/io/load-flow.js';

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

function reproOf(c: BugCandidate): Reproduction {
  return {
    id: c.id,
    status: 'confirmed',
    reproducedCount: 3,
    attemptCount: 3,
    attempts: [],
    recipe: recipeActions(c),
    originalActionCount: recipeActions(c).length,
    severity: rateSeverity(c),
    title: 'Test bug',
    expectedText: '',
    actualText: '',
  };
}

function sig(
  finding: BugCandidate['finding'],
  start: string,
  actions: BugCandidate['actions'] = [],
): BugCandidate {
  return {
    id: bugId(finding, 'Sig', undefined),
    finding,
    runId: 'R',
    flow: 'Sig',
    start,
    tags: [],
    steps: ['go'],
    actions,
  };
}

const click = (role: string, name: string) => ({
  stepIndex: 0,
  action: { kind: 'click' as const, target: { by: 'role' as const, role, name, nth: 0 } },
});

async function checkoutCandidate(bug: string): Promise<BugCandidate> {
  const z = await zoo(bug);
  const { flow } = await loadFlowFile('flows/checkout.yaml');
  const out = await executeRun({
    url: z.url,
    flow,
    flowSource: 'x',
    resultsDir: await mkdtemp(join(tmpdir(), 'nightqa-ft-')),
    budgets: { maxSteps: 40, maxSeconds: 120, maxCostUsd: 0.5 },
    ai: new ZooCheckoutAi(),
    policy,
    secrets: [],
    minRequestIntervalMs: 0,
  });
  const [c] = buildCandidates(out.result, flow);
  if (!c) throw new Error(`no candidate for ${bug}`);
  return c;
}

describe('failing test writer', () => {
  const cases: { name: string; bug: string; make: () => Promise<BugCandidate> }[] = [
    { name: 'B09 pay button disabled', bug: 'B09', make: () => checkoutCandidate('B09') },
    { name: 'B10 order number undefined', bug: 'B10', make: () => checkoutCandidate('B10') },
    {
      name: 'B04 server error',
      bug: 'B04',
      make: () =>
        Promise.resolve(
          sig(
            {
              kind: 'http-5xx',
              message: '500 from http://h/api/search?q=a',
              stepIndex: 0,
              url: 'http://h/api/search?q=a',
            },
            '/products',
            [
              {
                stepIndex: 0,
                action: {
                  kind: 'type',
                  target: { by: 'label', name: 'Search', nth: 0 },
                  text: 'a & b',
                },
              },
              click('button', 'Go'),
            ],
          ),
        ),
    },
    {
      name: 'B05 dead link',
      bug: 'B05',
      make: () =>
        Promise.resolve(
          sig(
            {
              kind: 'dead-link',
              message: 'Page not found: http://h/returns',
              stepIndex: 0,
              url: 'http://h/returns',
            },
            '/products',
            [click('link', 'Returns policy')],
          ),
        ),
    },
    {
      name: 'B06 blank page',
      bug: 'B06',
      make: () =>
        Promise.resolve(
          sig(
            {
              kind: 'blank-page',
              message: 'the page is blank',
              stepIndex: 0,
              url: 'http://h/orders',
            },
            '/products',
            [click('link', 'Orders')],
          ),
        ),
    },
    {
      name: 'B07 endless spinner',
      bug: 'B07',
      make: () =>
        Promise.resolve(
          sig(
            {
              kind: 'spinner',
              message: 'a loading indicator never went away',
              stepIndex: 0,
              url: 'http://h/product/tshirt',
            },
            '/product/tshirt',
          ),
        ),
    },
  ];

  for (const c of cases) {
    it(`${c.name}: fails for the bug's reason on the buggy shop, passes on the clean shop`, async () => {
      const candidate = await c.make();
      const buggy = await zoo(c.bug);
      const out = await writeFailingTest({
        url: buggy.url,
        candidate,
        reproduction: reproOf(candidate),
        dir: await mkdtemp(join(tmpdir(), 'nightqa-spec-out-')),
        policy,
      });
      expect(out.judgement, out.run.message).toEqual({ valid: true });
      expect(out.proven).toBe(true);
      expect(out.code).toContain('NIGHTQA-BUG');
      expect(out.code).not.toContain('zoo-pass');

      const clean = await zoo('none');
      const fixed = await runSpec(out.specPath, { baseUrl: clean.url });
      expect(fixed.status, fixed.message).toBe('passed');
    }, 180_000);
  }

  it('refuses to run against a URL that breaks the safety rules', async () => {
    const candidate = sig(
      { kind: 'blank-page', message: 'x', stepIndex: 0, url: 'http://h/x' },
      '/',
    );
    await expect(
      writeFailingTest({
        url: 'http://169.254.169.254/',
        candidate,
        reproduction: reproOf(candidate),
        dir: await mkdtemp(join(tmpdir(), 'nightqa-spec-out-')),
        policy: { allowPrivateNetwork: true },
      }),
    ).rejects.toThrow();
  });
});
