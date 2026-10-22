import { NextResponse, type NextRequest } from 'next/server';
import { routeAccess } from '@/lib/auth/access';
import { loadAuthConfig, sessionCookieName } from '@/lib/auth/config';
import { readSession } from '@/lib/auth/session';

/** Runs before every request: nothing but the login page, the sign-in routes and static assets is served without a session. */
export async function proxy(req: NextRequest): Promise<NextResponse> {
  const config = loadAuthConfig(process.env);
  const session = config.mode === 'github' ? await readSession(req.cookies.get(sessionCookieName(config.secureCookies))?.value, config.sessionSecret) : undefined;
  const d = routeAccess({ pathname: req.nextUrl.pathname, method: req.method, session, config });
  if (d.kind === 'allow') return NextResponse.next();
  if (d.kind === 'redirect') return NextResponse.redirect(new URL(d.to, config.mode === 'github' ? config.publicUrl : req.url));
  return NextResponse.json({ error: d.message }, { status: d.status, headers: { 'cache-control': 'no-store' } });
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
