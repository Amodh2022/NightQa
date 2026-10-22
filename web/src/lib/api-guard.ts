import { currentViewer, type Viewer } from '@/lib/auth/server';

/** Same-origin only: a page on another site must not be able to change things from the user's browser. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // non-browser clients (curl) have no Origin
  try {
    return new URL(origin).host === req.headers.get('host');
  } catch {
    return false;
  }
}

/** Checks origin and sign-in for a request that changes things. Returns the member, or the error response to send. */
export async function requireMember(req: Request): Promise<Viewer | Response> {
  if (!sameOrigin(req)) return Response.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });
  // Defense in depth: the proxy already blocks viewers and anonymous requests; check again where the work happens.
  const viewer = await currentViewer();
  if (!viewer) return Response.json({ error: 'Sign in first.' }, { status: 401 });
  if (viewer.role !== 'member') return Response.json({ error: 'Your account is view-only.' }, { status: 403 });
  return viewer;
}
