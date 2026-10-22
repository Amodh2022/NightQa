import type { RecordedAction, RecordedFailure } from '../agent/loop.js';
import type { RunProfile } from '../profiles.js';
import type { Finding } from '../verdict.js';

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type ReproStatus = 'confirmed' | 'flaky' | 'not_reproduced';

/** A suspected bug from one run, with everything needed to replay it without AI. */
export interface BugCandidate {
  /** Stable across nights: the same bug on the same page keeps the same id (used for duplicate checks). */
  readonly id: string;
  readonly finding: Finding;
  readonly runId: string;
  readonly flow: string;
  readonly start: string;
  readonly login?: string;
  readonly tags: readonly string[];
  /** Network and screen the bug was found under; replays use the same. */
  readonly profile?: RunProfile;
  /** Plain-words flow steps, for the report. */
  readonly steps: readonly string[];
  /** What the flow expected at the failing step, when it had an expectation. */
  readonly expected?: string;
  readonly actions: readonly RecordedAction[];
  /** Replayable proof for an `expectation-failed` finding. */
  readonly proof?: RecordedFailure;
}

export interface AttemptOutcome {
  readonly reproduced: boolean;
  readonly note: string;
  /** Screenshot of the bug state, when the attempt saved one. */
  readonly screenshot?: string;
}

export interface Reproduction {
  readonly id: string;
  readonly status: ReproStatus;
  /** How many of the verification replays hit the same bug. */
  readonly reproducedCount: number;
  readonly attemptCount: number;
  readonly attempts: readonly AttemptOutcome[];
  /** The shortest recipe that still reproduces the bug (all verified replays used this recipe). */
  readonly recipe: readonly RecordedAction[];
  readonly originalActionCount: number;
  readonly severity: Severity;
  readonly title: string;
  readonly expectedText: string;
  readonly actualText: string;
}
