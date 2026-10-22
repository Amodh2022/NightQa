import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';

const pageSchema = z.strictObject({
  firstSeen: z.string(),
  lastSeen: z.string(),
  visits: z.number().int().min(1),
});
const fileSchema = z.strictObject({
  version: z.literal(1),
  pages: z.record(z.string(), pageSchema),
});
export type Coverage = z.infer<typeof fileSchema>;

export const coveragePath = (resultsDir: string): string =>
  join(resultsDir, '.nightqa', 'coverage.json');

export async function readCoverage(resultsDir: string): Promise<Coverage> {
  const path = coveragePath(resultsDir);
  if (!existsSync(path)) return { version: 1, pages: {} };
  try {
    return fileSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  } catch {
    return { version: 1, pages: {} };
  }
}

/** Splits visited paths into those never seen before and the rest, and records them all. */
export async function recordVisits(
  resultsDir: string,
  visited: readonly string[],
  now: Date,
): Promise<{ newPages: string[]; coverage: Coverage }> {
  const cov = await readCoverage(resultsDir);
  const at = now.toISOString();
  const newPages: string[] = [];
  const pages = { ...cov.pages };
  for (const p of new Set(visited)) {
    const prev = pages[p];
    if (!prev) newPages.push(p);
    pages[p] = { firstSeen: prev?.firstSeen ?? at, lastSeen: at, visits: (prev?.visits ?? 0) + 1 };
  }
  const coverage: Coverage = { version: 1, pages };
  const path = coveragePath(resultsDir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(coverage, null, 2)}\n`);
  return { newPages, coverage };
}
