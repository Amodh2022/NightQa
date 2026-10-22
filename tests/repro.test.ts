import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseBugSelection } from '../zoo/bugs.js';
import { ZooCheckoutAi } from '../zoo/scripted-ai.js';
import { startZoo, type ZooHandle } from '../zoo/server.js';
import { executeReproduction } from '../src/app/execute-repro.js';
import { executeRun } from '../src/app/execute-run.js';
import { buildCandidates } from '../src/core/repro/candidate.js';
import { bugId } from '../src/core/repro/fingerprint.js';
import type { BugCandidate } from '../src/core/repro/types.js';
import type { Log } from '../src/core/ports.js';
import { loadFlowFile } from '../src/io/load-flow.js';

const budgets = { maxSteps: 40, maxSeconds: 120, maxCostUsd: 0.5 };
const policy = { allowPrivateNetwork: true };
const zoos: ZooHandle[] = [];
const log: Log = { info: () => undefined, warn: () => undefined, error: () => undefined };

afterEach(async () => {
  await Promise.all(zoos.splice(0).map((z) => z.close()));
});

async function zoo(bugs: string): Promise<ZooHandle> {
  const z = await startZoo({ bugs: parseBugSelection(bugs) });
  zoos.push(z);
  return z;
}

async function reproduceCheckoutBug(bug: string) {
  const z = await zoo(bug);
  const { flow } = await loadFlowFile('flows/checkout.yaml');
  const resultsDir = await mkdtemp(join(tmpdir(), 'nightqa-repro-'));
  const run = await executeRun({
    url: z.url,
    flow,
    flowSource: 'flows/checkout.yaml',
    resultsDir,
    budgets,
    ai: new ZooCheckoutAi(),
    policy,
    secrets: [],
    minRequestIntervalMs: 0,
  });
  expect(run.result.verdict, run.result.reason).toBe('bug');
  const [candidate] = buildCandidates(run.result, flow);
  expect(candidate).toBeDefined();
  if (!candidate) throw new Error('unreachable');
  const repro = await executeReproduction({
    url: z.url,
    candidate,
    evidenceDir: join(resultsDir, 'repro'),
    log,
    policy,
    secrets: [],
    minRequestIntervalMs: 0,
  });
  return { repro, candidate };
}

function signalCandidate(
  over: Partial<BugCandidate> & Pick<BugCandidate, 'finding'>,
): BugCandidate {
  return {
    id: bugId(over.finding, 'Signal', undefined),
    runId: 'R',
    flow: 'Signal',
    start: '/products',
    tags: [],
    steps: ['go'],
    actions: [],
    ...over,
  };
}

async function reproSignal(bug: string, c: BugCandidate) {
  const z = await zoo(bug);
  return executeReproduction({
    url: z.url,
    candidate: c,
    evidenceDir: await mkdtemp(join(tmpdir(), 'nightqa-repro-')),
    log,
    policy,
    secrets: [],
    minRequestIntervalMs: 0,
  });
}

describe('reproducer against the bug zoo (no AI in any replay)', () => {
  it('confirms the critical checkout bug (B09) 3/3 and rates it critical', async () => {
    const { repro } = await reproduceCheckoutBug('B09');
    expect(repro.status).toBe('confirmed');
    expect(repro.reproducedCount).toBe(repro.attemptCount);
    expect(repro.severity).toBe('critical');
    expect(repro.recipe.length).toBeGreaterThan(0);
  }, 120_000);

  it('confirms a wrong value shown on the confirmation page (B10)', async () => {
    const { repro } = await reproduceCheckoutBug('B10');
    expect(repro.status).toBe('confirmed');
  }, 120_000);

  it('confirms a server error from a search with an ampersand (B04) and shortens it', async () => {
    const r = await reproSignal(
      'B04',
      signalCandidate({
        finding: {
          kind: 'http-5xx',
          message: '500 from http://127.0.0.1:4010/api/search?q=a%20%26%20b',
          stepIndex: 0,
          url: 'http://127.0.0.1/api/search?q=a%20%26%20b',
        },
        actions: [
          { stepIndex: 0, action: { kind: 'scroll', direction: 'down' } },
          {
            stepIndex: 0,
            action: {
              kind: 'type',
              target: { by: 'label', name: 'Search', nth: 0 },
              text: 'a & b',
            },
          },
          {
            stepIndex: 0,
            action: { kind: 'click', target: { by: 'role', role: 'button', name: 'Go', nth: 0 } },
          },
        ],
      }),
    );
    expect(r.status).toBe('confirmed');
    expect(r.recipe.map((a) => a.action.kind)).toEqual(['type', 'click']);
  }, 120_000);

  it('confirms a blank page (B06) and an endless spinner (B07)', async () => {
    const blank = await reproSignal(
      'B06',
      signalCandidate({
        finding: {
          kind: 'blank-page',
          message: 'the page is blank',
          stepIndex: 0,
          url: 'http://x/orders',
        },
        actions: [
          {
            stepIndex: 0,
            action: { kind: 'click', target: { by: 'role', role: 'link', name: 'Orders', nth: 0 } },
          },
        ],
      }),
    );
    expect(blank.status).toBe('confirmed');
    const spin = await reproSignal(
      'B07',
      signalCandidate({
        start: '/product/tshirt',
        finding: {
          kind: 'spinner',
          message: 'a loading indicator never went away',
          stepIndex: 0,
          url: 'http://x/product/tshirt',
        },
      }),
    );
    expect(spin.status).toBe('confirmed');
    expect(spin.recipe).toHaveLength(0);
  }, 120_000);

  it('discards a suspected bug that does not happen on the clean shop', async () => {
    const r = await reproSignal(
      'none',
      signalCandidate({
        finding: {
          kind: 'blank-page',
          message: 'the page is blank',
          stepIndex: 0,
          url: 'http://x/orders',
        },
        actions: [
          {
            stepIndex: 0,
            action: { kind: 'click', target: { by: 'role', role: 'link', name: 'Orders', nth: 0 } },
          },
        ],
      }),
    );
    expect(r.status).toBe('not_reproduced');
    expect(r.reproducedCount).toBe(0);
  }, 120_000);

  it('discards a failed expectation that carries no replayable proof (fail closed)', async () => {
    const r = await reproSignal(
      'B09',
      signalCandidate({
        finding: {
          kind: 'expectation-failed',
          message: 'm',
          stepIndex: 0,
          url: 'http://x/checkout',
        },
      }),
    );
    expect(r.status).toBe('not_reproduced');
  }, 120_000);
});
