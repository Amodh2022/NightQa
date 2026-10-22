import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BugCandidate, Reproduction } from '../core/repro/types.js';
import { checkTestUrl, type UrlPolicyOptions } from '../core/url-policy.js';
import { generateBugSpec } from '../core/testwriter/bug-spec.js';
import {
  judgeFailingTest,
  type SpecRunResult,
  type TestJudgement,
} from '../core/testwriter/judge.js';
import { runSpec, type RunSpecOptions } from '../io/run-spec.js';

export interface WriteFailingTestParams {
  readonly url: string;
  readonly candidate: BugCandidate;
  readonly reproduction: Reproduction;
  /** Folder the spec is written to (one file per bug id). */
  readonly dir: string;
  readonly policy?: UrlPolicyOptions;
  readonly executablePath?: string;
  /** Replaceable in tests. */
  readonly run?: (specPath: string, opts: RunSpecOptions) => Promise<SpecRunResult>;
}

export interface FailingTest {
  readonly specPath: string;
  readonly code: string;
  /** True only when the test ran, failed, and failed at the bug check. */
  readonly proven: boolean;
  readonly judgement: TestJudgement;
  readonly run: SpecRunResult;
}

/**
 * Writes the failing test for a confirmed bug and RUNS it against staging. Only a test that fails for the
 * bug's reason is proof; anything else is reported back as not proven so the bug is never filed.
 * @throws UrlPolicyError when the URL breaks the staging-only or SSRF rules (nothing is run)
 */
export async function writeFailingTest(p: WriteFailingTestParams): Promise<FailingTest> {
  const base = checkTestUrl(p.url, p.policy);
  const code = generateBugSpec(p.candidate, p.reproduction);
  await mkdir(p.dir, { recursive: true });
  const specPath = join(p.dir, `${p.candidate.id}.spec.ts`);
  await writeFile(specPath, code);
  const run = await (p.run ?? runSpec)(specPath, {
    baseUrl: base.origin,
    ...(p.executablePath ? { executablePath: p.executablePath } : {}),
  });
  const judgement = judgeFailingTest(run, p.candidate.id);
  return { specPath, code, proven: judgement.valid, judgement, run };
}
