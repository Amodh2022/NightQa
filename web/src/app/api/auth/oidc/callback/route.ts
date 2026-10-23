import { NextResponse } from 'next/server';
import { audit } from '@/lib/audit';
import { oidcCookieName, sessionCookieName } from '@/lib/auth/config';
import { cookieFlags, cookieValue } from '@/lib/auth/cookies';
import { LoginError } from '@/lib/auth/oauth';
import { completeOidcLogin } from '@/lib/auth/oidc';
import { clientKey, failureLimiter } from '@/lib/auth/rate-limit';
import { authConfig } from '@/lib/auth/server';
import { SESSION_SECONDS, newSession, signToken, verifyToken } from '@/lib/auth/session';

const fail = (base: string, secure: boolean, error: string, who: string): NextResponse => {
  failureLimiter.record(who);
  void audit('anonymous', 'auth.denied', `oidc:${error}`).catch(() => undefined);
  const res = NextResponse.redirect(new URL(`/login?error=${error}`, base));
  res.cookies.delete(oidcCookieName(secure));
  res.headers.set('cache-control', 'no-store');
  return res;
};

/** The SSO provider sends the browser back here. Check state, finish the login, then set the session cookie. */
export async function GET(req: Request): Promise<Response> {
  const cfg = authConfig();
  if (cfg.mode !== 'on' || !cfg.oidc) return NextResponse.redirect(new URL('/login', req.url));
  const url = new URL(req.url);
  const who = clientKey(req.headers);
  if (!failureLimiter.allowed(who)) {
    return NextResponse.json({ error: 'Too many failed sign-ins. Try again in a few minutes.' }, { status: 429, headers: { 'retry-after': String(failureLimiter.retryAfterSeconds(who)), 'cache-control': 'no-store' } });
  }
  if (url.searchParams.get('error')) return fail(cfg.publicUrl, cfg.secureCookies, 'denied', who);

  const attempt = await verifyToken(cookieValue(req.headers.get('cookie'), oidcCookieName(cfg.secureCookies)), cfg.sessionSecret);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!attempt || typeof attempt.state !== 'string' || typeof attempt.verifier !== 'string' || typeof attempt.nonce !== 'string' || !code || !state || state !== attempt.state) {
    return fail(cfg.publicUrl, cfg.secureCookies, 'state', who);
  }
  try {
    const { login, role } = await completeOidcLogin(cfg, cfg.oidc, { code, verifier: attempt.verifier, nonce: attempt.nonce });
    await audit(login, 'auth.login', `${role} via sso`).catch(() => undefined);
    const res = NextResponse.redirect(new URL('/', cfg.publicUrl));
    res.cookies.delete(oidcCookieName(cfg.secureCookies));
    res.cookies.set(sessionCookieName(cfg.secureCookies), await signToken(newSession(login, role, undefined, 'oidc'), cfg.sessionSecret), cookieFlags(cfg, SESSION_SECONDS));
    res.headers.set('cache-control', 'no-store');
    return res;
  } catch (e) {
    return fail(cfg.publicUrl, cfg.secureCookies, e instanceof LoginError ? e.reason : 'failed', who);
  }
}
