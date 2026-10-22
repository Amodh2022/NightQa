import { connection } from 'next/server';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { currentViewer } from '@/lib/auth/server';
import { setCloseReason } from '@/lib/bug-files';
import { closeReasonSchema } from '@/lib/bug-view';
import { getBug } from '@/lib/bugs';

const body = z.object({ closeReason: closeReasonSchema });

/** Same-origin only: a page on another site must not be able to change bugs from the user's browser. */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // non-browser clients (curl) have no Origin
  try {
    return new URL(origin).host === req.headers.get('host');
  } catch {
    return false;
  }
}

export async function GET(_req: Request, ctx: RouteContext<'/api/bugs/[run]/[id]'>): Promise<Response> {
  await connection();
  const { run, id } = await ctx.params;
  const bug = await getBug(run, id);
  if (!bug) return Response.json({ error: 'No such bug.' }, { status: 404 });
  return Response.json({ id: bug.id, runId: bug.runId, closeReason: bug.closeReason ?? null });
}

/** Records why a member closed a bug (wrong fix / not a bug / won't fix). It never talks to GitHub. */
export async function POST(req: Request, ctx: RouteContext<'/api/bugs/[run]/[id]'>): Promise<Response> {
  if (!sameOrigin(req)) return Response.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });
  const viewer = await currentViewer();
  if (!viewer) return Response.json({ error: 'Sign in first.' }, { status: 401 });
  if (viewer.role !== 'member') return Response.json({ error: 'Your account is view-only.' }, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Send { closeReason } as JSON: wrong_fix, not_a_bug or wont_fix.' }, { status: 400 });
  const { run, id } = await ctx.params;
  const result = await setCloseReason(run, id, parsed.data.closeReason);
  if (!result.ok) return Response.json({ error: 'No such bug.' }, { status: 404 });
  await audit(viewer.login, 'bug.close_reason', `${id} in run ${run}: ${parsed.data.closeReason}`);
  return Response.json({ id, closeReason: result.bug.closeReason });
}
