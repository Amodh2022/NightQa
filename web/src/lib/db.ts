import pg from 'pg';

let pool: pg.Pool | undefined;

/** The shared database pool, created on first use. Undefined when DATABASE_URL is not set (file storage). */
export function db(): pg.Pool | undefined {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return undefined;
  if (!pool) {
    pool = new pg.Pool({
      connectionString: url,
      max: Number(process.env.NIGHTQA_DB_POOL_MAX) || 5,
      connectionTimeoutMillis: Number(process.env.NIGHTQA_DB_CONNECT_TIMEOUT_MS) || 5_000,
      statement_timeout: Number(process.env.NIGHTQA_DB_STATEMENT_TIMEOUT_MS) || 15_000,
      idleTimeoutMillis: 30_000,
      application_name: 'nightqa-web',
    });
    pool.on('error', () => undefined); // an idle client dropped; the next query connects again
  }
  return pool;
}
