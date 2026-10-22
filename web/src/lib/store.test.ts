import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { audit, recentAudit } from './audit';
import { readJson, updateJson, writeJson } from './store';
import { VaultError, decryptValue, deleteSecret, encryptValue, getSecret, hasSecret, listSecretNames, setSecret } from './vault';

const tmp = () => mkdtemp(join(tmpdir(), 'nq-data-'));
const num = z.object({ n: z.number() });

describe('json store', () => {
  it('falls back for a missing or invalid file and writes atomically', async () => {
    const dir = await tmp();
    expect(await readJson('a.json', num, { n: 1 }, dir)).toEqual({ n: 1 });
    await writeFile(join(dir, 'a.json'), '{"n":"x"}');
    expect(await readJson('a.json', num, { n: 1 }, dir)).toEqual({ n: 1 });
    await writeJson('a.json', { n: 5 }, dir);
    expect(await readJson('a.json', num, { n: 1 }, dir)).toEqual({ n: 5 });
  });
  it('does not lose concurrent updates', async () => {
    const dir = await tmp();
    await Promise.all(Array.from({ length: 20 }, () => updateJson('c.json', num, { n: 0 }, (c) => ({ n: c.n + 1 }), dir)));
    expect((await readJson('c.json', num, { n: -1 }, dir)).n).toBe(20);
  });
});

describe('vault', () => {
  const env = { NIGHTQA_SECRET_KEY: 'a-long-enough-secret-key' };
  it('encrypts at rest, round-trips, lists names only and deletes', async () => {
    const dir = await tmp();
    await setSecret('account:test-buyer:password', 'hunter2-VALUE', dir, env);
    expect(await readFile(join(dir, 'vault.json'), 'utf8')).not.toContain('hunter2-VALUE');
    expect(await getSecret('account:test-buyer:password', dir, env)).toBe('hunter2-VALUE');
    expect(await listSecretNames(dir)).toEqual(['account:test-buyer:password']);
    expect(await hasSecret('nope', dir)).toBe(false);
    await deleteSecret('account:test-buyer:password', dir);
    expect(await getSecret('account:test-buyer:password', dir, env)).toBeUndefined();
  });
  it('refuses to store anything without a key, and rejects a wrong key or a tampered value', async () => {
    const dir = await tmp();
    await expect(setSecret('x', 'v', dir, {})).rejects.toBeInstanceOf(VaultError);
    await setSecret('x', 'v', dir, env);
    await expect(getSecret('x', dir, { NIGHTQA_SECRET_KEY: 'another-long-secret-key!' })).rejects.toBeInstanceOf(VaultError);
    const e = encryptValue('v', 'a-long-enough-secret-key', 'c2FsdA==');
    expect(() => decryptValue({ ...e, data: Buffer.from('zz').toString('base64') }, 'a-long-enough-secret-key', 'c2FsdA==')).toThrow(VaultError);
  });
  it('rejects odd secret names', async () => {
    await expect(setSecret('../etc', 'v', await tmp(), env)).rejects.toBeInstanceOf(VaultError);
  });
});

describe('audit log', () => {
  it('appends and reads newest first', async () => {
    const dir = await tmp();
    await audit('amodh', 'settings.save', 'budgets', dir, () => new Date('2026-10-22T10:00:00Z'));
    await audit('amodh', 'run.start', 'checkout', dir, () => new Date('2026-10-22T11:00:00Z'));
    const ev = await recentAudit(10, dir);
    expect(ev.map((e) => e.action)).toEqual(['run.start', 'settings.save']);
  });
});
