import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseBugSelection } from '../zoo/bugs.js';
import { ZooCheckoutAi } from '../zoo/scripted-ai.js';
import { startZoo, type ZooHandle } from '../zoo/server.js';
import { executeRun, type ExecuteRunOutcome } from '../src/app/execute-run.js';
import { investigateRun, nullLog, type InvestigateParams } from '../src/app/investigate.js';
import { syncBugs } from '../src/app/sync-bugs.js';
import { GitHubError } from '../src/core/errors.js';
import type { Flow } from '../src/core/flow/schema.js';
import { DEFAULT_POLICY } from '../src/core/github/report.js';
import type { Reproduction } from '../src/core/repro/types.js';
import { listBugRecords } from '../src/io/bug-store.js';
import { loadFlowFile } from '../src/io/load-flow.js';
import { FakeGitHub, MemLedger } from './helpers/fake-github.js';

const policy = { allowPrivateNetwork: true };
const zoos: ZooHandle[] = [];
afterEach(async () => {
  await Promise.all(zoos.splice(0).map((z) => z.close()));
});

async function buggyRun(bug: string) {
  const z = await startZoo({ bugs: parseBugSelection(bug) });
  zoos.push(z);
  const { flow } = await loadFlowFile('flows/checkout.yaml');
  const resultsDir = await mkdtemp(join(tmpdir(), 'nightqa-inv-'));
  const out = await executeRun({
    url: z.url,
    flow,
    flowSource: 'flows/checkout.yaml',
    resultsDir,
    budgets: { maxSteps: 40, maxSeconds: 120, maxCostUsd: 0.5 },
    ai: new ZooCheckoutAi(),
    policy,
    secrets: [],
    minRequestIntervalMs: 0,
  });
  expect(out.result.verdict, out.result.reason).toBe('bug');
  return { z, flow, out, resultsDir };
}

function params(
  ctx: { z: ZooHandle; flow: Flow; out: ExecuteRunOutcome; resultsDir: string },
  extra: Partial<InvestigateParams> = {},
): InvestigateParams {
  return {
    url: ctx.z.url,
    result: ctx.out.result,
    flow: ctx.flow,
    artifacts: ctx.out.artifacts,
    resultsDir: ctx.resultsDir,
    testsDir: 'tests/nightqa',
    minSeverity: 'medium',
    maxBugs: 5,
    policy,
    secrets: [],
    minRequestIntervalMs: 0,
    log: nullLog,
    now: () => new Date('2026-10-22T20:00:00Z'),
    ...extra,
  };
}

const fakeRepro = (status: Reproduction['status'], reproduced: number): Reproduction => ({
  id: 'x',
  status,
  reproducedCount: reproduced,
  attemptCount: 3,
  attempts: [],
  recipe: [],
  originalActionCount: 0,
  severity: 'high',
  title: 'T',
  expectedText: 'E',
  actualText: 'A',
});

describe('investigateRun: the proof gates, end to end on the bug zoo', () => {
  it('proves the critical checkout bug, files ONE issue and asks for a fix', async () => {
    const ctx = await buggyRun('B09');
    const github = new FakeGitHub();
    const records = await investigateRun(
      params(ctx, { github: { port: github, ledger: new MemLedger(), policy: DEFAULT_POLICY } }),
    );
    expect(records).toHaveLength(1);
    const rec = records[0];
    expect(rec?.status).toBe('reported');
    expect(rec?.severity).toBe('critical');
    expect(rec?.reproduced).toBe(3);
    expect(rec?.test?.proven).toBe(true);
    expect(rec?.test?.repoPath).toBe(`tests/nightqa/bugs/${rec?.id ?? ''}.spec.ts`);
    expect(rec?.fix?.status).toBe('requested');
    expect(github.issues).toHaveLength(1);
    expect(github.issues[0]?.body).toContain('NIGHTQA-BUG');
    expect(github.issues[0]?.labels).toContain('severity: critical');
    expect(github.comments.get(1)?.[0]?.body).toContain('@claude please fix');
    expect(
      existsSync(join(ctx.resultsDir, ctx.out.result.runId, 'bugs', rec?.id ?? '', 'bug.json')),
    ).toBe(true);

    // A second night with the same bug: no new issue, no second fix request.
    const again = await investigateRun(
      params(ctx, {
        github: { port: github, ledger: new MemLedger(), policy: DEFAULT_POLICY },
        result: { ...ctx.out.result, runId: 'NEXTNIGHT' },
      }),
    );
    expect(again[0]?.issue?.action).toBe('seen_again');
    expect(again[0]?.fix?.status).toBe('already_requested');
    expect(github.issues).toHaveLength(1);
  }, 240_000);

  it('without a repository the proven bug is saved as ready and nothing is filed', async () => {
    const ctx = await buggyRun('B10');
    const [rec] = await investigateRun(params(ctx));
    expect(rec?.status).toBe('ready');
    expect(rec?.statusNote).toContain('no GitHub repository');
  }, 240_000);

  it('does not file when GitHub fails, and keeps the proven bug as ready', async () => {
    const ctx = await buggyRun('B10');
    const github = new FakeGitHub();
    github.createIssue = () =>
      Promise.reject(new GitHubError('GitHub: create issue failed (500)', 500));
    const [rec] = await investigateRun(
      params(ctx, { github: { port: github, ledger: new MemLedger(), policy: DEFAULT_POLICY } }),
    );
    expect(rec?.status).toBe('ready');
    expect(rec?.statusNote).toContain('filing on GitHub failed');
  }, 240_000);

  it('flaky, non-reproducing, unproven and low-severity bugs never reach GitHub', async () => {
    const ctx = await buggyRun('B10');
    const github = new FakeGitHub();
    const gh = { port: github, ledger: new MemLedger(), policy: DEFAULT_POLICY };
    const run = async (extra: Partial<InvestigateParams>) =>
      (await investigateRun(params(ctx, { github: gh, ...extra })))[0];

    expect((await run({ reproduce: () => Promise.resolve(fakeRepro('flaky', 1)) }))?.status).toBe(
      'needs_look',
    );
    expect(
      (await run({ reproduce: () => Promise.resolve(fakeRepro('not_reproduced', 0)) }))?.status,
    ).toBe('discarded');
    expect(
      (
        await run({
          reproduce: () => Promise.resolve(fakeRepro('confirmed', 3)),
          minSeverity: 'critical',
        })
      )?.status,
    ).toBe('below_threshold');
    const unproven = await run({
      reproduce: () => Promise.resolve(fakeRepro('confirmed', 3)),
      writeTest: () =>
        Promise.resolve({
          specPath: join(ctx.resultsDir, 'x.spec.ts'),
          code: '',
          proven: false,
          judgement: { valid: false, reason: 'the test passed, so it does not prove the bug' },
          run: { status: 'passed', message: '' },
        }),
    });
    expect(unproven?.status).toBe('test_not_proven');
    expect(github.issues).toHaveLength(0);
  }, 240_000);

  it('caps how many bugs one run investigates', async () => {
    const ctx = await buggyRun('B10');
    const [rec] = await investigateRun(params(ctx, { maxBugs: 0 }));
    expect(rec?.status).toBe('not_investigated');
  }, 240_000);

  it('syncs the issue state and the fix pull request back into the bug record', async () => {
    const ctx = await buggyRun('B10');
    const github = new FakeGitHub();
    await investigateRun(
      params(ctx, { github: { port: github, ledger: new MemLedger(), policy: DEFAULT_POLICY } }),
    );
    const issue = github.issues[0];
    if (issue) issue.state = 'closed';
    github.pulls.set(1, [
      { number: 5, url: 'https://x/pull/5', state: 'closed' },
      { number: 6, url: 'https://x/pull/6', state: 'merged' },
    ]);
    const r = await syncBugs(ctx.resultsDir, github, []);
    expect(r).toEqual({ checked: 1, updated: 1 });
    const [rec] = await listBugRecords(ctx.resultsDir);
    expect(rec?.issue?.state).toBe('closed');
    expect(rec?.pull).toEqual({ number: 6, url: 'https://x/pull/6', state: 'merged' });
    expect((await syncBugs(ctx.resultsDir, github, [])).updated).toBe(0);
    expect(
      readFileSync(
        join(ctx.resultsDir, ctx.out.result.runId, 'bugs', rec?.id ?? '', 'bug.json'),
        'utf8',
      ),
    ).not.toContain('secret');
  }, 240_000);
});
