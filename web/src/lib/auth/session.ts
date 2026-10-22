import type { Role } from './config';

const enc = new TextEncoder();

const b64url = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromB64url = (s: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const key = (secret: string): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

export interface Session {
  readonly login: string;
  readonly role: Role;
  /** Seconds since the epoch. */
  readonly exp: number;
}

/** Signs a payload as `<base64url json>.<base64url HMAC-SHA256>`. */
export async function signToken(payload: object, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

/** Returns the payload when the signature is valid (checked in constant time) and it has not expired. */
export async function verifyToken(token: string | undefined, secret: string, nowSeconds: number = Math.floor(Date.now() / 1000)): Promise<Record<string, unknown> | undefined> {
  if (!token) return undefined;
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return undefined;
  try {
    const ok = await crypto.subtle.verify('HMAC', await key(secret), fromB64url(sig), enc.encode(body));
    if (!ok) return undefined;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as unknown;
    if (!payload || typeof payload !== 'object') return undefined;
    const exp = (payload as { exp?: unknown }).exp;
    if (typeof exp !== 'number' || exp <= nowSeconds) return undefined;
    return payload as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

export const SESSION_SECONDS = 12 * 60 * 60;

export const newSession = (login: string, role: Role, nowSeconds: number = Math.floor(Date.now() / 1000)): Session => ({ login, role, exp: nowSeconds + SESSION_SECONDS });

/** Reads a session cookie value. Anything unsigned, tampered with, expired or malformed is no session. */
export async function readSession(token: string | undefined, secret: string, nowSeconds?: number): Promise<Session | undefined> {
  const p = await verifyToken(token, secret, nowSeconds);
  if (!p) return undefined;
  const { login, role, exp } = p;
  if (typeof login !== 'string' || (role !== 'member' && role !== 'viewer') || typeof exp !== 'number') return undefined;
  return { login, role, exp };
}

export { b64url };
