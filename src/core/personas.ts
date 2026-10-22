import { z } from 'zod';
import type { Flow } from './flow/schema.js';

export const PERSONA_NAMES = [
  'first-time-buyer',
  'returning-user',
  'careless-typer',
  'impatient-clicker',
  'keyboard-only',
] as const;
export const personaSchema = z.enum(PERSONA_NAMES);
export type Persona = z.infer<typeof personaSchema>;

/** How each kind of user behaves. Shown to the model as an instruction; the page can never change it. */
export const PERSONA_HINTS: Record<Persona, string> = {
  'first-time-buyer':
    'You have never used this app. Read headings and labels, follow the most obvious path, and try to reach and start the main purchase or sign-up journey.',
  'returning-user':
    'You use this app often. Go straight to account, orders and saved items, and try the features a regular user relies on.',
  'careless-typer':
    'You make typing mistakes. In forms, try odd but realistic input: extra spaces, mixed case, an Indian phone number such as +91 98765 43210, a PIN code such as 560001, names with accents, a very long value, and leave required fields empty once. Look for validation that is missing or wrong.',
  'impatient-clicker':
    'You never wait. Click again if nothing happens, press buttons twice, go back and forward, and try actions in an unusual order. Look for errors, duplicated actions and broken states.',
  'keyboard-only':
    'You cannot use a mouse. Prefer controls that have a clear label and can be reached in order, and note anything that cannot be operated or understood from its label.',
};

/**
 * A flow with no fixed expectations: the agent wanders the app as this kind of user, steering to pages it has not
 * seen yet. Bugs come from what the browser reports (errors, 5xx, dead links, blank pages, endless spinners).
 */
export function exploreFlow(
  persona: Persona,
  knownPages: readonly string[],
  sessions: number,
): Flow {
  const known = knownPages.length
    ? ` Pages already explored (prefer others): ${knownPages.slice(0, 30).join(', ')}.`
    : '';
  const steps = Array.from({ length: Math.max(1, sessions) }, (_, i) => ({
    text: `Explore, part ${String(i + 1)}: ${PERSONA_HINTS[persona]} Open a page you have not visited yet and use it as this user would, looking for problems.${known}`,
  }));
  return { flow: `Explore: ${persona}`, start: '/', tags: ['explore'], steps, variations: [] };
}
