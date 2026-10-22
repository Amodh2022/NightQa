import { NextResponse } from 'next/server';
import { oauthCookieName, sessionCookieName } from '@/lib/auth/config';
import { audit } from '@/lib/audit';
import { authConfig, currentViewer } from '@/lib/auth/server';

/** Signs out: clears the session cookie. Same-origin POSTs only, so another site cannot sign you out. */
export async function POST(req: Request): Promise<Response> {
  const cfg = authConfig();
  const origin = req.headers.get('origin');
  if (origin && new URL(origin).host !== req.headers.get('host')) return NextResponse.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });
  const viewer = await currentViewer();
  await audit(viewer?.login ?? 'anonymous', 'auth.logout').catch(() => undefined);
  const secure = cfg.mode === 'github' && cfg.secureCookies;
  const res = NextResponse.redirect(new URL('/login', cfg.mode === 'github' ? cfg.publicUrl : req.url), 303);
  res.cookies.delete(sessionCookieName(secure));
  res.cookies.delete(oauthCookieName(secure));
  res.headers.set('cache-control', 'no-store');
  return res;
}
