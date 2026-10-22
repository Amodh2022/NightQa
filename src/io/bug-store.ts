import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bugRecordSchema, type BugRecord } from '../core/bugs/record.js';
import { redactDeep } from '../core/redact.js';

export function bugDir(resultsDir: string, runId: string, bugId: string): string {
  return join(resultsDir, runId, 'bugs', bugId);
}

/** Writes bug.json (secrets scrubbed) into the bug's folder. */
export async function saveBugRecord(
  resultsDir: string,
  rec: BugRecord,
  secrets: readonly string[],
): Promise<string> {
  const dir = bugDir(resultsDir, rec.runId, rec.id);
  await mkdir(dir, { recursive: true });
  const file = join(dir, 'bug.json');
  await writeFile(file, `${JSON.stringify(redactDeep(rec, secrets), null, 2)}\n`);
  return file;
}

/** Every readable bug record under a results folder, newest run first. Broken files are skipped. */
export async function listBugRecords(resultsDir: string): Promise<BugRecord[]> {
  if (!existsSync(resultsDir)) return [];
  const out: BugRecord[] = [];
  for (const run of (await readdir(resultsDir)).sort().reverse()) {
    const bugs = join(resultsDir, run, 'bugs');
    if (!existsSync(bugs)) continue;
    for (const id of await readdir(bugs)) {
      try {
        out.push(
          bugRecordSchema.parse(JSON.parse(await readFile(join(bugs, id, 'bug.json'), 'utf8'))),
        );
      } catch {
        /* skip unreadable */
      }
    }
  }
  return out;
}
