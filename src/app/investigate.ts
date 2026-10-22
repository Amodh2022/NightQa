import { join, relative } from 'node:path';
import type { BugRecord, BugStatus } from '../core/bugs/record.js';
import type { DriverArtifacts, Log } from '../core/ports.js';
import type { RunResult } from '../core/agent/loop.js';
import { describeAction } from '../core/agent/loop.js';
import type { Flow } from '../core/flow/schema.js';
import { GitHubError } from '../core/errors.js';
import type { IssueEvidence } from '../core/github/issue.js';
import { reportBug, type FixLedger, type ReportPolicy } from '../core/github/report.js';
import type { GitHubPort } from '../core/github/types.js';
import type { RunProfile } from '../core/profiles.js';
import type { Account } from '../core/redact.js';
import { buildCandidates } from '../core/repro/candidate.js';
import { atLeast } from '../core/repro/severity.js';
import type { BugCandidate, Reproduction, Severity } from '../core/repro/types.js';
import type { UrlPolicyOptions } from '../core/url-policy.js';
import { bugDir, saveBugRecord } from '../io/bug-store.js';
import { executeReproduction, type ExecuteReproParams } from './execute-repro.js';
import {
  writeFailingTest,
  type FailingTest,
  type WriteFailingTestParams,
} from './write-failing-test.js';

export interface GitHubTarget {
  readonly port: GitHubPort;
  readonly ledger: FixLedger;
  readonly policy: ReportPolicy;
}

export interface InvestigateParams {
  readonly url: string;
  readonly result: RunResult;
  readonly flow: Flow;
  readonly artifacts: DriverArtifacts;
  readonly resultsDir: string;
  /** Where the team keeps NightQA tests, as written in the issue (relative to the repo), e.g. tests/nightqa. */
  readonly testsDir: string;
  readonly minSeverity: Severity;
  /** More bugs than this in one run are recorded but not investigated (each costs several browser launches). */
  readonly maxBugs: number;
  readonly github?: GitHubTarget;
  /** Public address of the dashboard, used to link evidence in issues. */
  readonly evidenceBaseUrl?: string;
  readonly policy?: UrlPolicyOptions;
  readonly account?: Account;
  readonly secrets: readonly string[];
  readonly headless?: boolean;
  readonly executablePath?: string;
  readonly minRequestIntervalMs?: number;
  readonly blockedPaths?: readonly string[];
  readonly profile?: RunProfile;
  readonly log: Log;
  readonly now?: () => Date;
  /** Replaceable in tests. */
  readonly reproduce?: (p: ExecuteReproParams) => Promise<Reproduction>;
  readonly writeTest?: (p: WriteFailingTestParams) => Promise<FailingTest>;
}

const shortErr = (e: unknown): string =>
  e instanceof Error ? (e.message.split('\n')[0] ?? 'error') : String(e);

/**
 * Takes the findings of a buggy run through the proof gates, in order:
 * 1) reproduce 3x in fresh browsers (flaky and non-reproducing bugs stop here),
 * 2) severity at or above the team's level,
 * 3) a failing test that was RUN and failed at the bug check,
 * 4) only then a GitHub issue (duplicates become a comment) and, for High/Critical, a fix request.
 * Every bug gets a bug.json so the dashboard can show where it stopped and why.
 */
export async function investigateRun(p: InvestigateParams): Promise<BugRecord[]> {
  const now = p.now ?? (() => new Date());
  const candidates = buildCandidates(p.result, p.flow, p.profile);
  const records: BugRecord[] = [];
  const runDir = join(p.resultsDir, p.result.runId);

  for (const [index, c] of candidates.entries()) {
    const base = baseRecord(c, now().toISOString());
    const save = async (patch: Partial<BugRecord>): Promise<BugRecord> => {
      const rec = { ...base, ...patch, updatedAt: now().toISOString() } as BugRecord;
      await saveBugRecord(p.resultsDir, rec, p.secrets);
      records.push(rec);
      return rec;
    };
    if (index >= p.maxBugs) {
      await save({
        status: 'not_investigated',
        statusNote: `more than ${String(p.maxBugs)} bugs in one run`,
      });
      continue;
    }
    const dir = bugDir(p.resultsDir, c.runId, c.id);

    // 1) Reproduce.
    let repro: Reproduction;
    try {
      repro = await (p.reproduce ?? executeReproduction)({
        url: p.url,
        candidate: c,
        evidenceDir: join(dir, 'replays'),
        log: p.log,
        secrets: p.secrets,
        ...(p.blockedPaths ? { blockedPaths: p.blockedPaths } : {}),
        ...(p.policy ? { policy: p.policy } : {}),
        ...(p.account ? { account: p.account } : {}),
        ...(p.headless !== undefined ? { headless: p.headless } : {}),
        ...(p.executablePath ? { executablePath: p.executablePath } : {}),
        ...(p.minRequestIntervalMs !== undefined
          ? { minRequestIntervalMs: p.minRequestIntervalMs }
          : {}),
      });
    } catch (e) {
      await save({ status: 'discarded', statusNote: `could not replay: ${shortErr(e)}` });
      continue;
    }
    const filled = {
      title: repro.title,
      severity: repro.severity,
      reproduced: repro.reproducedCount,
      attempts: repro.attemptCount,
      recipe: repro.recipe.map((a) => describeAction(a.action)),
      expected: repro.expectedText,
      actual: repro.actualText,
      evidence: evidenceFor(runDir, p.artifacts, repro),
    };
    if (repro.status === 'not_reproduced') {
      await save({
        ...filled,
        status: 'discarded',
        statusNote: `did not reproduce (0/${String(repro.attemptCount)} replays)`,
      });
      continue;
    }
    if (repro.status === 'flaky') {
      await save({
        ...filled,
        status: 'needs_look',
        statusNote: `flaky: reproduced ${String(repro.reproducedCount)}/${String(repro.attemptCount)} replays, so it is not filed`,
      });
      continue;
    }

    // 2) Severity.
    if (!atLeast(repro.severity, p.minSeverity)) {
      await save({
        ...filled,
        status: 'below_threshold',
        statusNote: `${repro.severity} is below the reporting level (${p.minSeverity})`,
      });
      continue;
    }

    // 3) Failing test.
    let test: FailingTest;
    try {
      test = await (p.writeTest ?? writeFailingTest)({
        url: p.url,
        candidate: c,
        reproduction: repro,
        dir,
        ...(p.policy ? { policy: p.policy } : {}),
        ...(p.executablePath ? { executablePath: p.executablePath } : {}),
      });
    } catch (e) {
      await save({
        ...filled,
        status: 'test_not_proven',
        statusNote: `the failing test could not be run: ${shortErr(e)}`,
      });
      continue;
    }
    const repoPath = `${p.testsDir.replace(/\/+$/, '')}/bugs/${c.id}.spec.ts`;
    const testInfo = { file: relative(runDir, test.specPath), repoPath, proven: test.proven };
    if (!test.proven) {
      await save({
        ...filled,
        test: testInfo,
        status: 'test_not_proven',
        statusNote: test.judgement.valid ? '' : test.judgement.reason,
      });
      continue;
    }

    // 4) Report.
    if (!p.github) {
      await save({
        ...filled,
        test: testInfo,
        status: 'ready',
        statusNote: 'proven; no GitHub repository is configured',
      });
      continue;
    }
    try {
      const out = await reportBug(
        { github: p.github.port, ledger: p.github.ledger, now },
        {
          candidate: c,
          reproduction: repro,
          testCode: test.code,
          testPath: repoPath,
          stagingUrl: p.url,
          evidence: evidenceLinks(filled.evidence, p.result.runId, p.evidenceBaseUrl, p.resultsDir),
        },
        p.github.policy,
      );
      await save({
        ...filled,
        test: testInfo,
        status: 'reported',
        statusNote: out.kind === 'created' ? 'issue opened' : 'seen again on an open issue',
        issue: {
          number: out.issue.number,
          url: out.issue.url,
          state: out.issue.state,
          action: out.kind,
        },
        fix: {
          status: out.fix.kind,
          ...(out.fix.kind === 'skipped' ? { note: out.fix.reason } : {}),
        },
      });
    } catch (e) {
      const why = e instanceof GitHubError ? e.message : shortErr(e);
      p.log.error({ event: 'github_failed', bug: c.id, error: why });
      await save({
        ...filled,
        test: testInfo,
        status: 'ready',
        statusNote: `proven, but filing on GitHub failed: ${why}`,
      });
    }
  }
  p.log.info({
    event: 'investigation_finished',
    runId: p.result.runId,
    bugs: records.length,
    byStatus: countBy(records.map((r) => r.status)),
    aiCalls: 0,
  });
  return records;
}

function countBy(xs: readonly BugStatus[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of xs) out[x] = (out[x] ?? 0) + 1;
  return out;
}

function baseRecord(c: BugCandidate, at: string): BugRecord {
  return {
    version: 1,
    id: c.id,
    runId: c.runId,
    flow: c.flow,
    title: c.finding.message.slice(0, 120),
    severity: 'medium',
    status: 'discarded',
    statusNote: '',
    reproduced: 0,
    attempts: 0,
    recipe: [],
    expected: c.expected ?? '',
    actual: c.finding.message,
    evidence: [],
    createdAt: at,
    updatedAt: at,
  };
}

/** Evidence files, as paths relative to the run folder: the bug-state screenshot, plus the original video and trace. */
function evidenceFor(runDir: string, artifacts: DriverArtifacts, r: Reproduction): string[] {
  const shots = r.attempts
    .flatMap((a) => (a.reproduced && a.screenshot ? [a.screenshot] : []))
    .slice(-1);
  const originals = [artifacts.videoPath, artifacts.tracePath].filter((x): x is string => !!x);
  return [...shots, ...originals].map((f) => relative(runDir, f));
}

function evidenceLinks(
  files: readonly string[],
  runId: string,
  base: string | undefined,
  resultsDir: string,
): IssueEvidence {
  return {
    items: files.map((f) =>
      base
        ? `[${f}](${base.replace(/\/+$/, '')}/api/runs/${runId}/files/${f.split('/').map(encodeURIComponent).join('/')})`
        : `\`${join(resultsDir, runId, f)}\` (on the machine that ran NightQA)`,
    ),
  };
}

/** A quiet logger for callers that have none. */
export const nullLog: Log = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
