import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { slugify, type Recording } from '../core/recording.js';
import { generateSpec } from '../core/specgen.js';

export interface SavedTest {
  readonly saved: boolean;
  readonly recordingPath: string;
  readonly specPath: string;
}

/**
 * Saves a passing run as a regression test: `<slug>.recording.json` (for NightQA replays, zero AI) and
 * `<slug>.spec.ts` (plain Playwright the customer owns). An existing test is never overwritten silently:
 * a changed app must be approved by a human first.
 */
export async function saveRegressionTest(
  testsDir: string,
  rec: Recording,
  opts: { overwrite?: boolean } = {},
): Promise<SavedTest> {
  const slug = slugify(rec.flow);
  const recordingPath = join(testsDir, `${slug}.recording.json`);
  const specPath = join(testsDir, `${slug}.spec.ts`);
  if (existsSync(recordingPath) && !opts.overwrite)
    return { saved: false, recordingPath, specPath };
  await mkdir(testsDir, { recursive: true });
  await writeFile(recordingPath, `${JSON.stringify(rec, null, 2)}\n`);
  await writeFile(specPath, generateSpec(rec));
  return { saved: true, recordingPath, specPath };
}
