import { z } from 'zod';
import { readJson, updateJson } from './store';

/** The last real "Test connection" result, kept in data/connection-checks.json. Holds no secrets. */
const schema = z.object({
  version: z.literal(1),
  github: z.object({ ok: z.boolean(), repo: z.string(), at: z.string(), message: z.string() }).optional(),
});
export type ConnectionChecks = z.infer<typeof schema>;
const EMPTY: ConnectionChecks = { version: 1 };
const FILE = 'connection-checks.json';

export const getChecks = (dir?: string): Promise<ConnectionChecks> => readJson(FILE, schema, EMPTY, dir);

export const saveGithubCheck = (check: NonNullable<ConnectionChecks['github']>, dir?: string): Promise<ConnectionChecks> =>
  updateJson(FILE, schema, EMPTY, (c) => ({ ...c, github: check }), dir);

export const clearGithubCheck = (dir?: string): Promise<ConnectionChecks> => updateJson(FILE, schema, EMPTY, () => EMPTY, dir);
