import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { resultsDir } from './paths';
import { isRunId } from './results';

export const BUG_STATUSES = ['reported', 'ready', 'needs_look', 'discarded', 'below_threshold', 'test_not_proven', 'not_investigated'] as const;
export type BugStatus = (typeof BUG_STATUSES)[number];
export type Severity = 'critical' | 'high' | 'medium' | 'low';

/** Mirrors the engine's bug.json (src/core/bugs/record.ts). */
export const bugRecordSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  runId: z.string(),
  flow: z.string(),
  title: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  status: z.enum(BUG_STATUSES),
  statusNote: z.string(),
  reproduced: z.number(),
  attempts: z.number(),
  recipe: z.array(z.string()),
  expected: z.string(),
  actual: z.string(),
  evidence: z.array(z.string()),
  test: z.object({ file: z.string(), repoPath: z.string(), proven: z.boolean() }).optional(),
  issue: z.object({ number: z.number(), url: z.string(), state: z.enum(['open', 'closed']), action: z.enum(['created', 'seen_again']) }).optional(),
  fix: z.object({ status: z.enum(['requested', 'already_requested', 'skipped']), note: z.string().optional() }).optional(),
  pull: z.object({ number: z.number(), url: z.string(), state: z.enum(['open', 'merged', 'closed']) }).optional(),
  closeReason: z.enum(['wrong_fix', 'not_a_bug', 'wont_fix']).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BugRecord = z.infer<typeof bugRecordSchema>;

const BUG_ID = /^bug-[0-9a-f]{12}$/;
export const isBugId = (s: string): boolean => BUG_ID.test(s);

const SEVERITY_RANK: Record<Severity, number> = { critical: 3, high: 2, medium: 1, low: 0 };

/** Every readable bug record, newest first; most severe first within a run. Broken files are skipped. */
export async function listBugs(root: string = resultsDir()): Promise<BugRecord[]> {
  const runs = (await readdir(root).catch(() => [] as string[])).filter(isRunId).sort().reverse();
  const out: BugRecord[] = [];
  for (const run of runs) {
    const dir = join(root, run, 'bugs');
    const ids = (await readdir(dir).catch(() => [] as string[])).filter(isBugId);
    const here: BugRecord[] = [];
    for (const id of ids) {
      try {
        const p = bugRecordSchema.safeParse(JSON.parse(await readFile(join(dir, id, 'bug.json'), 'utf8')));
        if (p.success) here.push(p.data);
      } catch {
        /* skip unreadable */
      }
    }
    out.push(...here.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]));
  }
  return out;
}

export async function getBug(runId: string, bugId: string, root: string = resultsDir()): Promise<BugRecord | undefined> {
  if (!isRunId(runId) || !isBugId(bugId)) return undefined;
  try {
    const p = bugRecordSchema.safeParse(JSON.parse(await readFile(join(root, runId, 'bugs', bugId, 'bug.json'), 'utf8')));
    return p.success ? p.data : undefined;
  } catch {
    return undefined;
  }
}

/** One card per bug id: the newest record of each, so a bug seen on many nights is listed once. */
export function latestPerBug(bugs: readonly BugRecord[]): BugRecord[] {
  const seen = new Map<string, BugRecord>();
  for (const b of bugs) {
    const cur = seen.get(b.id);
    if (!cur || b.updatedAt > cur.updatedAt) seen.set(b.id, b);
  }
  return [...seen.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export type BoardColumn = 'proven' | 'fix_pr' | 'needs_look' | 'fixed';

/**
 * The board columns, from the real record: proven bugs awaiting a fix, fix PRs to review, flaky ones that need a
 * look, and fixed (issue closed or pull request merged). Discarded and below-threshold bugs are not on the board.
 */
export function columnOf(b: BugRecord): BoardColumn | undefined {
  if (b.pull?.state === 'merged' || b.issue?.state === 'closed') return 'fixed';
  if (b.pull?.state === 'open') return 'fix_pr';
  if (b.status === 'reported' || b.status === 'ready') return 'proven';
  if (b.status === 'needs_look' || b.status === 'test_not_proven') return 'needs_look';
  return undefined;
}

/** Share of closed fix pull requests that merged: the PRD's "merged fix rate". Undefined until one is closed. */
export function mergedFixRate(bugs: readonly BugRecord[]): number | undefined {
  const done = latestPerBug(bugs).filter((b) => b.pull && b.pull.state !== 'open');
  if (done.length === 0) return undefined;
  return done.filter((b) => b.pull?.state === 'merged').length / done.length;
}
