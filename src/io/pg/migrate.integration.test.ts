import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadDbEnv } from '../../core/env.js';
import { migrate } from './migrate.js';
import { createPool, query } from './pool.js';

// Runs only when a throwaway database is given: NIGHTQA_TEST_DATABASE_URL=postgres://...
const env = loadDbEnv({ DATABASE_URL: process.env.NIGHTQA_TEST_DATABASE_URL });
const log = { info: () => undefined, warn: () => undefined, error: () => undefined };

describe.skipIf(!env)('migrate (real Postgres)', () => {
  const pool = env ? createPool(env) : undefined;
  afterAll(async () => {
    await pool?.end();
  });

  it('applies the schema once and is repeatable', async () => {
    if (!pool) return;
    await pool.query('drop schema public cascade; create schema public;');
    const dir = join(process.cwd(), 'db', 'migrations');
    const first = await migrate(pool, dir, log);
    expect(first).toContain('001_init');
    expect(await migrate(pool, dir, log)).toEqual([]);
    const { rows } = await query<{ id: string }>(
      pool,
      "select id from projects where id = 'default'",
    );
    expect(rows).toHaveLength(1);
  });
});
