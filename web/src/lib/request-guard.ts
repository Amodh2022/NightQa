import { sameOrigin } from './api-guard';
import { currentViewer, type Viewer } from './auth/server';

/** Returns the signed-in member, or the error response to send. Checks again here even though the proxy already does. */
export async function requireMember(req: Request): Promise<Viewer | Response> {
  if (!sameOrigin(req)) return Response.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });
  const viewer = await currentViewer();
  if (!viewer) return Response.json({ error: 'Sign in first.' }, { status: 401 });
  if (viewer.role !== 'member') return Response.json({ error: 'Your account is view-only.' }, { status: 403 });
  return viewer;
}
