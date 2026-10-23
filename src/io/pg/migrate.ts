import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type pg from 'pg';
import type { Log } from '../../core/ports.js';
import { DatabaseError } from './pool.js';

export interface MigrationFile {
  readonly id: string;
  readonly sql: string;
  readonly checksum: string;
}

const FILE_NAME = /^(\d{3,})_[a-z0-9_]+\.sql$/;
/** Any fixed number; migrations take this advisory lock so two processes never migrate at once. */
const LOCK_KEY = 786_420_001;

export const checksumOf = (sql: string): string => createHash('sha256').update(sql).digest('hex');

/** Reads `NNN_name.sql` files in order. Anything else in the folder is ignored. */
export async function readMigrations(dir: string): Promise<MigrationFile[]> {
  const names = (await readdir(dir)).filter((n) => FILE_NAME.test(n)).sort();
  return Promise.all(
    names.map(async (name) => {
      const sql = await readFile(join(dir, name), 'utf8');
      return { id: name.replace(/\.sql$/, ''), sql, checksum: checksumOf(sql) };
    }),
  );
}

/**
 * Which migrations still need to run. An applied migration whose file changed, or that has no file any more, is an
 * error: editing history would make databases drift apart.
 */
export function planMigrations(
  files: readonly MigrationFile[],
  applied: ReadonlyMap<string, string>,
): MigrationFile[] {
  for (const [id, checksum] of applied) {
    const file = files.find((f) => f.id === id);
    if (!file) throw new DatabaseError(`Migration ${id} was applied but its file is missing.`);
    if (file.checksum !== checksum) {
      throw new DatabaseError(
        `Migration ${id} was changed after it was applied. Add a new migration instead.`,
      );
    }
  }
  return files.filter((f) => !applied.has(f.id));
}

/** Applies pending migrations, each in its own transaction. Returns the ids it applied. */
export async function migrate(pool: pg.Pool, dir: string, log: Log): Promise<string[]> {
  const files = await readMigrations(dir);
  const client = await pool.connect();
  const done: string[] = [];
  try {
    await client.query('select pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(
      `create table if not exists schema_migrations (
         id text primary key, checksum text not null, applied_at timestamptz not null default now())`,
    );
    const rows = await client.query<{ id: string; checksum: string }>(
      'select id, checksum from schema_migrations',
    );
    const pending = planMigrations(files, new Map(rows.rows.map((r) => [r.id, r.checksum])));
    for (const m of pending) {
      try {
        await client.query('begin');
        await client.query(m.sql);
        await client.query('insert into schema_migrations (id, checksum) values ($1, $2)', [
          m.id,
          m.checksum,
        ]);
        await client.query('commit');
      } catch (e) {
        await client.query('rollback').catch(() => undefined);
        throw new DatabaseError(
          `Migration ${m.id} failed: ${e instanceof Error ? e.message : 'unknown error'}`,
        );
      }
      log.info({ migration: m.id }, 'migration applied');
      done.push(m.id);
    }
    return done;
  } finally {
    await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}
