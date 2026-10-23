import { NextResponse } from 'next/server';
import { cookieFlags } from '@/lib/auth/cookies';
import { oidcCookieName } from '@/lib/auth/config';
import { discover, oidcAuthorizeUrl } from '@/lib/auth/oidc';
import { newLoginAttempt } from '@/lib/auth/oauth';
import { clientKey, failureLimiter, startLimiter } from '@/lib/auth/rate-limit';
import { authConfig } from '@/lib/auth/server';
import { signToken } from '@/lib/auth/session';

/** Starts the SSO sign-in: remember a one-time state, nonce and PKCE verifier in a short-lived signed cookie, then go to the provider. */
export async function GET(req: Request): Promise<Response> {
  const cfg = authConfig();
  if (cfg.mode !== 'on' || !cfg.oidc) return NextResponse.redirect(new URL('/login', req.url));
  const who = clientKey(req.headers);
  if (!startLimiter.allowed(who) || !failureLimiter.allowed(who)) {
    return NextResponse.json({ error: 'Too many sign-in attempts. Try again in a few minutes.' }, { status: 429, headers: { 'retry-after': String(Math.max(startLimiter.retryAfterSeconds(who), failureLimiter.retryAfterSeconds(who))), 'cache-control': 'no-store' } });
  }
  startLimiter.record(who);
  let meta;
  try {
    meta = await discover(cfg.oidc);
  } catch {
    return NextResponse.redirect(new URL('/login?error=failed', cfg.publicUrl));
  }
  const a = await newLoginAttempt();
  const res = NextResponse.redirect(oidcAuthorizeUrl(cfg, cfg.oidc, meta, a));
  res.cookies.set(oidcCookieName(cfg.secureCookies), await signToken({ state: a.state, verifier: a.verifier, nonce: a.nonce, exp: Math.floor(Date.now() / 1000) + 600 }, cfg.sessionSecret), cookieFlags(cfg, 600));
  res.headers.set('cache-control', 'no-store');
  return res;
}
