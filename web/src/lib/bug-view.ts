import { closeReasonLabel } from './bug-reasons';
import { columnOf, type BoardColumn, type BugRecord, type Severity } from './bugs';
import { COLORS } from './format';

export interface SeverityMeta {
  readonly label: string;
  readonly fg: string;
  readonly bg: string;
  /** rgb triplet for glows */
  readonly rgb: string;
}

/** Chip colors from the design: High is coral, Medium amber, Low grey; Critical is the strongest coral. */
export const SEVERITY: Record<Severity, SeverityMeta> = {
  critical: { label: 'Critical', fg: '#FF8A7B', bg: 'rgba(255,107,91,0.26)', rgb: '255,107,91' },
  high: { label: 'High', fg: '#FF8A7B', bg: 'rgba(255,107,91,0.18)', rgb: '255,107,91' },
  medium: { label: 'Medium', fg: COLORS.amber, bg: 'rgba(255,193,77,0.17)', rgb: '255,193,77' },
  low: { label: 'Low', fg: '#C7D0E0', bg: 'rgba(255,255,255,0.1)', rgb: '255,255,255' },
};

export { CLOSE_REASONS, closeReasonLabel, closeReasonSchema, type CloseReason } from './bug-reasons';

/** URL of a file inside a run folder, served by the evidence route. */
export const fileUrl = (runId: string, rel: string): string => `/api/runs/${encodeURIComponent(runId)}/files/${rel.split('/').map(encodeURIComponent).join('/')}`;

export interface EvidenceSplit {
  readonly images: string[];
  readonly videos: string[];
  readonly traces: string[];
}

/** Sorts a bug's evidence paths by what the browser can show. Paths are relative to the run folder. */
export function splitEvidence(files: readonly string[]): EvidenceSplit {
  const out: EvidenceSplit = { images: [], videos: [], traces: [] };
  for (const f of files) {
    const ext = f.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'png') out.images.push(f);
    else if (ext === 'webm') out.videos.push(f);
    else if (ext === 'zip') out.traces.push(f);
  }
  return out;
}

/** Collapses whitespace so a bug title cannot inject extra lines into a pasted comment. */
const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** A fix can be asked for when an issue is open and no fix was requested (or the engine skipped it) and no PR exists. */
export function canAskForFix(b: BugRecord): boolean {
  if (!b.issue || b.issue.state !== 'open' || b.pull) return false;
  return !b.fix || b.fix.status === 'skipped';
}

/** The exact comment to paste on the issue. NightQa's engine owns GitHub writes; the dashboard only shows the text. */
export function fixComment(b: BugRecord): string {
  const lines = [`@claude please fix the bug in this issue: ${oneLine(b.title)}`];
  if (b.test?.repoPath) lines.push(`The failing test is ${oneLine(b.test.repoPath)}. Make it pass without changing other behaviour, and open a pull request.`);
  else lines.push('Reproduce it with the steps in the issue, fix it, and open a pull request.');
  return lines.join('\n');
}

export type PrState = 'open' | 'merged' | 'closed';
export const PR_STATE_LABEL: Record<PrState, string> = { open: 'open', merged: 'merged', closed: 'closed' };

/** One line for the card: what happened to the fix. */
export function fixLine(b: BugRecord): string {
  if (b.pull) return `Fix PR #${String(b.pull.number)} ${PR_STATE_LABEL[b.pull.state]}`;
  if (b.fix?.status === 'requested' || b.fix?.status === 'already_requested') return 'Fix requested from your coding agent';
  if (b.fix?.status === 'skipped') return b.fix.note ? `No fix requested: ${b.fix.note}` : 'No fix requested';
  if (b.issue) return 'Issue open, no fix requested yet';
  return b.statusNote;
}

export const COLUMNS: readonly { readonly key: BoardColumn; readonly title: string; readonly hint: string; readonly dot: string; readonly rgb?: string }[] = [
  { key: 'proven', title: 'Proven', hint: 'Reproduced 3 of 3 with a failing test that ran and failed. Waiting for a fix.', dot: COLORS.coral, rgb: '255,107,91' },
  { key: 'fix_pr', title: 'Fix PR to review', hint: 'A pull request is open for these. A human merges it.', dot: COLORS.blue, rgb: '106,166,255' },
  { key: 'needs_look', title: 'Needs a look', hint: 'Reproduced only sometimes, or no failing test could be proven. Not sent to GitHub.', dot: COLORS.violet },
  { key: 'fixed', title: 'Fixed', hint: 'The issue is closed or the fix PR was merged.', dot: COLORS.accent },
];

export function groupByColumn(bugs: readonly BugRecord[]): Record<BoardColumn, BugRecord[]> {
  const out: Record<BoardColumn, BugRecord[]> = { proven: [], fix_pr: [], needs_look: [], fixed: [] };
  for (const b of bugs) {
    const c = columnOf(b);
    if (c) out[c].push(b);
  }
  return out;
}

export const MOBILE_FILTERS = ['all', 'proven', 'needs_look', 'fix_pr', 'fixed'] as const;
export type MobileFilter = (typeof MOBILE_FILTERS)[number];
export const MOBILE_FILTER_LABEL: Record<MobileFilter, string> = { all: 'All', proven: 'Confirmed', needs_look: 'Needs a look', fix_pr: 'Fix PR', fixed: 'Merged' };

export const parseFilter = (v: string | string[] | undefined): MobileFilter => MOBILE_FILTERS.find((f) => f === v) ?? 'all';

export function filterBugs(bugs: readonly BugRecord[], f: MobileFilter): BugRecord[] {
  return bugs.filter((b) => {
    const c = columnOf(b);
    return c !== undefined && (f === 'all' || c === f);
  });
}

/** The steps to list on a phone: a window around the first failure, or the first few when nothing failed. */
export function stepWindow<T extends { readonly status: string }>(steps: readonly T[]): T[] {
  const failed = steps.findIndex((s) => s.status === 'failed');
  if (failed < 0) return steps.slice(0, 8);
  return steps.slice(Math.max(0, failed - 2), failed + 2);
}

/** "Reproduced 3/3" text. */
export const reproLabel = (b: BugRecord): string => `Reproduced ${String(b.reproduced)}/${String(b.attempts)}`;

/** Whole-number percent, or undefined until a fix PR has been closed. */
export const percent = (rate: number | undefined): string | undefined => (rate === undefined ? undefined : `${String(Math.round(rate * 100))}%`);

export interface StoryItem {
  readonly label: string;
  readonly note: string;
  readonly tone: 'coral' | 'accent' | 'blue' | 'now';
  readonly time?: string;
}

/** The suspect-to-fix timeline, only from facts the record holds. */
export function buildStory(b: BugRecord, stamp: (iso: string) => string): StoryItem[] {
  const items: StoryItem[] = [
    { label: `Found by ${b.flow}`, note: oneLine(b.actual) || 'Found while running the flow.', tone: 'coral', time: stamp(b.createdAt) },
    { label: `Reproduced ${String(b.reproduced)} of ${String(b.attempts)}`, note: b.reproduced === b.attempts && b.attempts > 0 ? 'Fresh browsers, same steps. Confirmed every time.' : 'Not every replay hit it.', tone: 'coral' },
  ];
  if (b.recipe.length > 0) items.push({ label: `Recipe of ${String(b.recipe.length)} ${b.recipe.length === 1 ? 'step' : 'steps'}`, note: 'The shortest steps that still reproduce it.', tone: 'accent' });
  if (b.test) items.push({ label: b.test.proven ? 'Failing test written and run' : 'Test written but not proven', note: b.test.proven ? 'It failed for the bug’s reason, so it was kept.' : 'It did not fail for the bug’s reason, so nothing was filed.', tone: 'accent' });
  if (b.issue) items.push({ label: `Issue #${String(b.issue.number)} ${b.issue.action === 'seen_again' ? 'seen again' : 'opened'}`, note: `The issue is ${b.issue.state}.`, tone: 'accent' });
  if (b.fix) {
    const note = b.fix.status === 'skipped' ? (b.fix.note ?? 'No fix was requested.') : 'The issue mentioned your coding agent, as your settings allow.';
    items.push({ label: b.fix.status === 'skipped' ? 'No fix requested' : 'Fix requested from your coding agent', note, tone: 'blue' });
  }
  if (b.pull) items.push({ label: `PR #${String(b.pull.number)} ${PR_STATE_LABEL[b.pull.state]}`, note: b.pull.state === 'open' ? 'Waiting for a human to review and merge.' : b.pull.state === 'merged' ? 'A human merged the fix.' : 'The pull request was closed without merging.', tone: 'blue' });
  if (b.closeReason) items.push({ label: `Closed: ${closeReasonLabel(b.closeReason)}`, note: 'Recorded by a member of your team.', tone: 'now', time: stamp(b.updatedAt) });
  else if (b.pull?.state === 'open') items.push({ label: 'Your review', note: 'Approve and merge on GitHub, or close with a reason.', tone: 'now', time: 'Now' });
  return items;
}

/** Only http(s) links from bug records are rendered as links (a record is data, not trusted markup). */
export function safeHref(url: string): string | undefined {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : undefined;
  } catch {
    return undefined;
  }
}

export interface Token {
  readonly t: string;
  readonly c?: string;
}
const KEYWORDS = new Set(['import', 'from', 'const', 'let', 'var', 'async', 'await', 'function', 'return', 'export', 'if', 'else', 'new', 'for', 'of']);
const TOKEN = /(\/\/.*$)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)/g;

/** Light syntax coloring for one line of the spec, as text spans (the code is shown, never run). */
export function highlight(line: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    const at = m.index;
    if (at > last) out.push({ t: line.slice(last, at) });
    const text = m[0];
    if (m[1]) out.push({ t: text, c: '#6F7C94' });
    else if (m[2]) out.push({ t: text, c: '#FFC14D' });
    else if (m[3]) out.push({ t: text, c: KEYWORDS.has(text) ? '#B9A6FF' : '#6AA6FF' });
    else if (KEYWORDS.has(text)) out.push({ t: text, c: '#B9A6FF' });
    else out.push({ t: text });
    last = at + text.length;
  }
  if (last < line.length) out.push({ t: line.slice(last) });
  return out;
}
