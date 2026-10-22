import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { resultsDir } from './paths';

/** results/.nightqa/coverage.json, written by `nightqa explore`. */
export const coverageSchema = z.object({
  version: z.literal(1),
  pages: z.record(z.string(), z.object({ firstSeen: z.string(), lastSeen: z.string(), visits: z.number() })),
});
export type Coverage = z.infer<typeof coverageSchema>;

/** Parses the file text. A missing, broken or differently shaped file means "nothing explored yet" (undefined). */
export function parseCoverage(text: string | undefined): Coverage | undefined {
  if (text === undefined) return undefined;
  try {
    const p = coverageSchema.safeParse(JSON.parse(text));
    return p.success && Object.keys(p.data.pages).length > 0 ? p.data : undefined;
  } catch {
    return undefined;
  }
}

export async function readCoverage(root: string = resultsDir()): Promise<Coverage | undefined> {
  return parseCoverage(await readFile(join(root, '.nightqa', 'coverage.json'), 'utf8').catch(() => undefined));
}

/** True when a page path falls under a blocked entry such as "/admin", "/admin/*" or "checkout". */
export function isBlockedPath(path: string, blocked: readonly string[]): boolean {
  return blocked.some((raw) => {
    const b = raw.trim().replace(/\*+$/, '').replace(/\/+$/, '');
    if (!b) return false;
    return b.startsWith('/') ? path === b || path.startsWith(`${b}/`) : path.toLowerCase().includes(b.toLowerCase());
  });
}

export type TileState = 'visited' | 'new' | 'blocked';

export interface Tile {
  readonly path: string;
  readonly state: TileState;
  readonly visits: number;
}

export interface CoverageSummary {
  /** Pages ever visited. There is no list of "all pages", so no percentage is derived. */
  readonly total: number;
  readonly newCount: number;
  readonly tiles: readonly Tile[];
}

/** Tiles for the coverage map: most recently seen first; pages new in the latest run are marked. */
export function summarizeCoverage(cov: Coverage | undefined, newPages: readonly string[], blocked: readonly string[], limit = 80): CoverageSummary {
  if (!cov) return { total: 0, newCount: 0, tiles: [] };
  const fresh = new Set(newPages);
  const all = Object.entries(cov.pages)
    .sort(([, a], [, b]) => b.lastSeen.localeCompare(a.lastSeen))
    .map(([path, p]): Tile => ({ path, visits: p.visits, state: isBlockedPath(path, blocked) ? 'blocked' : fresh.has(path) ? 'new' : 'visited' }));
  return { total: all.length, newCount: all.filter((t) => t.state === 'new').length, tiles: all.slice(0, limit) };
}
