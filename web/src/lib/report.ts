import type { BugRecord, Severity } from './bugs';
import { latestPerBug } from './bugs';
import { plural } from './format';
import type { RunView, RunResult } from './results';

/**
 * The morning report, built only from real runs and bug records. Pure: no clock and no files, so the same builder
 * serves the email, Slack, webhook, the dashboard preview and the mobile screens.
 */

export type Tone = 'crit' | 'high' | 'med' | 'low' | 'setup' | 'look';

export interface ReportItem {
  readonly tag: string;
  readonly tone: Tone;
  /** Untrusted text (a bug title, a flow name). Always escape it for the channel it goes to. */
  readonly title: string;
  readonly refs: string;
  /** Only ever an https://github.com/ link. */
  readonly url?: string;
  readonly bugId?: string;
  readonly runId?: string;
}

export type ReportKind = 'report' | 'all_clear' | 'no_runs' | 'critical' | 'test';

export interface ReportCounts {
  readonly flowsPassed: number;
  readonly flowsTotal: number;
  readonly newBugs: number;
  readonly fixPrsReady: number;
  readonly prsMerged: number;
  readonly needsSetup: number;
  readonly needsLook: number;
}

export interface Report {
  readonly kind: ReportKind;
  readonly subject: string;
  /** Short plain lines under the subject. */
  readonly summary: readonly string[];
  readonly items: readonly ReportItem[];
  /** Extra one-liners, for example "PR #138 was merged." */
  readonly notes: readonly string[];
  readonly counts: ReportCounts;
  /** "22 Oct" in the report timezone. */
  readonly dateLabel: string;
  /** The two-line headline used on the mobile morning report. */
  readonly headline: readonly [string, string];
  /** False when the report should not be delivered (no runs, or a quiet night with "send nothing"). */
  readonly send: boolean;
}

export interface BuildReportInput {
  readonly runs: readonly RunView[];
  readonly bugs: readonly BugRecord[];
  readonly appName: string;
  /** The end of the window: usually the current time. */
  readonly now: Date;
  /** The start of the window: runs and bugs before this are not "last night". */
  readonly since: Date;
  readonly timeZone: string;
  readonly quietNight: 'all_clear' | 'nothing';
}

const MAX_ITEMS = 8;
const SEV_TAG: Record<Severity, { tag: string; tone: Tone }> = {
  critical: { tag: 'CRIT', tone: 'crit' },
  high: { tag: 'HIGH', tone: 'high' },
  medium: { tag: 'MED', tone: 'med' },
  low: { tag: 'LOW', tone: 'low' },
};
const SEV_RANK: Record<Severity, number> = { critical: 3, high: 2, medium: 1, low: 0 };

/** One line, no control characters, capped. Page text and AI text pass through here before they are shown. */
export function clean(s: string, max = 140): string {
  const one = s.replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

export function dateLabel(d: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'short' }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(d);
  }
}

const githubUrl = (u: string | undefined): string | undefined => (u && /^https:\/\/github\.com\//.test(u) ? u : undefined);

function bugRefs(b: BugRecord): string {
  const parts: string[] = [];
  if (b.issue) parts.push(`Issue #${String(b.issue.number)}`);
  if (b.pull) parts.push(`PR #${String(b.pull.number)}`);
  return parts.length > 0 ? parts.join(' · ') : `Reproduced ${String(b.reproduced)} of ${String(b.attempts)}`;
}

function bugItem(b: BugRecord): ReportItem {
  const sev = SEV_TAG[b.severity];
  const url = githubUrl(b.pull?.url ?? b.issue?.url);
  return { tag: sev.tag, tone: sev.tone, title: clean(b.title), refs: bugRefs(b), ...(url ? { url } : {}), bugId: b.id, runId: b.runId };
}

const isProven = (b: BugRecord): boolean => b.status === 'reported' || b.status === 'ready';

/** Bug ids whose first record falls inside the window, with their newest record. */
function newBugs(bugs: readonly BugRecord[], since: Date, now: Date): BugRecord[] {
  const first = new Map<string, string>();
  for (const b of bugs) {
    const cur = first.get(b.id);
    if (!cur || b.createdAt < cur) first.set(b.id, b.createdAt);
  }
  const lo = since.toISOString();
  const hi = now.toISOString();
  return latestPerBug(bugs)
    .filter((b) => isProven(b) && (first.get(b.id) ?? b.createdAt) >= lo && (first.get(b.id) ?? b.createdAt) <= hi)
    .sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || a.title.localeCompare(b.title));
}

type Finished = RunView & { readonly result: RunResult };

export function buildReport(input: BuildReportInput): Report {
  const { runs, bugs, appName, now, since, timeZone, quietNight } = input;
  const app = clean(appName, 60) || 'Your app';
  const label = dateLabel(now, timeZone);

  // the latest finished run of each flow inside the window
  const inWindow = runs
    .filter((r): r is Finished => r.status === 'finished' && r.result !== undefined && r.startedAt >= since && r.startedAt <= now)
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const byFlow = new Map<string, Finished>();
  for (const r of inWindow) byFlow.set(r.flow, r);
  const latest = [...byFlow.values()];

  const flowsTotal = latest.length;
  const flowsPassed = latest.filter((r) => r.result.verdict === 'pass').length;
  const setupRuns = latest.filter((r) => r.result.verdict === 'needs_setup');
  const lookRuns = latest.filter((r) => r.result.verdict === 'app_changed' || r.result.verdict === 'agent_stuck');

  const fresh = newBugs(bugs, since, now);
  const latestBugs = latestPerBug(bugs);
  const openPrs = latestBugs.filter((b) => b.pull?.state === 'open').sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity]);
  const merged = latestBugs.filter((b) => b.pull?.state === 'merged' && b.updatedAt >= since.toISOString());

  const counts: ReportCounts = {
    flowsPassed,
    flowsTotal,
    newBugs: fresh.length,
    fixPrsReady: openPrs.length,
    prsMerged: merged.length,
    needsSetup: setupRuns.length,
    needsLook: lookRuns.length,
  };

  const items: ReportItem[] = [
    ...fresh.map(bugItem),
    ...setupRuns.map((r): ReportItem => ({ tag: 'SETUP', tone: 'setup', title: clean(`${r.flow}: ${r.result.reason}`, 120), refs: 'Not counted as a bug', runId: r.id })),
    ...lookRuns.map((r): ReportItem => ({ tag: 'LOOK', tone: 'look', title: clean(`${r.flow}: ${r.result.reason}`, 120), refs: 'Not counted as a bug', runId: r.id })),
    ...openPrs.filter((b) => !fresh.some((f) => f.id === b.id)).map((b): ReportItem => {
      const i = bugItem(b);
      return { ...i, refs: `Fix PR ready to review · ${i.refs}` };
    }),
  ];
  const shown = items.slice(0, MAX_ITEMS);

  const notes: string[] = [];
  const mergedNums = merged.flatMap((b) => (b.pull ? [`#${String(b.pull.number)}`] : []));
  if (mergedNums.length === 1) notes.push(`PR ${mergedNums[0] ?? ''} was merged.`);
  else if (mergedNums.length > 1) notes.push(`${plural(mergedNums.length, 'fix PR')} were merged: ${mergedNums.slice(0, 5).join(', ')}.`);
  if (items.length > shown.length) notes.push(`And ${String(items.length - shown.length)} more in the dashboard.`);

  const base = { counts, dateLabel: label, notes, items: shown };

  if (flowsTotal === 0) {
    return { ...base, kind: 'no_runs', subject: `${app} · No runs in the last night`, summary: ['No flows ran in the last night.'], headline: ['No runs yet.', 'Run your first flow.'], send: false };
  }

  const quiet = counts.newBugs === 0 && counts.fixPrsReady === 0 && counts.needsSetup === 0 && counts.needsLook === 0 && counts.prsMerged === 0 && flowsPassed === flowsTotal;
  if (quiet) {
    return {
      ...base,
      kind: 'all_clear',
      subject: `${app} · All clear`,
      summary: [`All clear. ${String(flowsPassed)} of ${plural(flowsTotal, 'flow')} passed.`],
      headline: ['All clear.', 'Nothing needs you.'],
      send: quietNight === 'all_clear',
    };
  }

  const parts: string[] = [];
  if (counts.newBugs > 0) parts.push(`${plural(counts.newBugs, 'new bug')} confirmed`);
  if (counts.fixPrsReady > 0) parts.push(`${plural(counts.fixPrsReady, 'fix PR')} ready`);
  if (counts.needsSetup > 0) parts.push(`${plural(counts.needsSetup, 'flow')} need${counts.needsSetup === 1 ? 's' : ''} setup`);
  if (counts.needsLook > 0) parts.push(`${plural(counts.needsLook, 'flow')} need${counts.needsLook === 1 ? 's' : ''} a look`);
  if (parts.length === 0) parts.push(`${String(flowsPassed)} of ${String(flowsTotal)} flows passed`);

  const needs = counts.needsSetup + counts.needsLook;
  const line1 = counts.newBugs > 0 ? `${plural(counts.newBugs, 'bug')} proven.` : 'No new bugs.';
  const line2 = counts.fixPrsReady > 0 ? `${String(counts.fixPrsReady)} ${counts.fixPrsReady === 1 ? 'fix' : 'fixes'} waiting.` : needs > 0 ? `${plural(needs, 'flow')} need${needs === 1 ? 's' : ''} a look.` : 'Nothing needs you.';

  return {
    ...base,
    kind: 'report',
    subject: `${app} · ${parts.join(', ')}`,
    summary: [`${String(flowsPassed)} of ${String(flowsTotal)} flows passed · ${label}`],
    headline: [line1, line2],
    send: true,
  };
}

const ZERO: ReportCounts = { flowsPassed: 0, flowsTotal: 0, newBugs: 0, fixPrsReady: 0, prsMerged: 0, needsSetup: 0, needsLook: 0 };

/** The immediate alert for one proven critical bug. */
export function criticalAlert(b: BugRecord, appName: string, now: Date, timeZone: string): Report {
  const app = clean(appName, 60) || 'Your app';
  const item = bugItem(b);
  return {
    kind: 'critical',
    subject: `${app} · CRITICAL: ${item.title}`,
    summary: [`Reproduced ${String(b.reproduced)} of ${String(b.attempts)} · ${b.test?.proven ? 'failing test attached' : 'failing test not attached yet'}`, `Flow: ${clean(b.flow, 80)}`],
    items: [item],
    notes: ['Sent right after the bug was confirmed, not held for the morning report.'],
    counts: { ...ZERO, newBugs: 1 },
    dateLabel: dateLabel(now, timeZone),
    headline: ['Critical bug.', 'Review it now.'],
    send: true,
  };
}

/** A clearly labelled test message. Contains no real data. */
export function testReport(channel: string, appName: string, now: Date, timeZone: string): Report {
  const app = clean(appName, 60) || 'Your app';
  return {
    kind: 'test',
    subject: `[TEST] NightQA test message for ${app}`,
    summary: [`This is a test message from NightQA (${channel}). If you can read it, delivery works. No action needed.`],
    items: [],
    notes: [],
    counts: ZERO,
    dateLabel: dateLabel(now, timeZone),
    headline: ['Test message.', 'No action needed.'],
    send: true,
  };
}

/**
 * The window the dashboard preview should use: the last 24 hours, or, when nothing ran recently, the 24 hours up to
 * the most recent finished run. Returns the window and the moment the report is "as of".
 */
export function previewWindow(runs: readonly RunView[], now: Date): { since: Date; asOf: Date } {
  const newest = runs.find((r) => r.status === 'finished');
  const day = 24 * 3_600_000;
  if (!newest || now.getTime() - newest.startedAt.getTime() < day) return { since: new Date(now.getTime() - day), asOf: now };
  const asOf = new Date(newest.startedAt.getTime() + 3_600_000);
  return { since: new Date(asOf.getTime() - day), asOf };
}
