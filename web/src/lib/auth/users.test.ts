import { describe, expect, it } from 'vitest';
import { hashPassword, passwordProblem, verifyPassword } from './password';
import { LOCK_AFTER, createUser, ensureBootstrapUser, signInWithPassword, type UserRow, type UserStore } from './users';

class MemoryStore implements UserStore {
  rows: UserRow[] = [];
  async findByEmail(email: string) {
    return this.rows.find((r) => r.email === email);
  }
  async count() {
    return this.rows.length;
  }
  async create(email: string, passwordHash: string, role: 'member' | 'viewer') {
    if (this.rows.some((r) => r.email === email)) return false;
    this.rows.push({ id: this.rows.length + 1, email, passwordHash, role, disabled: false, failedAttempts: 0, lockedUntil: null });
    return true;
  }
  async recordFailure(id: number, lockAfter: number, lockUntil: Date) {
    this.rows = this.rows.map((r) => {
      if (r.id !== id) return r;
      const n = r.failedAttempts + 1;
      return n >= lockAfter ? { ...r, failedAttempts: 0, lockedUntil: lockUntil } : { ...r, failedAttempts: n };
    });
  }
  async recordSuccess(id: number) {
    this.rows = this.rows.map((r) => (r.id === id ? { ...r, failedAttempts: 0, lockedUntil: null } : r));
  }
}

const GOOD = 'correct horse battery';

describe('password hashing', () => {
  it('verifies the right password and nothing else, with a fresh salt each time', async () => {
    const a = await hashPassword(GOOD);
    const b = await hashPassword(GOOD);
    expect(a).not.toBe(b);
    expect(a.startsWith('scrypt$32768$8$1$')).toBe(true);
    expect(await verifyPassword(GOOD, a)).toBe(true);
    expect(await verifyPassword('wrong password!!', a)).toBe(false);
    expect(await verifyPassword(GOOD, 'garbage')).toBe(false);
    expect(await verifyPassword(GOOD, 'scrypt$1$1$1$AAAA$AAAA')).toBe(false);
  });
  it('asks for a long enough password', () => {
    expect(passwordProblem('short')).toContain('at least 12');
    expect(passwordProblem(GOOD)).toBeUndefined();
    expect(passwordProblem('x'.repeat(201))).toContain('at most 200');
  });
});

describe('signInWithPassword', () => {
  async function withUser(): Promise<MemoryStore> {
    const store = new MemoryStore();
    expect(await createUser(store, ' Dana@Example.com ', GOOD, 'member')).toEqual({ ok: true });
    return store;
  }

  it('signs in with the right email (any case) and password', async () => {
    const store = await withUser();
    expect(await signInWithPassword(store, 'DANA@example.com', GOOD)).toEqual({ ok: true, login: 'dana@example.com', role: 'member' });
  });
  it('gives the same answer for a wrong password and an unknown email', async () => {
    const store = await withUser();
    expect(await signInWithPassword(store, 'dana@example.com', 'wrong password!!')).toEqual({ ok: false, reason: 'credentials' });
    expect(await signInWithPassword(store, 'nobody@example.com', GOOD)).toEqual({ ok: false, reason: 'credentials' });
    expect(await signInWithPassword(store, 'not an email', GOOD)).toEqual({ ok: false, reason: 'credentials' });
  });
  it('refuses a disabled account', async () => {
    const store = await withUser();
    store.rows = store.rows.map((r) => ({ ...r, disabled: true }));
    expect(await signInWithPassword(store, 'dana@example.com', GOOD)).toEqual({ ok: false, reason: 'credentials' });
  });
  it('locks after repeated failures, even for the right password, then unlocks', async () => {
    const store = await withUser();
    const now = new Date('2026-10-23T12:00:00Z');
    for (let i = 0; i < LOCK_AFTER; i++) await signInWithPassword(store, 'dana@example.com', 'wrong password!!', now);
    expect(await signInWithPassword(store, 'dana@example.com', GOOD, now)).toEqual({ ok: false, reason: 'locked' });
    expect(await signInWithPassword(store, 'dana@example.com', 'wrong password!!', now)).toEqual({ ok: false, reason: 'credentials' }); // a guesser learns nothing
    const later = new Date(now.getTime() + 16 * 60_000);
    expect(await signInWithPassword(store, 'dana@example.com', GOOD, later)).toMatchObject({ ok: true });
  });
  it('resets the failure count after a success', async () => {
    const store = await withUser();
    for (let i = 0; i < LOCK_AFTER - 1; i++) await signInWithPassword(store, 'dana@example.com', 'wrong password!!');
    await signInWithPassword(store, 'dana@example.com', GOOD);
    expect(store.rows[0]?.failedAttempts).toBe(0);
  });
});

describe('createUser and ensureBootstrapUser', () => {
  it('rejects bad emails, short passwords and duplicates', async () => {
    const store = new MemoryStore();
    expect(await createUser(store, 'nope', GOOD, 'viewer')).toMatchObject({ ok: false });
    expect(await createUser(store, 'a@b.co', 'short', 'viewer')).toMatchObject({ ok: false });
    expect(await createUser(store, 'a@b.co', GOOD, 'viewer')).toEqual({ ok: true });
    expect(await createUser(store, 'A@B.co', GOOD, 'viewer')).toEqual({ ok: false, error: 'That email already has an account.' });
  });
  it('creates the first member from the environment only when there are no accounts', async () => {
    const store = new MemoryStore();
    const env = { NIGHTQA_BOOTSTRAP_EMAIL: 'Boss@Example.com', NIGHTQA_BOOTSTRAP_PASSWORD: GOOD };
    await ensureBootstrapUser(store, env);
    expect(store.rows.map((r) => [r.email, r.role])).toEqual([['boss@example.com', 'member']]);
    await ensureBootstrapUser(store, { ...env, NIGHTQA_BOOTSTRAP_EMAIL: 'other@example.com' });
    expect(store.rows).toHaveLength(1);
    const empty = new MemoryStore();
    await ensureBootstrapUser(empty, { NIGHTQA_BOOTSTRAP_EMAIL: 'x@y.co', NIGHTQA_BOOTSTRAP_PASSWORD: 'short' });
    await ensureBootstrapUser(empty, {});
    expect(empty.rows).toHaveLength(0);
  });
});
