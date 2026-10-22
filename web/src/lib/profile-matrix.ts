import type { RunView } from './results';
import { isFinished } from './stats';

export interface ProfileId {
  readonly network: string;
  readonly screen: string;
}

export type CellKind = 'pass' | 'bug' | 'flaky' | 'setup' | 'stuck' | 'changed';

export interface Cell {
  readonly runId: string;
  readonly kind: CellKind;
}

export interface Matrix {
  readonly columns: readonly ProfileId[];
  readonly rows: readonly { readonly flow: string; readonly cells: readonly (Cell | undefined)[] }[];
}

export const DEFAULT_PROFILE: ProfileId = { network: 'none', screen: 'desktop' };
export const profileKey = (p: ProfileId): string => `${p.network}|${p.screen}`;

/** The profile a run used. Runs from before profiles existed ran with the defaults. */
export function runProfile(r: RunView): ProfileId {
  return r.result?.profile ?? DEFAULT_PROFILE;
}

function kindOf(r: RunView): CellKind | undefined {
  const res = r.result;
  if (!res) return undefined;
  if (res.verdict === 'pass') return res.flaky ? 'flaky' : 'pass';
  if (res.verdict === 'bug') return 'bug';
  if (res.verdict === 'needs_setup') return 'setup';
  if (res.verdict === 'agent_stuck') return 'stuck';
  return 'changed';
}

/**
 * The latest finished run for each flow under each profile. `runs` must be newest first. Exploration runs are
 * left out (they are not a flow). Columns are the `configured` profiles first, then every other profile seen in
 * the runs, most used first, at most `maxColumns`.
 */
export function buildMatrix(runs: readonly RunView[], flows: readonly string[], configured: readonly ProfileId[] = [], maxColumns = 6): Matrix {
  const finished = runs.filter(isFinished).filter((r) => r.result.kind !== 'explore');
  const uses = new Map<string, { id: ProfileId; n: number }>();
  for (const r of finished) {
    const id = runProfile(r);
    const k = profileKey(id);
    uses.set(k, { id, n: (uses.get(k)?.n ?? 0) + 1 });
  }
  const columns: ProfileId[] = [];
  const add = (p: ProfileId): void => {
    if (!columns.some((c) => profileKey(c) === profileKey(p))) columns.push(p);
  };
  configured.forEach(add);
  [...uses.values()]
    .sort((a, b) => b.n - a.n)
    .forEach((u) => {
      add(u.id);
    });
  const shown = columns.slice(0, maxColumns);
  const rows = flows.map((flow) => ({
    flow,
    cells: shown.map((c): Cell | undefined => {
      const r = finished.find((x) => x.flow === flow && profileKey(runProfile(x)) === profileKey(c));
      const kind = r ? kindOf(r) : undefined;
      return r && kind ? { runId: r.id, kind } : undefined;
    }),
  }));
  return { columns: shown, rows };
}
