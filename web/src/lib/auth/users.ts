import type { Role } from './config';
import { decoyHash, hashPassword, passwordProblem, verifyPassword } from './password';

export interface UserRow {
  readonly id: number;
  readonly email: string;
  readonly passwordHash: string;
  readonly role: Role;
  readonly disabled: boolean;
  readonly failedAttempts: number;
  readonly lockedUntil: Date | null;
}

/** Where accounts live. The Postgres version is in users-pg.ts; tests use an in-memory one. */
export interface UserStore {
  findByEmail(email: string): Promise<UserRow | undefined>;
  count(): Promise<number>;
  /** Returns false when the email is already taken. */
  create(email: string, passwordHash: string, role: Role): Promise<boolean>;
  /** Adds one failed attempt; locks the account when it reaches `lockAfter`. */
  recordFailure(id: number, lockAfter: number, lockUntil: Date): Promise<void>;
  recordSuccess(id: number): Promise<void>;
}

export const LOCK_AFTER = 5;
export const LOCK_MINUTES = 15;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const normalizeEmail = (v: string): string => v.trim().toLowerCase();
export const isEmail = (v: string): boolean => v.length <= 254 && EMAIL.test(v);

export type PasswordLogin = { readonly ok: true; readonly login: string; readonly role: Role } | { readonly ok: false; readonly reason: 'credentials' | 'locked' };

/**
 * Checks an email and password. Every failure looks the same from outside ("credentials"), unknown emails cost the
 * same time as wrong passwords, and repeated failures lock the account for a while. A locked account reports
 * "locked" only to someone who gave the right password, so that answer cannot be used to probe for accounts.
 */
export async function signInWithPassword(store: UserStore, emailInput: string, password: string, now: Date = new Date()): Promise<PasswordLogin> {
  const email = normalizeEmail(emailInput);
  const user = isEmail(email) && password.length <= 200 ? await store.findByEmail(email) : undefined;
  const matches = await verifyPassword(password, user?.passwordHash ?? (await decoyHash()));
  if (!user || user.disabled) return { ok: false, reason: 'credentials' };
  const locked = user.lockedUntil !== null && user.lockedUntil.getTime() > now.getTime();
  if (matches && !locked) {
    await store.recordSuccess(user.id);
    return { ok: true, login: user.email, role: user.role };
  }
  if (!matches) await store.recordFailure(user.id, LOCK_AFTER, new Date(now.getTime() + LOCK_MINUTES * 60_000));
  return { ok: false, reason: matches ? 'locked' : 'credentials' };
}

/**
 * Creates the first member from NIGHTQA_BOOTSTRAP_EMAIL and NIGHTQA_BOOTSTRAP_PASSWORD when there are no accounts yet.
 * Does nothing otherwise, so it is safe to call on every sign-in.
 */
export async function ensureBootstrapUser(store: UserStore, env: Readonly<Record<string, string | undefined>>): Promise<void> {
  const email = normalizeEmail(env.NIGHTQA_BOOTSTRAP_EMAIL ?? '');
  const password = env.NIGHTQA_BOOTSTRAP_PASSWORD ?? '';
  if (!isEmail(email) || passwordProblem(password) || (await store.count()) > 0) return;
  await store.create(email, await hashPassword(password), 'member');
}

export type CreateUserResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

/** Adds an account (used by members from the Team settings). */
export async function createUser(store: UserStore, emailInput: string, password: string, role: Role): Promise<CreateUserResult> {
  const email = normalizeEmail(emailInput);
  if (!isEmail(email)) return { ok: false, error: 'Enter a valid email address.' };
  const problem = passwordProblem(password);
  if (problem) return { ok: false, error: problem };
  return (await store.create(email, await hashPassword(password), role)) ? { ok: true } : { ok: false, error: 'That email already has an account.' };
}
