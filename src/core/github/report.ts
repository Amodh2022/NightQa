import { atLeast } from '../repro/severity.js';
import type { Severity } from '../repro/types.js';
import {
  LABEL_ALL,
  SEVERITY_LABELS,
  bugMarker,
  fixMarker,
  fixRequestComment,
  hasMarker,
  renderIssue,
  seenAgainComment,
  seenMarker,
  type IssueInput,
} from './issue.js';
import type { GitHubIssue, GitHubPort, LabelSpec } from './types.js';

export type FixMode = 'auto' | 'manual' | 'off';

export interface ReportPolicy {
  readonly fixMode: FixMode;
  /** At most this many fix requests per night (default 3). */
  readonly maxFixPerNight: number;
  /** Only High and Critical bugs get an automatic fix request. */
  readonly fixMinSeverity: Severity;
}

export const DEFAULT_POLICY: ReportPolicy = {
  fixMode: 'auto',
  maxFixPerNight: 3,
  fixMinSeverity: 'high',
};

/** Counts fix requests per night so the limit holds across runs. */
export interface FixLedger {
  count(date: string): Promise<number>;
  record(date: string, bugId: string): Promise<void>;
}

export interface ReportDeps {
  readonly github: GitHubPort;
  readonly ledger: FixLedger;
  readonly now: () => Date;
}

export type FixStatus =
  | { readonly kind: 'requested' }
  | { readonly kind: 'already_requested' }
  | { readonly kind: 'skipped'; readonly reason: string };

export interface ReportOutcome {
  readonly kind: 'created' | 'seen_again';
  readonly issue: GitHubIssue;
  readonly fix: FixStatus;
}

const LABELS: readonly LabelSpec[] = [
  { name: LABEL_ALL, color: '5b3df5', description: 'Found by NightQA' },
  {
    name: 'severity: critical',
    color: 'b60205',
    description: 'Login or payment cannot be completed',
  },
  { name: 'severity: high', color: 'd93f0b', description: 'A feature is broken' },
  { name: 'severity: medium', color: 'fbca04', description: 'An error shows, with a workaround' },
  { name: 'severity: low', color: '0e8a16', description: 'Minor, no visible effect' },
];

/**
 * Files a proven bug on GitHub: one issue per bug. A repeat of an open issue only adds a "seen again" comment,
 * and every step is safe to run twice (markers on the first line of issues and comments make it idempotent).
 */
export async function reportBug(
  deps: ReportDeps,
  input: IssueInput,
  policy: ReportPolicy = DEFAULT_POLICY,
): Promise<ReportOutcome> {
  const { github } = deps;
  const { candidate: c, reproduction: r } = input;
  await github.ensureLabels(LABELS);

  const known = (await github.listIssues([LABEL_ALL], 'all')).filter((i) =>
    hasMarker(i.body, bugMarker(c.id)),
  );
  const open = known.find((i) => i.state === 'open');

  if (open) {
    const comments = await github.listComments(open.number);
    if (!comments.some((k) => hasMarker(k.body, seenMarker(c.runId)))) {
      await github.addComment(open.number, seenAgainComment(c.runId, r));
    }
    const fix = await maybeRequestFix(deps, policy, input, open, comments);
    return { kind: 'seen_again', issue: open, fix };
  }

  const previous = known.find((i) => i.state === 'closed');
  const { title, body } = renderIssue({
    ...input,
    ...(previous ? { previousIssue: previous.number } : {}),
  });
  const labels = [LABEL_ALL, SEVERITY_LABELS[r.severity] ?? 'severity: medium'];
  const issue = await github.createIssue({ title, body, labels });
  const fix = await maybeRequestFix(deps, policy, input, issue, []);
  return { kind: 'created', issue, fix };
}

async function maybeRequestFix(
  deps: ReportDeps,
  policy: ReportPolicy,
  input: IssueInput,
  issue: GitHubIssue,
  comments: readonly { body: string }[],
): Promise<FixStatus> {
  const { candidate: c, reproduction: r } = input;
  if (policy.fixMode === 'off') return { kind: 'skipped', reason: 'fix requests are off' };
  if (policy.fixMode === 'manual')
    return { kind: 'skipped', reason: 'manual mode: comment on the issue to ask for a fix' };
  if (!atLeast(r.severity, policy.fixMinSeverity))
    return { kind: 'skipped', reason: `severity ${r.severity} is below ${policy.fixMinSeverity}` };
  if (comments.some((k) => hasMarker(k.body, fixMarker(c.id))))
    return { kind: 'already_requested' };
  const date = deps.now().toISOString().slice(0, 10);
  if ((await deps.ledger.count(date)) >= policy.maxFixPerNight)
    return {
      kind: 'skipped',
      reason: `the limit of ${String(policy.maxFixPerNight)} fix requests tonight is used`,
    };
  // Count first: if the comment then fails, the budget stays spent rather than being exceeded.
  await deps.ledger.record(date, c.id);
  await deps.github.addComment(
    issue.number,
    fixRequestComment({ id: c.id, testPath: input.testPath }),
  );
  return { kind: 'requested' };
}
