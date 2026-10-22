import { NextResponse } from 'next/server';
import { authorizeUrl, newLoginAttempt } from '@/lib/auth/oauth';
import { oauthCookieName } from '@/lib/auth/config';
import { authConfig } from '@/lib/auth/server';
import { signToken } from '@/lib/auth/session';

/** Starts the GitHub sign-in: remember a one-time state and PKCE verifier in a short-lived signed cookie, then go to GitHub. */
export async function GET(req: Request): Promise<Response> {
  const cfg = authConfig();
  if (cfg.mode !== 'github') return NextResponse.redirect(new URL('/login', req.url));
  const attempt = await newLoginAttempt();
  const res = NextResponse.redirect(authorizeUrl(cfg, attempt.state, attempt.challenge));
  res.cookies.set(oauthCookieName(cfg.secureCookies), await signToken({ state: attempt.state, verifier: attempt.verifier, exp: Math.floor(Date.now() / 1000) + 600 }, cfg.sessionSecret), {
    httpOnly: true,
    secure: cfg.secureCookies,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  res.headers.set('cache-control', 'no-store');
  return res;
}
