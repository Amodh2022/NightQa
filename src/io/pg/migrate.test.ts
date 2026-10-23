import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checksumOf, planMigrations, readMigrations, type MigrationFile } from './migrate.js';
import { isTransientDbError } from './pool.js';

const file = (id: string, sql: string): MigrationFile => ({ id, sql, checksum: checksumOf(sql) });

describe('planMigrations', () => {
  const a = file('001_a', 'select 1');
  const b = file('002_b', 'select 2');

  it('returns only the migrations not applied yet, in order', () => {
    expect(planMigrations([a, b], new Map([[a.id, a.checksum]]))).toEqual([b]);
    expect(planMigrations([a, b], new Map())).toEqual([a, b]);
    expect(
      planMigrations(
        [a, b],
        new Map([
          [a.id, a.checksum],
          [b.id, b.checksum],
        ]),
      ),
    ).toEqual([]);
  });
  it('rejects an applied migration that was edited', () => {
    expect(() => planMigrations([a], new Map([[a.id, 'other']]))).toThrow(
      /changed after it was applied/,
    );
  });
  it('rejects an applied migration whose file is gone', () => {
    expect(() => planMigrations([b], new Map([[a.id, a.checksum]]))).toThrow(/file is missing/);
  });
});

describe('readMigrations', () => {
  it('reads NNN_name.sql files in order and ignores everything else', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nq-mig-'));
    await writeFile(join(dir, '002_second.sql'), 'select 2');
    await writeFile(join(dir, '001_first.sql'), 'select 1');
    await writeFile(join(dir, 'notes.md'), 'ignore me');
    const found = await readMigrations(dir);
    expect(found.map((m) => m.id)).toEqual(['001_first', '002_second']);
    expect(found[0]?.checksum).toBe(checksumOf('select 1'));
  });
});

describe('isTransientDbError', () => {
  it('retries connection trouble and server restarts, not SQL mistakes', () => {
    expect(isTransientDbError(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }))).toBe(true);
    expect(isTransientDbError(Object.assign(new Error('x'), { code: '57P03' }))).toBe(true);
    expect(isTransientDbError(Object.assign(new Error('x'), { code: '08006' }))).toBe(true);
    expect(isTransientDbError(Object.assign(new Error('x'), { code: '42P01' }))).toBe(false);
    expect(isTransientDbError(new Error('Connection terminated unexpectedly'))).toBe(true);
  });
});
