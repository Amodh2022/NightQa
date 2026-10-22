import { NextResponse } from 'next/server';
import { oauthCookieName, sessionCookieName } from '@/lib/auth/config';
import { LoginError, completeLogin } from '@/lib/auth/oauth';
import { authConfig } from '@/lib/auth/server';
import { SESSION_SECONDS, newSession, signToken, verifyToken } from '@/lib/auth/session';

const fail = (base: string, secure: boolean, error: string): NextResponse => {
  const res = NextResponse.redirect(new URL(`/login?error=${error}`, base));
  res.cookies.delete(oauthCookieName(secure));
  res.headers.set('cache-control', 'no-store');
  return res;
};

/** GitHub sends the browser back here. Check the state, finish the login, then set the session cookie. */
export async function GET(req: Request): Promise<Response> {
  const cfg = authConfig();
  if (cfg.mode !== 'github') return NextResponse.redirect(new URL('/login', req.url));
  const url = new URL(req.url);
  if (url.searchParams.get('error')) return fail(cfg.publicUrl, cfg.secureCookies, 'denied');

  const cookie = /(?:^|;\s*)([^=;\s]+)=([^;]*)/g;
  let raw: string | undefined;
  for (const m of (req.headers.get('cookie') ?? '').matchAll(cookie)) if (m[1] === oauthCookieName(cfg.secureCookies)) raw = m[2];
  const attempt = await verifyToken(raw, cfg.sessionSecret);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!attempt || typeof attempt.state !== 'string' || typeof attempt.verifier !== 'string' || !code || !state || state !== attempt.state) {
    return fail(cfg.publicUrl, cfg.secureCookies, 'state');
  }
  try {
    const { login, role } = await completeLogin(cfg, code, attempt.verifier);
    const res = NextResponse.redirect(new URL('/', cfg.publicUrl));
    res.cookies.delete(oauthCookieName(cfg.secureCookies));
    res.cookies.set(sessionCookieName(cfg.secureCookies), await signToken(newSession(login, role), cfg.sessionSecret), {
      httpOnly: true,
      secure: cfg.secureCookies,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_SECONDS,
    });
    res.headers.set('cache-control', 'no-store');
    return res;
  } catch (e) {
    return fail(cfg.publicUrl, cfg.secureCookies, e instanceof LoginError ? e.reason : 'failed');
  }
}
