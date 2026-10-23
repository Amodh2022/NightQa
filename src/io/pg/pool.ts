import pg from 'pg';
import { retryTransient } from '../../core/retry.js';
import { type DbEnv, redactDbUrl } from '../../core/env.js';

/** The database could not be reached or a query failed for good. The message never contains the password. */
export class DatabaseError extends Error {
  override readonly name = 'DatabaseError';
}

const TRANSIENT_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND']);

/** Connection trouble and a server that is starting up or shutting down (57P01-57P03, 08xxx, 53300) are worth a retry. */
export function isTransientDbError(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  if (typeof code !== 'string')
    return e instanceof Error && /Connection terminated|timeout/i.test(e.message);
  return (
    TRANSIENT_CODES.has(code) ||
    code.startsWith('08') ||
    code === '53300' ||
    /^57P0[1-3]$/.test(code)
  );
}

/** A pool with timeouts. Idle clients that error do not crash the process. */
export function createPool(env: DbEnv): pg.Pool {
  const pool = new pg.Pool({
    connectionString: env.url,
    max: env.poolMax,
    connectionTimeoutMillis: env.connectTimeoutMs,
    statement_timeout: env.statementTimeoutMs,
    idleTimeoutMillis: 30_000,
    application_name: 'nightqa',
  });
  pool.on('error', () => undefined); // an idle client dropped; the next query gets a fresh connection
  return pool;
}

/** Runs one query, retrying transient connection errors with backoff and jitter. */
export async function query<T extends pg.QueryResultRow>(
  pool: pg.Pool,
  text: string,
  values: readonly unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return retryTransient(() => pool.query<T>(text, [...values]), {
    isTransient: isTransientDbError,
  });
}

/** Checks the database answers. Fails closed with a message that hides the password. */
export async function ping(pool: pg.Pool, env: DbEnv): Promise<void> {
  try {
    await query(pool, 'select 1');
  } catch (e) {
    const why =
      e instanceof Error ? e.message.replaceAll(env.url, redactDbUrl(env.url)) : 'unknown error';
    throw new DatabaseError(`Cannot reach the database at ${redactDbUrl(env.url)}: ${why}`);
  }
}
