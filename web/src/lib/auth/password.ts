import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/** Parameters live inside each stored hash, so they can be raised later without locking anyone out. */
const N = 32_768;
const R = 8;
const P = 1;
const KEY_LEN = 64;

export const MIN_PASSWORD = 12;
export const MAX_PASSWORD = 200;

const derive = (password: string, salt: Buffer, n: number, r: number, p: number, len: number): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const opts: ScryptOptions = { N: n, r, p, maxmem: 128 * n * r * 2 };
    scrypt(password.normalize('NFKC'), salt, len, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });

/** `scrypt$N$r$p$salt$hash` with a fresh random salt. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P, KEY_LEN);
  return `scrypt$${String(N)}$${String(R)}$${String(P)}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/** Compares in constant time. A malformed stored hash is simply a mismatch. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  try {
    const actual = await derive(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p), expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** A real hash nobody knows the password of. Checked when the email is unknown so both paths take the same time. */
let decoy: Promise<string> | undefined;
export const decoyHash = (): Promise<string> => (decoy ??= hashPassword(randomBytes(24).toString('base64')));

/** Returns a message when the password is not acceptable. */
export function passwordProblem(password: string): string | undefined {
  if (password.length < MIN_PASSWORD) return `Use at least ${String(MIN_PASSWORD)} characters.`;
  if (password.length > MAX_PASSWORD) return `Use at most ${String(MAX_PASSWORD)} characters.`;
  return undefined;
}
