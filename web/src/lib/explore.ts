import type { BugRecord } from './bugs';
import type { RunView } from './results';
import { isFinished, type FinishedRun } from './stats';
import type { PERSONAS } from './settings';

export type Persona = (typeof PERSONAS)[number];

/** Display copy for each persona the engine understands. `color` is a design token (coral, amber, blue, accent, violet). */
export const PERSONA_INFO: Record<Persona, { name: string; glyph: string; color: string; text: string }> = {
  'first-time-buyer': { name: 'First-time buyer', glyph: '1st', color: '#34E3CB', text: 'Has never used the app. Follows the obvious path, reads labels literally, and gets stuck where the copy is unclear.' },
  'returning-user': { name: 'Returning user', glyph: '↻', color: '#6AA6FF', text: 'Comes back to saved state: signs in again, opens old orders, profile and settings.' },
  'careless-typer': { name: 'Careless typer', glyph: 'Aa', color: '#FFC14D', text: 'Empty fields, very long text, emojis, special characters, letters in a phone field, Indian formats such as PIN codes and ₹ amounts.' },
  'impatient-clicker': { name: 'Impatient clicker', glyph: '»', color: '#FF6B5B', text: 'Double-clicks, skips optional fields, presses back in the middle of actions.' },
  'keyboard-only': { name: 'Keyboard-only user', glyph: '⌨', color: '#8B7CFF', text: 'Never touches the mouse. Checks that every control can be reached and used with Tab and Enter.' },
};

/** Same order as PERSONAS in settings.ts (kept here so client components need not import the server-only settings store). */
export const PERSONA_IDS: readonly Persona[] = ['first-time-buyer', 'returning-user', 'careless-typer', 'impatient-clicker', 'keyboard-only'];

/** Exploration runs, newest first (input order is kept). */
export function exploreRuns(runs: readonly RunView[]): FinishedRun[] {
  return runs.filter(isFinished).filter((r) => r.result.kind === 'explore');
}

export interface ExploreFinding {
  readonly bug: BugRecord;
  readonly persona: string | undefined;
}

/** Bugs whose run was an exploration run, with the persona that found them. */
export function exploreFindings(bugs: readonly BugRecord[], runs: readonly RunView[]): ExploreFinding[] {
  const byRun = new Map(exploreRuns(runs).map((r) => [r.id, r.result.persona]));
  return bugs.filter((b) => byRun.has(b.runId)).map((bug) => ({ bug, persona: byRun.get(bug.runId) }));
}

/** How many findings each persona has since `since`. */
export function findingsPerPersona(findings: readonly ExploreFinding[], since: Date): Map<string, number> {
  const out = new Map<string, number>();
  for (const f of findings) {
    if (!f.persona || new Date(f.bug.createdAt) < since) continue;
    out.set(f.persona, (out.get(f.persona) ?? 0) + 1);
  }
  return out;
}
