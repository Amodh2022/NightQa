import { bugMarker } from './bug-spec.js';

export interface SpecRunResult {
  readonly status: 'passed' | 'failed' | 'error';
  /** The test's failure message, or what went wrong running it. */
  readonly message: string;
}

export type TestJudgement =
  { readonly valid: true } | { readonly valid: false; readonly reason: string };

/**
 * A failing test counts as proof only when it ran, failed, and failed at the bug check (its message carries the
 * bug marker). A test that passes is thrown away, and so is one that fails for another reason such as a missing
 * button: that would be a broken test, not proof of the bug.
 */
export function judgeFailingTest(run: SpecRunResult, bugId: string): TestJudgement {
  if (run.status === 'passed')
    return { valid: false, reason: 'the test passed, so it does not prove the bug' };
  if (run.status === 'error')
    return { valid: false, reason: `the test could not be run: ${run.message}` };
  if (!run.message.includes(bugMarker(bugId))) {
    return {
      valid: false,
      reason: `the test failed for a different reason than the bug: ${run.message.split('\n')[0] ?? ''}`,
    };
  }
  return { valid: true };
}
