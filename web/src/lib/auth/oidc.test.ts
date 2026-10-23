import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from 'jose';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadAuthConfig, type EnabledAuth, type OidcProvider } from './config';
import { newLoginAttempt } from './oauth';
import { clearOidcCache, completeOidcLogin, decideOidcRole, discover, groupsFrom, oidcAuthorizeUrl, type OidcMetadata } from './oidc';

const ISSUER = 'https://sso.example.com/realms/acme';
const ENV = {
  NIGHTQA_SESSION_SECRET: 'x'.repeat(40),
  NIGHTQA_PUBLIC_URL: 'https://qa.example.com',
  NIGHTQA_OIDC_ISSUER: `${ISSUER}/`,
  NIGHTQA_OIDC_CLIENT_ID: 'nightqa',
  NIGHTQA_OIDC_CLIENT_SECRET: 'shh',
  NIGHTQA_OIDC_NAME: 'Acme SSO',
  NIGHTQA_OIDC_ALLOWED_EMAILS: 'Dana@Example.com',
  NIGHTQA_OIDC_ALLOWED_DOMAINS: 'acme.io',
  NIGHTQA_OIDC_VIEWER_GROUPS: 'qa-viewers',
  NIGHTQA_OIDC_MEMBER_GROUPS: 'qa-team',
};

function setup(over: Record<string, string | undefined> = {}): { cfg: EnabledAuth; oidc: OidcProvider } {
  const cfg = loadAuthConfig({ ...ENV, ...over });
  if (cfg.mode !== 'on' || !cfg.oidc) throw new Error(`expected oidc, got ${JSON.stringify(cfg)}`);
  return { cfg, oidc: cfg.oidc };
}

const META: OidcMetadata = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/auth`,
  token_endpoint: `${ISSUER}/token`,
  jwks_uri: `${ISSUER}/certs`,
};

describe('oidc config', () => {
  it('normalizes the issuer and lists the method', () => {
    const { oidc } = setup();
    expect(oidc.issuer).toBe(ISSUER);
    expect(oidc.name).toBe('Acme SSO');
    expect([...oidc.emails]).toEqual(['dana@example.com']);
  });
  it('needs a rule for who may sign in, https, and all three connection settings', () => {
    const none = { NIGHTQA_OIDC_ALLOWED_EMAILS: '', NIGHTQA_OIDC_ALLOWED_DOMAINS: '', NIGHTQA_OIDC_VIEWER_GROUPS: '', NIGHTQA_OIDC_MEMBER_GROUPS: '' };
    expect(loadAuthConfig({ ...ENV, ...none }).mode).toBe('unconfigured');
    expect(loadAuthConfig({ ...ENV, NIGHTQA_OIDC_ISSUER: 'http://sso.example.com' }).mode).toBe('unconfigured');
    expect(loadAuthConfig({ ...ENV, NIGHTQA_OIDC_ISSUER: 'http://sso.example.com', NIGHTQA_OIDC_ALLOW_HTTP: '1' }).mode).toBe('on');
    expect(loadAuthConfig({ ...ENV, NIGHTQA_OIDC_ISSUER: 'http://localhost:8080/realms/x' }).mode).toBe('on');
    expect(loadAuthConfig({ ...ENV, NIGHTQA_OIDC_CLIENT_SECRET: '' }).mode).toBe('unconfigured');
    expect(loadAuthConfig({ ...ENV, NIGHTQA_OIDC_DEFAULT_ROLE: 'admin' }).mode).toBe('unconfigured');
  });
});

describe('groupsFrom and decideOidcRole', () => {
  const { oidc } = setup();
  it('reads groups from arrays and strings', () => {
    expect(groupsFrom(['a', 1, 'b'])).toEqual(['a', 'b']);
    expect(groupsFrom('a, b c')).toEqual(['a', 'b', 'c']);
    expect(groupsFrom(undefined)).toEqual([]);
  });
  it('allows by exact email, domain or group; member beats viewer; strangers get nothing', () => {
    expect(decideOidcRole(oidc, 'dana@example.com', [])).toBe('member');
    expect(decideOidcRole(oidc, 'sam@acme.io', [])).toBe('member');
    expect(decideOidcRole(oidc, 'x@evil.io', ['qa-viewers'])).toBe('viewer');
    expect(decideOidcRole(oidc, 'x@evil.io', ['qa-viewers', 'qa-team'])).toBe('member');
    expect(decideOidcRole(oidc, 'x@evil.io', ['qa-TEAM'])).toBeUndefined(); // group names are case-sensitive
    expect(decideOidcRole(oidc, 'x@evil.io', [])).toBeUndefined();
    expect(decideOidcRole(oidc, 'sam@acme.io.evil.com', [])).toBeUndefined();
    expect(decideOidcRole(oidc, 'a@b@acme.io', [])).toBeUndefined();
  });
  it('gives domain and email matches the default role', () => {
    expect(decideOidcRole(setup({ NIGHTQA_OIDC_DEFAULT_ROLE: 'viewer' }).oidc, 'sam@acme.io', [])).toBe('viewer');
  });
});

describe('discover', () => {
  beforeEach(clearOidcCache);
  const { oidc } = setup();
  const doc = (over: Record<string, unknown> = {}) => ({ ...META, ...over });
  const fetchOf = (body: unknown, calls: string[] = [], status = 200): typeof fetch =>
    ((url: string | URL | Request) => {
      calls.push(String(url));
      return Promise.resolve(new Response(JSON.stringify(body), { status }));
    }) as typeof fetch;

  it('reads the discovery document once and caches it', async () => {
    const calls: string[] = [];
    expect(await discover(oidc, fetchOf(doc(), calls))).toMatchObject({ token_endpoint: META.token_endpoint });
    await discover(oidc, fetchOf(doc(), calls));
    expect(calls).toEqual([`${ISSUER}/.well-known/openid-configuration`]);
  });
  it('refuses a document whose issuer is a different address', async () => {
    await expect(discover(oidc, fetchOf(doc({ issuer: 'https://evil.example.com' })))).rejects.toMatchObject({ reason: 'failed' });
  });
  it('refuses junk and errors', async () => {
    await expect(discover(oidc, fetchOf({ nope: 1 }))).rejects.toMatchObject({ reason: 'failed' });
    await expect(discover(oidc, fetchOf(doc(), [], 500))).rejects.toMatchObject({ reason: 'failed' });
  });
});

describe('oidcAuthorizeUrl', () => {
  it('carries state, nonce, PKCE and the callback', async () => {
    const { cfg, oidc } = setup();
    const a = await newLoginAttempt();
    const u = new URL(oidcAuthorizeUrl(cfg, oidc, META, a));
    expect(u.origin + u.pathname).toBe(`${ISSUER}/auth`);
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('redirect_uri')).toBe('https://qa.example.com/api/auth/oidc/callback');
    expect(u.searchParams.get('scope')).toBe('openid email profile');
    expect(u.searchParams.get('state')).toBe(a.state);
    expect(u.searchParams.get('nonce')).toBe(a.nonce);
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
  });
});

describe('completeOidcLogin', () => {
  beforeEach(clearOidcCache);
  const NOW = new Date('2026-10-23T12:00:00Z');
  const input = { code: 'code', verifier: 'ver', nonce: 'n-1' };

  async function world() {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk: JWK = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
    const keys = () => createLocalJWKSet({ keys: [jwk] });
    const sign = (claims: Record<string, unknown>, over: { iss?: string; aud?: string; exp?: number } = {}) =>
      new SignJWT({ nonce: 'n-1', email: 'dana@example.com', email_verified: true, ...claims })
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setIssuer(over.iss ?? ISSUER)
        .setAudience(over.aud ?? 'nightqa')
        .setSubject('u1')
        .setIssuedAt(Math.floor(NOW.getTime() / 1000))
        .setExpirationTime(over.exp ?? Math.floor(NOW.getTime() / 1000) + 300)
        .sign(privateKey);
    const requests: { url: string; headers: Headers; body: string }[] = [];
    const fetchWith = (idToken: Promise<string>, tokenStatus = 200, discoveryOver: Record<string, unknown> = {}): typeof fetch =>
      (async (url: string | URL | Request, init?: RequestInit) => {
        const u = String(url);
        if (u.endsWith('/.well-known/openid-configuration')) return new Response(JSON.stringify({ ...META, ...discoveryOver }));
        requests.push({ url: u, headers: new Headers(init?.headers), body: String(init?.body) });
        return new Response(JSON.stringify({ id_token: await idToken }), { status: tokenStatus });
      }) as typeof fetch;
    return { keys, sign, fetchWith, requests };
  }

  it('signs in an allowed person and sends the PKCE verifier and client secret', async () => {
    const w = await world();
    const { cfg, oidc } = setup();
    const out = await completeOidcLogin(cfg, oidc, input, { fetchFn: w.fetchWith(w.sign({})), keys: w.keys, now: NOW });
    expect(out).toEqual({ login: 'dana@example.com', role: 'member' });
    const body = new URLSearchParams(w.requests[0]?.body);
    expect(body.get('code_verifier')).toBe('ver');
    expect(body.get('client_secret')).toBe('shh');
    expect(body.get('redirect_uri')).toBe('https://qa.example.com/api/auth/oidc/callback');
  });
  it('maps a group claim to a role', async () => {
    const w = await world();
    const { cfg, oidc } = setup();
    const out = await completeOidcLogin(cfg, oidc, input, { fetchFn: w.fetchWith(w.sign({ email: 'v@else.org', groups: ['qa-viewers'] })), keys: w.keys, now: NOW });
    expect(out).toEqual({ login: 'v@else.org', role: 'viewer' });
  });
  it('uses HTTP Basic when the provider only supports that', async () => {
    const w = await world();
    const { cfg, oidc } = setup();
    await completeOidcLogin(cfg, oidc, input, { fetchFn: w.fetchWith(w.sign({}), 200, { token_endpoint_auth_methods_supported: ['client_secret_basic'] }), keys: w.keys, now: NOW });
    expect(w.requests[0]?.headers.get('authorization')).toBe(`Basic ${btoa('nightqa:shh')}`);
    expect(new URLSearchParams(w.requests[0]?.body).get('client_secret')).toBeNull();
  });

  const refuses = async (make: (w: Awaited<ReturnType<typeof world>>) => Promise<string>, reason: 'failed' | 'not_allowed') => {
    const w = await world();
    const { cfg, oidc } = setup();
    await expect(completeOidcLogin(cfg, oidc, input, { fetchFn: w.fetchWith(make(w)), keys: w.keys, now: NOW })).rejects.toMatchObject({ reason });
  };
  it('refuses a token for another audience, issuer, or one that expired', async () => {
    await refuses((w) => w.sign({}, { aud: 'someone-else' }), 'failed');
    await refuses((w) => w.sign({}, { iss: 'https://evil.example.com' }), 'failed');
    await refuses((w) => w.sign({}, { exp: Math.floor(NOW.getTime() / 1000) - 600 }), 'failed');
  });
  it('refuses a token with the wrong nonce (a replayed or injected token)', async () => {
    await refuses((w) => w.sign({ nonce: 'other' }), 'failed');
  });
  it('refuses a token signed by a different key', async () => {
    const w = await world();
    const other = await world();
    const { cfg, oidc } = setup();
    await expect(completeOidcLogin(cfg, oidc, input, { fetchFn: w.fetchWith(other.sign({})), keys: w.keys, now: NOW })).rejects.toMatchObject({ reason: 'failed' });
  });
  it('refuses a token signed with a shared secret (HS256)', async () => {
    const w = await world();
    const { cfg, oidc } = setup();
    const hs = new SignJWT({ nonce: 'n-1', email: 'dana@example.com' }).setProtectedHeader({ alg: 'HS256', kid: 'k1' }).setIssuer(ISSUER).setAudience('nightqa').setExpirationTime('5m').sign(new TextEncoder().encode('k'.repeat(32)));
    await expect(completeOidcLogin(cfg, oidc, input, { fetchFn: w.fetchWith(hs), keys: w.keys, now: new Date() })).rejects.toMatchObject({ reason: 'failed' });
  });
  it('refuses an unverified email, a missing email and a stranger', async () => {
    await refuses((w) => w.sign({ email_verified: false }), 'not_allowed');
    await refuses((w) => w.sign({ email_verified: 'false' }), 'not_allowed');
    await refuses((w) => w.sign({ email: undefined }), 'failed');
    await refuses((w) => w.sign({ email: 'mallory@evil.io' }), 'not_allowed');
  });
  it('refuses when the provider rejects the code', async () => {
    const w = await world();
    const { cfg, oidc } = setup();
    await expect(completeOidcLogin(cfg, oidc, input, { fetchFn: w.fetchWith(w.sign({}), 400), keys: w.keys, now: NOW })).rejects.toMatchObject({ reason: 'failed' });
  });
});
