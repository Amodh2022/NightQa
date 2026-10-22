export type Verdict = 'pass' | 'bug' | 'app_changed' | 'needs_setup' | 'agent_stuck';

export type FindingKind =
  | 'expectation-failed'
  | 'js-error'
  | 'http-5xx'
  | 'blank-page'
  | 'spinner'
  | 'dead-link'
  | 'console-error';

/** Something that counts as a bug. Always carries the step and page where it was seen. */
export interface Finding {
  readonly kind: FindingKind;
  readonly message: string;
  readonly stepIndex: number;
  readonly url: string;
}

export interface VerdictInputs {
  /** The run could not start or staging is unhealthy: not a bug. */
  readonly setupProblem?: string;
  readonly findings: readonly Finding[];
  /** The agent gave up, hit a budget, or could not judge a result. */
  readonly stuckReason?: string;
  readonly allStepsPassed: boolean;
}

export interface VerdictResult {
  readonly verdict: Verdict;
  readonly reason: string;
}

/**
 * Fail closed: pass only when every step passed and nothing suspicious was seen.
 * Precedence: needs_setup, then bug (real evidence beats a confused agent), then agent_stuck, then pass.
 */
export function decideVerdict(i: VerdictInputs): VerdictResult {
  if (i.setupProblem) return { verdict: 'needs_setup', reason: i.setupProblem };
  const first = i.findings[0];
  if (first) {
    const more = i.findings.length > 1 ? ` (+${String(i.findings.length - 1)} more)` : '';
    return { verdict: 'bug', reason: `${first.kind}: ${first.message}${more}` };
  }
  if (i.stuckReason) return { verdict: 'agent_stuck', reason: i.stuckReason };
  if (!i.allStepsPassed)
    return { verdict: 'agent_stuck', reason: 'the flow ended before every step passed' };
  return { verdict: 'pass', reason: 'every expectation was met' };
}
