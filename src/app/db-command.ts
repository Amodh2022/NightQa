import { resolve } from 'node:path';
import { EnvError } from '../core/errors.js';
import { loadDbEnv, redactDbUrl } from '../core/env.js';
import type { Log } from '../core/ports.js';
import { migrate } from '../io/pg/migrate.js';
import { createPool, DatabaseError, ping } from '../io/pg/pool.js';

const MIGRATIONS = 'db/migrations';

/** `nightqa db migrate`: creates or updates the tables. Safe to run again. Exit 0 ok, 2 config or database error. */
export async function dbCommand(
  sub: string | undefined,
  env: Readonly<Record<string, string | undefined>>,
  log: Log,
): Promise<number> {
  if (sub !== 'migrate') {
    console.error('Usage: nightqa db migrate');
    return 2;
  }
  const dbEnv = loadDbEnv(env);
  if (!dbEnv) {
    console.error(new EnvError(['DATABASE_URL: is required for "nightqa db migrate"']).message);
    return 2;
  }
  const pool = createPool(dbEnv);
  try {
    await ping(pool, dbEnv);
    const applied = await migrate(pool, resolve(env.NIGHTQA_MIGRATIONS_DIR ?? MIGRATIONS), log);
    console.log(
      applied.length
        ? `Applied ${String(applied.length)} migration(s): ${applied.join(', ')}`
        : `Database is up to date (${redactDbUrl(dbEnv.url)})`,
    );
    return 0;
  } catch (e) {
    if (e instanceof DatabaseError) {
      console.error(e.message);
      return 2;
    }
    throw e;
  } finally {
    await pool.end();
  }
}
