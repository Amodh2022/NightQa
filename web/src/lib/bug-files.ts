import { readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { bugRecordSchema, isBugId, type BugRecord } from './bugs';
import type { CloseReason } from './bug-view';
import { resultsDir } from './paths';
import { isRunId } from './results';
import { serialize, writeJson } from './store';

const MAX_SPEC_BYTES = 60_000;
const SPEC_EXT = /\.(ts|js|mjs)$/;

/** Reads the failing test the engine saved next to the bug. It is only shown, never executed. */
export async function readBugSpec(bug: BugRecord, root: string = resultsDir()): Promise<string | undefined> {
  if (!bug.test || !isRunId(bug.runId) || !SPEC_EXT.test(bug.test.file)) return undefined;
  const base = resolve(root, bug.runId);
  const full = resolve(base, bug.test.file);
  if (!full.startsWith(base + sep)) return undefined;
  try {
    const text = await readFile(full, 'utf8');
    return text.length > MAX_SPEC_BYTES ? `${text.slice(0, MAX_SPEC_BYTES)}\n// … file truncated` : text;
  } catch {
    return undefined;
  }
}

export type CloseResult = { readonly ok: true; readonly bug: BugRecord } | { readonly ok: false; readonly reason: 'not_found' };

/**
 * Records why a bug was closed. Reads the raw file and changes only closeReason and updatedAt, so any field this app
 * does not know about is kept. The write is atomic (temp file, then rename).
 */
export function setCloseReason(
  runId: string,
  bugId: string,
  reason: CloseReason,
  root: string = resultsDir(),
  now: () => Date = () => new Date(),
): Promise<CloseResult> {
  if (!isRunId(runId) || !isBugId(bugId)) return Promise.resolve({ ok: false, reason: 'not_found' });
  const dir = join(root, runId, 'bugs', bugId);
  return serialize(`${dir}/bug.json`, async (): Promise<CloseResult> => {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(join(dir, 'bug.json'), 'utf8'));
    } catch {
      return { ok: false, reason: 'not_found' };
    }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, reason: 'not_found' };
    const next = { ...raw, closeReason: reason, updatedAt: now().toISOString() };
    const parsed = bugRecordSchema.safeParse(next);
    if (!parsed.success) return { ok: false, reason: 'not_found' };
    await writeJson('bug.json', next, dir);
    return { ok: true, bug: parsed.data };
  });
}
