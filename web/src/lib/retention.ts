import { rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { z } from 'zod';
import { resultsDir } from './paths';
import { isRunId, listRuns, type RunView } from './results';
import { readJson, updateJson } from './store';

/** Evidence retention lives in its own small store (data/retention.json), not in settings.json. */
export const retentionSchema = z.object({ version: z.literal(1), days: z.number().int().min(1).max(3650) });
export type Retention = z.infer<typeof retentionSchema>;
export const DEFAULT_RETENTION: Retention = { version: 1, days: 30 };
const FILE = 'retention.json';

export const getRetention = (dir?: string): Promise<Retention> => readJson(FILE, retentionSchema, DEFAULT_RETENTION, dir);

export const saveRetentionDays = (days: number, dir?: string): Promise<Retention> =>
  updateJson(FILE, retentionSchema, DEFAULT_RETENTION, () => retentionSchema.parse({ version: 1, days }), dir);

/** Run folders that are older than `days` and not still running. */
export function expiredRuns(runs: readonly RunView[], days: number, now: Date): RunView[] {
  const cutoff = now.getTime() - days * 86_400_000;
  return runs.filter((r) => r.status !== 'running' && r.startedAt.getTime() < cutoff && isRunId(r.id));
}

export async function countExpired(days: number, now: Date = new Date()): Promise<number> {
  return expiredRuns(await listRuns(), days, now).length;
}

/** Deletes expired run folders under results/. Returns the ids removed. */
export async function deleteExpiredEvidence(days: number, now: Date = new Date(), root: string = resultsDir()): Promise<string[]> {
  const base = resolve(root);
  const removed: string[] = [];
  for (const run of expiredRuns(await listRuns(root), days, now)) {
    const target = resolve(join(base, run.id));
    if (!target.startsWith(base + sep)) continue; // never leave results/
    await rm(target, { recursive: true, force: true });
    removed.push(run.id);
  }
  return removed;
}
