import { NextResponse } from 'next/server';
import { sameOrigin } from '@/lib/api-guard';
import { audit } from '@/lib/audit';
import { sessionCookieName } from '@/lib/auth/config';
import { cookieFlags } from '@/lib/auth/cookies';
import { clientKey, failureLimiter, startLimiter } from '@/lib/auth/rate-limit';
import { authConfig } from '@/lib/auth/server';
import { SESSION_SECONDS, newSession, signToken } from '@/lib/auth/session';
import { ensureBootstrapUser, signInWithPassword } from '@/lib/auth/users';
import { PgUserStore } from '@/lib/auth/users-pg';
import { db } from '@/lib/db';

const back = (base: string, error: string): NextResponse => {
  const res = NextResponse.redirect(new URL(`/login?error=${error}`, base), 303);
  res.headers.set('cache-control', 'no-store');
  return res;
};

/** Email + password sign-in from the login form. Every failure lands back on the login page with a fixed message. */
export async function POST(req: Request): Promise<Response> {
  const cfg = authConfig();
  if (cfg.mode !== 'on' || !cfg.password) return NextResponse.redirect(new URL('/login', req.url), 303);
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });
  const who = clientKey(req.headers);
  if (!startLimiter.allowed(who) || !failureLimiter.allowed(who)) {
    return NextResponse.json({ error: 'Too many sign-in attempts. Try again in a few minutes.' }, { status: 429, headers: { 'retry-after': String(Math.max(startLimiter.retryAfterSeconds(who), failureLimiter.retryAfterSeconds(who))), 'cache-control': 'no-store' } });
  }
  startLimiter.record(who);
  const pool = db();
  if (!pool) return back(cfg.publicUrl, 'failed');
  const form = await req.formData().catch(() => null);
  const email = form?.get('email');
  const password = form?.get('password');
  if (typeof email !== 'string' || typeof password !== 'string') return back(cfg.publicUrl, 'credentials');
  try {
    const store = new PgUserStore(pool);
    await ensureBootstrapUser(store, process.env);
    const result = await signInWithPassword(store, email, password);
    if (!result.ok) {
      failureLimiter.record(who);
      void audit('anonymous', 'auth.denied', `password:${result.reason}`).catch(() => undefined);
      return back(cfg.publicUrl, result.reason);
    }
    await audit(result.login, 'auth.login', `${result.role} via password`).catch(() => undefined);
    const res = NextResponse.redirect(new URL('/', cfg.publicUrl), 303);
    res.cookies.set(sessionCookieName(cfg.secureCookies), await signToken(newSession(result.login, result.role, undefined, 'password'), cfg.sessionSecret), cookieFlags(cfg, SESSION_SECONDS));
    res.headers.set('cache-control', 'no-store');
    return res;
  } catch {
    return back(cfg.publicUrl, 'failed'); // database trouble: fail closed, say nothing about why
  }
}
