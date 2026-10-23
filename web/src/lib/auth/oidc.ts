import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import type { AuthSettings, OidcProvider, Role } from './config';
import { LoginError } from './oauth';

const TIMEOUT_MS = 10_000;
/** Only asymmetric algorithms: a token "signed" with a shared secret or with `none` is never accepted. */
const ALGORITHMS = ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'ES512', 'EdDSA'];

const discoverySchema = z.object({
  issuer: z.string().min(1),
  authorization_endpoint: z.url(),
  token_endpoint: z.url(),
  jwks_uri: z.url(),
  token_endpoint_auth_methods_supported: z.array(z.string()).optional(),
});
export type OidcMetadata = z.infer<typeof discoverySchema>;

const tokenSchema = z.object({ id_token: z.string().min(1) });

export const oidcCallbackUrl = (cfg: AuthSettings): string => `${cfg.publicUrl}/api/auth/oidc/callback`;

const cache = new Map<string, { at: number; meta: OidcMetadata }>();
const CACHE_MS = 10 * 60_000;

/**
 * Reads the provider's discovery document. Its `issuer` must equal the configured one exactly, so a document served
 * from a look-alike address cannot redirect people to someone else's login page.
 * @throws LoginError
 */
export async function discover(oidc: OidcProvider, fetchFn: typeof fetch = fetch, now: number = Date.now()): Promise<OidcMetadata> {
  const hit = cache.get(oidc.issuer);
  if (hit && now - hit.at < CACHE_MS) return hit.meta;
  const res = await fetchFn(`${oidc.issuer}/.well-known/openid-configuration`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => undefined);
  const parsed = discoverySchema.safeParse(res?.ok ? await res.json().catch(() => null) : null);
  if (!parsed.success || parsed.data.issuer.replace(/\/+$/, '') !== oidc.issuer) throw new LoginError('failed', 'Could not read the SSO provider settings');
  cache.set(oidc.issuer, { at: now, meta: parsed.data });
  return parsed.data;
}

export function oidcAuthorizeUrl(cfg: AuthSettings, oidc: OidcProvider, meta: OidcMetadata, a: { state: string; nonce: string; challenge: string }): string {
  const u = new URL(meta.authorization_endpoint);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', oidc.clientId);
  u.searchParams.set('redirect_uri', oidcCallbackUrl(cfg));
  u.searchParams.set('scope', oidc.scopes);
  u.searchParams.set('state', a.state);
  u.searchParams.set('nonce', a.nonce);
  u.searchParams.set('code_challenge', a.challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  return u.toString();
}

/** Group names from a claim that is an array, or a comma or space separated string. */
export function groupsFrom(claim: unknown): string[] {
  if (Array.isArray(claim)) return claim.filter((g): g is string => typeof g === 'string');
  if (typeof claim === 'string') return claim.split(/[,\s]+/).filter(Boolean);
  return [];
}

/** Who is allowed, and as what. Member beats viewer. Returns undefined for everyone else (no rule means nobody). */
export function decideOidcRole(oidc: OidcProvider, email: string, groups: readonly string[]): Role | undefined {
  const at = email.split('@');
  const [, domain] = at;
  const byIdentity = at.length === 2 && (oidc.emails.has(email) || (domain !== undefined && oidc.domains.has(domain)));
  if (groups.some((g) => oidc.memberGroups.has(g)) || (byIdentity && oidc.defaultRole === 'member')) return 'member';
  if (groups.some((g) => oidc.viewerGroups.has(g)) || byIdentity) return 'viewer';
  return undefined;
}

export interface OidcDeps {
  readonly fetchFn?: typeof fetch;
  /** Where the signing keys come from. Replaceable in tests. */
  readonly keys?: (meta: OidcMetadata) => JWTVerifyGetKey;
  readonly now?: Date;
}

const remoteKeys = new Map<string, JWTVerifyGetKey>();
const defaultKeys = (meta: OidcMetadata): JWTVerifyGetKey => {
  let k = remoteKeys.get(meta.jwks_uri);
  if (!k) {
    k = createRemoteJWKSet(new URL(meta.jwks_uri), { timeoutDuration: TIMEOUT_MS });
    remoteKeys.set(meta.jwks_uri, k);
  }
  return k;
};

/**
 * Finishes an SSO login: swaps the code for tokens, verifies the ID token (signature from the provider's keys, issuer,
 * audience, expiry, nonce), reads the email and groups, and applies the allow-list. Tokens are never stored.
 * @throws LoginError
 */
export async function completeOidcLogin(
  cfg: AuthSettings,
  oidc: OidcProvider,
  input: { code: string; verifier: string; nonce: string },
  deps: OidcDeps = {},
): Promise<{ login: string; role: Role }> {
  const fetchFn = deps.fetchFn ?? fetch;
  const meta = await discover(oidc, fetchFn);
  const form = new URLSearchParams({ grant_type: 'authorization_code', code: input.code, redirect_uri: oidcCallbackUrl(cfg), code_verifier: input.verifier });
  const headers: Record<string, string> = { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' };
  const methods = meta.token_endpoint_auth_methods_supported;
  if (methods && !methods.includes('client_secret_post') && methods.includes('client_secret_basic')) {
    headers.authorization = `Basic ${btoa(`${encodeURIComponent(oidc.clientId)}:${encodeURIComponent(oidc.clientSecret)}`)}`;
  } else {
    form.set('client_id', oidc.clientId);
    form.set('client_secret', oidc.clientSecret);
  }
  const res = await fetchFn(meta.token_endpoint, { method: 'POST', headers, body: form, signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => undefined);
  const tokens = tokenSchema.safeParse(res?.ok ? await res.json().catch(() => null) : null);
  if (!tokens.success) throw new LoginError('failed', 'The SSO provider did not accept the sign-in code');

  let claims: Record<string, unknown>;
  try {
    const verified = await jwtVerify(tokens.data.id_token, (deps.keys ?? defaultKeys)(meta), {
      issuer: meta.issuer,
      audience: oidc.clientId,
      algorithms: ALGORITHMS,
      clockTolerance: 60,
      ...(deps.now ? { currentDate: deps.now } : {}),
    });
    claims = verified.payload;
  } catch {
    throw new LoginError('failed', 'The SSO identity token could not be verified');
  }
  if (claims.nonce !== input.nonce) throw new LoginError('failed', 'The SSO identity token does not belong to this sign-in');

  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
  if (!email) throw new LoginError('failed', 'The SSO provider did not share an email address');
  if (claims.email_verified === false || claims.email_verified === 'false') throw new LoginError('not_allowed', `${email} has not verified their email with the SSO provider`);
  const role = decideOidcRole(oidc, email, groupsFrom(claims[oidc.groupsClaim]));
  if (!role) throw new LoginError('not_allowed', `${email} is not on the SSO allow-list`);
  return { login: email, role };
}

/** For tests: forget cached discovery documents. */
export const clearOidcCache = (): void => cache.clear();
