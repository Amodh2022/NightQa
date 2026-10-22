import { z } from 'zod';
import type { GithubAuthConfig, Role } from './config';
import { b64url } from './session';

const enc = new TextEncoder();

/** A one-time login attempt: `state` stops forged callbacks, the PKCE verifier stops a stolen code being used. */
export async function newLoginAttempt(): Promise<{ state: string; verifier: string; challenge: string }> {
  const rand = (): string => b64url(crypto.getRandomValues(new Uint8Array(32)));
  const verifier = rand();
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(verifier))));
  return { state: rand(), verifier, challenge };
}

export const callbackUrl = (cfg: GithubAuthConfig): string => `${cfg.publicUrl}/api/auth/callback`;

/** Only the scopes needed: read the profile, and read org membership when an org allow-list is set. */
export const scopesFor = (cfg: GithubAuthConfig): string => (cfg.org ? 'read:user read:org' : 'read:user');

export function authorizeUrl(cfg: GithubAuthConfig, state: string, challenge: string): string {
  const u = new URL(`${cfg.githubUrl}/login/oauth/authorize`);
  u.searchParams.set('client_id', cfg.clientId);
  u.searchParams.set('redirect_uri', callbackUrl(cfg));
  u.searchParams.set('scope', scopesFor(cfg));
  u.searchParams.set('state', state);
  u.searchParams.set('code_challenge', challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  u.searchParams.set('allow_signup', 'false');
  return u.toString();
}

/** Who is allowed, and as what. Member beats viewer. Returns undefined for everyone else. */
export function decideRole(cfg: GithubAuthConfig, login: string, inOrg: boolean): Role | undefined {
  const l = login.toLowerCase();
  if (cfg.users.has(l) || inOrg) return 'member';
  if (cfg.viewers.has(l)) return 'viewer';
  return undefined;
}

export class LoginError extends Error {
  override readonly name = 'LoginError';
  constructor(
    readonly reason: 'not_allowed' | 'failed',
    message: string,
  ) {
    super(message);
  }
}

const tokenSchema = z.object({ access_token: z.string().min(1) });
const userSchema = z.object({ login: z.string().min(1) });
const membershipSchema = z.object({ state: z.string() });

/**
 * Finishes a GitHub login: swaps the code for a token, reads who the user is, checks the allow-list, and forgets
 * the token. The token is used for two read-only calls and never stored.
 * @throws LoginError
 */
export async function completeLogin(cfg: GithubAuthConfig, code: string, verifier: string, fetchFn: typeof fetch = fetch): Promise<{ login: string; role: Role }> {
  const signal = (): AbortSignal => AbortSignal.timeout(10_000);
  const tokenRes = await fetchFn(`${cfg.githubUrl}/login/oauth/access_token`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: cfg.clientId, client_secret: cfg.clientSecret, code, redirect_uri: callbackUrl(cfg), code_verifier: verifier }),
    signal: signal(),
  });
  const token = tokenSchema.safeParse(tokenRes.ok ? await tokenRes.json().catch(() => null) : null);
  if (!token.success) throw new LoginError('failed', 'GitHub did not accept the sign-in code');

  const headers = { authorization: `Bearer ${token.data.access_token}`, accept: 'application/vnd.github+json', 'user-agent': 'nightqa-dashboard' };
  const userRes = await fetchFn(`${cfg.apiUrl}/user`, { headers, signal: signal() });
  const user = userSchema.safeParse(userRes.ok ? await userRes.json().catch(() => null) : null);
  if (!user.success) throw new LoginError('failed', 'Could not read your GitHub profile');

  let inOrg = false;
  if (cfg.org && !cfg.users.has(user.data.login.toLowerCase())) {
    const m = await fetchFn(`${cfg.apiUrl}/user/memberships/orgs/${encodeURIComponent(cfg.org)}`, { headers, signal: signal() });
    const parsed = membershipSchema.safeParse(m.ok ? await m.json().catch(() => null) : null);
    inOrg = parsed.success && parsed.data.state === 'active';
  }
  const role = decideRole(cfg, user.data.login, inOrg);
  if (!role) throw new LoginError('not_allowed', `${user.data.login} is not on the allow-list`);
  return { login: user.data.login, role };
}
