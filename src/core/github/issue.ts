import { describeAction } from '../agent/loop.js';
import type { BugCandidate, Reproduction } from '../repro/types.js';
import { fence, inlineText } from './neutralize.js';

export const LABEL_ALL = 'nightqa';
export const SEVERITY_LABELS: Record<string, string> = {
  critical: 'severity: critical',
  high: 'severity: high',
  medium: 'severity: medium',
  low: 'severity: low',
};

export const bugMarker = (id: string): string => `<!-- nightqa:bug:${id} -->`;
export const seenMarker = (runId: string): string => `<!-- nightqa:seen:${runId} -->`;
export const fixMarker = (id: string): string => `<!-- nightqa:fix-requested:${id} -->`;

/** True when the FIRST line of `body` is exactly this marker, so text quoted from a page can never forge one. */
export function hasMarker(body: string, marker: string): boolean {
  return (body.split('\n', 1)[0] ?? '').trim() === marker;
}

export interface IssueEvidence {
  /** Links or file paths, one per item, already safe to print. */
  readonly items: readonly string[];
}

export interface IssueInput {
  readonly candidate: BugCandidate;
  readonly reproduction: Reproduction;
  readonly testCode: string;
  readonly testPath: string;
  readonly stagingUrl: string;
  readonly evidence: IssueEvidence;
  /** Number of an earlier closed issue for the same bug, when this is a regression. */
  readonly previousIssue?: number;
}

/** Title and markdown body for a new issue. Every piece of page-derived text is neutralized. */
export function renderIssue(i: IssueInput): { title: string; body: string } {
  const { candidate: c, reproduction: r } = i;
  const steps = r.recipe.length
    ? r.recipe.map((a, n) => `${String(n + 1)}. ${inlineText(describeAction(a.action))}`).join('\n')
    : '1. Open the start page (no other action is needed).';
  const lines = [
    bugMarker(c.id),
    `**Severity:** ${r.severity}  ·  **Reproduced:** ${String(r.reproducedCount)}/${String(r.attemptCount)} replays  ·  **Flow:** ${inlineText(c.flow)}`,
    ...(i.previousIssue
      ? [``, `This looks like a regression of #${String(i.previousIssue)}.`]
      : []),
    ``,
    `## Steps to reproduce`,
    `Start at \`${inlineText(c.start)}\` on staging.`,
    ``,
    steps,
    ``,
    `## Expected vs actual`,
    `| Expected | Actual |`,
    `| --- | --- |`,
    `| ${inlineText(r.expectedText)} | ${inlineText(r.actualText)} |`,
    ``,
    `## Evidence`,
    ...(i.evidence.items.length ? i.evidence.items.map((e) => `- ${e}`) : ['- (none saved)']),
    ``,
    `## Failing test`,
    `Saved as \`${inlineText(i.testPath)}\`. It fails while the bug exists and should pass once it is fixed.`,
    ``,
    fence(i.testCode, 'ts'),
    ``,
    `## Environment`,
    `- Staging: ${inlineText(i.stagingUrl)}`,
    `- Browser: Chromium (Playwright)`,
    ``,
    `## Source`,
    `Found by NightQA run \`${inlineText(c.runId)}\`, flow "${inlineText(c.flow)}".`,
  ];
  return { title: `${r.title} · ${r.severity}`.slice(0, 250), body: lines.join('\n') };
}

/** The comment that asks the team's coding agent for a fix. Contains no page text, only our own words. */
export function fixRequestComment(i: { id: string; testPath: string }): string {
  return [
    fixMarker(i.id),
    `@claude please fix this bug.`,
    ``,
    `- Make the failing test \`${inlineText(i.testPath)}\` pass without weakening it.`,
    `- Include that test in the pull request, together with the code change.`,
    `- Make sure CI runs the test.`,
    `- Do not merge: a developer will review.`,
  ].join('\n');
}

export function seenAgainComment(runId: string, r: Reproduction): string {
  return [
    seenMarker(runId),
    `Seen again by NightQA run \`${inlineText(runId)}\` (${String(r.reproducedCount)}/${String(r.attemptCount)} replays).`,
  ].join('\n');
}
