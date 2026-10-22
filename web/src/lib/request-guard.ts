import { currentViewer, type Viewer } from './auth/server';

/** Same-origin only: a page on another site must not be able to change settings from the user's browser. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // non-browser clients (curl) have no Origin
  try {
    return new URL(origin).host === req.headers.get('host');
  } catch {
    return false;
  }
}

/** Returns the signed-in member, or the error response to send. Checks again here even though the proxy already does. */
export async function requireMember(req: Request): Promise<Viewer | Response> {
  if (!sameOrigin(req)) return Response.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });
  const viewer = await currentViewer();
  if (!viewer) return Response.json({ error: 'Sign in first.' }, { status: 401 });
  if (viewer.role !== 'member') return Response.json({ error: 'Your account is view-only.' }, { status: 403 });
  return viewer;
}
