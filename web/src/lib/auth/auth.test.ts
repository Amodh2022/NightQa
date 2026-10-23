import { describe, expect, it } from 'vitest';
import { routeAccess } from './access';
import { loadAuthConfig, methodsOf, type EnabledAuth, type GithubProvider } from './config';
import { LoginError, authorizeUrl, completeLogin, decideRole, newLoginAttempt } from './oauth';
import { newSession, readSession, signToken, verifyToken, type Session } from './session';

const ENV = {
  NIGHTQA_GITHUB_CLIENT_ID: 'cid',
  NIGHTQA_GITHUB_CLIENT_SECRET: 'csecret',
  NIGHTQA_SESSION_SECRET: 'x'.repeat(40),
  NIGHTQA_PUBLIC_URL: 'http://localhost:3300/',
  NIGHTQA_AUTH_USERS: 'Octo-Cat, @alice',
  NIGHTQA_AUTH_VIEWERS: 'bob',
};

function enabled(over: Record<string, string | undefined> = {}): EnabledAuth {
  const c = loadAuthConfig({ ...ENV, ...over });
  if (c.mode !== 'on') throw new Error(`expected on, got ${c.mode}: ${JSON.stringify(c)}`);
  return c;
}

function github(over: Record<string, string | undefined> = {}): { cfg: EnabledAuth; gh: GithubProvider } {
  const cfg = enabled(over);
  if (!cfg.github) throw new Error('expected the github method');
  return { cfg, gh: cfg.github };
}

describe('loadAuthConfig', () => {
  it('is github mode when everything is set, with normalized lists and URLs', () => {
    const { cfg: c, gh } = github();
    expect(c.publicUrl).toBe('http://localhost:3300');
    expect([...gh.users]).toEqual(['octo-cat', 'alice']);
    expect([...gh.viewers]).toEqual(['bob']);
    expect(gh.githubUrl).toBe('https://github.com');
    expect(c.secureCookies).toBe(false);
    expect(methodsOf(c)).toEqual(['github']);
    expect(github({ NIGHTQA_PUBLIC_URL: 'https://qa.example.com' }).cfg.secureCookies).toBe(true);
  });
  it('treats blank values (as .env.example ships them) as not set', () => {
    const c = loadAuthConfig({ ...ENV, NIGHTQA_OIDC_ISSUER: '', NIGHTQA_OIDC_CLIENT_ID: ' ', NIGHTQA_PASSWORD_AUTH: '' });
    expect(c.mode).toBe('on');
  });
  it('fails closed: nothing configured means unconfigured, not open', () => {
    const c = loadAuthConfig({});
    expect(c.mode).toBe('unconfigured');
    if (c.mode === 'unconfigured') {
      expect(c.problems.length).toBe(3);
      expect(c.problems.join(' ')).not.toContain('Invalid input'); // every message names the setting to add
      expect(c.problems[0]).toContain('Choose how people sign in');
      expect(c.problems.filter((p) => p.startsWith('NIGHTQA_')).length).toBe(2);
    }
  });
  it('fails closed on a half-configured method instead of ignoring it', () => {
    const c = loadAuthConfig({ ...ENV, NIGHTQA_GITHUB_CLIENT_SECRET: '' });
    expect(c.mode).toBe('unconfigured');
    if (c.mode === 'unconfigured') expect(c.problems.join(' ')).toContain('NIGHTQA_GITHUB_CLIENT_SECRET');
  });
  it('rejects a short session secret and an empty allow-list', () => {
    expect(loadAuthConfig({ ...ENV, NIGHTQA_SESSION_SECRET: 'short' }).mode).toBe('unconfigured');
    const c = loadAuthConfig({ ...ENV, NIGHTQA_AUTH_USERS: '', NIGHTQA_AUTH_VIEWERS: '' });
    expect(c.mode).toBe('unconfigured');
    if (c.mode === 'unconfigured') expect(c.problems.join(' ')).toContain('Say who may sign in with GitHub');
  });
  it('turns off only on the explicit switch', () => {
    expect(loadAuthConfig({ NIGHTQA_AUTH: 'off' }).mode).toBe('off');
    expect(loadAuthConfig({ NIGHTQA_AUTH: 'false' }).mode).toBe('unconfigured');
    expect(loadAuthConfig({ ...ENV, NIGHTQA_AUTH_ORG: 'acme', NIGHTQA_AUTH_USERS: '', NIGHTQA_AUTH_VIEWERS: '' }).mode).toBe('on');
  });
});

describe('sessions', () => {
  const secret = 'k'.repeat(40);
  it('round-trips a session', async () => {
    const token = await signToken(newSession('octo-cat', 'member', 1000), secret);
    expect(await readSession(token, secret, 1001)).toEqual({ login: 'octo-cat', role: 'member', exp: 1000 + 12 * 3600 });
  });
  it('rejects tampering, the wrong secret, expiry and junk', async () => {
    const token = await signToken(newSession('octo-cat', 'viewer', 1000), secret);
    const [body, sig] = token.split('.');
    const forged = `${btoa(JSON.stringify({ login: 'octo-cat', role: 'member', exp: 9_999_999_999 })).replace(/=+$/, '')}.${sig ?? ''}`;
    expect(await readSession(forged, secret, 1001)).toBeUndefined();
    expect(await readSession(`${body ?? ''}.AAAA`, secret, 1001)).toBeUndefined();
    expect(await readSession(token, 'z'.repeat(40), 1001)).toBeUndefined();
    expect(await readSession(token, secret, 1000 + 12 * 3600 + 1)).toBeUndefined();
    for (const junk of [undefined, '', 'abc', 'a.b.c', '.', 'a.']) expect(await readSession(junk, secret)).toBeUndefined();
  });
  it('rejects a validly signed payload that is not a session', async () => {
    const token = await signToken({ login: 'x', role: 'admin', exp: 9_999_999_999 }, secret);
    expect(await readSession(token, secret)).toBeUndefined();
    expect(await verifyToken(await signToken({ no: 'exp' }, secret), secret)).toBeUndefined();
  });
});

describe('oauth', () => {
  it('builds an authorize URL with state, PKCE, minimal scope and no sign-ups', async () => {
    const a = await newLoginAttempt();
    const u = new URL(authorizeUrl(github().cfg, github().gh, a.state, a.challenge));
    expect(u.origin + u.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(u.searchParams.get('redirect_uri')).toBe('http://localhost:3300/api/auth/callback');
    expect(u.searchParams.get('scope')).toBe('read:user');
    expect(u.searchParams.get('state')).toBe(a.state);
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('allow_signup')).toBe('false');
    expect(new URL(authorizeUrl(github({ NIGHTQA_AUTH_ORG: 'acme' }).cfg, github({ NIGHTQA_AUTH_ORG: 'acme' }).gh, 's', 'c')).searchParams.get('scope')).toBe('read:user read:org');
    expect((await newLoginAttempt()).state).not.toBe(a.state);
  });
  it('decides roles: member beats viewer, strangers get nothing', () => {
    const c = github().gh;
    expect(decideRole(c, 'Octo-Cat', false)).toBe('member');
    expect(decideRole(c, 'BOB', false)).toBe('viewer');
    expect(decideRole(c, 'mallory', false)).toBeUndefined();
    expect(decideRole(c, 'mallory', true)).toBe('member');
  });

  function fakeGithub(login: string, orgState?: string, tokenOk = true): typeof fetch {
    return ((url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      const json = (b: unknown, status = 200): Promise<Response> => Promise.resolve(new Response(JSON.stringify(b), { status }));
      if (u.endsWith('/login/oauth/access_token')) {
        const body = JSON.parse(String(init?.body)) as Record<string, string>;
        expect(body.code_verifier).toBe('ver');
        return tokenOk ? json({ access_token: 'tok' }) : json({ error: 'bad_verification_code' }, 200);
      }
      if (u.endsWith('/user')) return json({ login });
      if (u.includes('/user/memberships/orgs/')) return orgState ? json({ state: orgState }) : json({}, 404);
      return json({}, 404);
    }) as typeof fetch;
  }

  it('signs in an allowed user and returns their role', async () => {
    expect(await completeLogin(github().cfg, github().gh, 'code', 'ver', fakeGithub('Octo-Cat'))).toEqual({ login: 'Octo-Cat', role: 'member' });
    expect(await completeLogin(github().cfg, github().gh, 'code', 'ver', fakeGithub('bob'))).toEqual({ login: 'bob', role: 'viewer' });
  });
  it('refuses someone who is not on the list', async () => {
    await expect(completeLogin(github().cfg, github().gh, 'code', 'ver', fakeGithub('mallory'))).rejects.toMatchObject({ reason: 'not_allowed' });
  });
  it('uses org membership only when it is active', async () => {
    const { cfg, gh } = github({ NIGHTQA_AUTH_ORG: 'acme', NIGHTQA_AUTH_USERS: '', NIGHTQA_AUTH_VIEWERS: '' });
    expect(await completeLogin(cfg, gh, 'c', 'ver', fakeGithub('dana', 'active'))).toEqual({ login: 'dana', role: 'member' });
    await expect(completeLogin(cfg, gh, 'c', 'ver', fakeGithub('dana', 'pending'))).rejects.toBeInstanceOf(LoginError);
    await expect(completeLogin(cfg, gh, 'c', 'ver', fakeGithub('dana'))).rejects.toMatchObject({ reason: 'not_allowed' });
  });
  it('fails when GitHub rejects the code', async () => {
    await expect(completeLogin(github().cfg, github().gh, 'bad', 'ver', fakeGithub('Octo-Cat', undefined, false))).rejects.toMatchObject({ reason: 'failed' });
  });
});

describe('routeAccess', () => {
  const member = { login: 'a', role: 'member' as const, exp: 1 };
  const viewer = { login: 'b', role: 'viewer' as const, exp: 1 };
  const on = enabled();
  const decide = (pathname: string, method = 'GET', session = undefined as Session | undefined, config = on as ReturnType<typeof loadAuthConfig>) => routeAccess({ pathname, method, session, config });

  it('sends anonymous page requests to the login page and API calls to 401', () => {
    expect(decide('/')).toEqual({ kind: 'redirect', to: '/login' });
    expect(decide('/runs/abc')).toEqual({ kind: 'redirect', to: '/login' });
    expect(decide('/api/runs')).toMatchObject({ kind: 'deny', status: 401 });
    expect(decide('/api/runs/x/files/a.png')).toMatchObject({ kind: 'deny', status: 401 });
  });
  it('keeps only the login page, sign-in routes and assets public', () => {
    for (const p of ['/login', '/api/auth/github', '/api/auth/callback', '/_next/static/x.js', '/favicon.ico']) expect(decide(p)).toEqual({ kind: 'allow' });
    expect(decide('/api/authx')).toMatchObject({ kind: 'deny' });
  });
  it('lets members do everything and viewers only read', () => {
    expect(decide('/runs', 'GET', member)).toEqual({ kind: 'allow' });
    expect(decide('/api/runs', 'POST', member)).toEqual({ kind: 'allow' });
    expect(decide('/runs', 'GET', viewer)).toEqual({ kind: 'allow' });
    expect(decide('/api/runs', 'POST', viewer)).toMatchObject({ kind: 'deny', status: 403 });
  });
  it('serves nothing while sign-in is unconfigured, and everything only when explicitly off', () => {
    const un = loadAuthConfig({});
    expect(decide('/', 'GET', undefined, un)).toEqual({ kind: 'redirect', to: '/login' });
    expect(decide('/api/runs', 'GET', undefined, un)).toMatchObject({ status: 503 });
    expect(decide('/login', 'GET', undefined, un)).toEqual({ kind: 'allow' });
    expect(decide('/', 'GET', undefined, loadAuthConfig({ NIGHTQA_AUTH: 'off' }))).toEqual({ kind: 'allow' });
  });
});
