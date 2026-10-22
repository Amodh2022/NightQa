import { z } from 'zod';
import { dataDir } from './paths';
import { readJson, updateJson } from './store';

const stateSchema = z.object({
  version: z.literal(1),
  lastNightlyDate: z.string().optional(),
  lastReportDate: z.string().optional(),
  /** Bug ids a critical alert was already sent for, so one bug never alerts twice. Oldest first. */
  notifiedBugIds: z.array(z.string()).max(1000),
});
export type SchedulerFile = z.infer<typeof stateSchema>;

const FILE = 'scheduler.json';
const EMPTY: SchedulerFile = { version: 1, notifiedBugIds: [] };

export function getSchedulerState(dir: string = dataDir()): Promise<SchedulerFile> {
  return readJson(FILE, stateSchema, EMPTY, dir);
}

export function updateSchedulerState(change: (s: SchedulerFile) => SchedulerFile, dir: string = dataDir()): Promise<SchedulerFile> {
  return updateJson(FILE, stateSchema, EMPTY, change, dir);
}

export function markNotified(s: SchedulerFile, bugIds: readonly string[]): SchedulerFile {
  const merged = [...s.notifiedBugIds, ...bugIds.filter((id) => !s.notifiedBugIds.includes(id))];
  return { ...s, notifiedBugIds: merged.slice(-1000) };
}
