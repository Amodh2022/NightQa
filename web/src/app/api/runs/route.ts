import { connection } from 'next/server';
import { z } from 'zod';
import { currentViewer } from '@/lib/auth/server';
import { LaunchError, startRun } from '@/lib/launcher';
import { listRuns } from '@/lib/results';

export async function GET(): Promise<Response> {
  await connection();
  const runs = await listRuns();
  return Response.json(
    runs.map((r) => ({
      id: r.id,
      status: r.status,
      mode: r.mode,
      flow: r.flow,
      verdict: r.result?.verdict ?? null,
      startedAt: r.startedAt.toISOString(),
    })),
  );
}

const body = z.object({ flowFile: z.string().min(1).max(300), mode: z.enum(['run', 'replay']) });

/** Same-origin only: a page on another site must not be able to start runs from the user's browser. */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // non-browser clients (curl) have no Origin
  try {
    return new URL(origin).host === req.headers.get('host');
  } catch {
    return false;
  }
}

export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return Response.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });
  // Defense in depth: the proxy already blocks viewers and anonymous requests; check again where the work starts.
  const viewer = await currentViewer();
  if (!viewer) return Response.json({ error: 'Sign in first.' }, { status: 401 });
  if (viewer.role !== 'member') return Response.json({ error: 'Your account is view-only.' }, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Send { flowFile, mode } as JSON.' }, { status: 400 });
  try {
    const { id } = await startRun({ ...parsed.data, startedBy: viewer.login });
    return Response.json({ id }, { status: 202 });
  } catch (e) {
    if (e instanceof LaunchError) return Response.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
