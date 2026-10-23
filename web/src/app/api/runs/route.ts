import { connection } from 'next/server';
import { LaunchError, startRun } from '@/lib/launcher';
import { requireMember } from '@/lib/request-guard';
import { listRuns } from '@/lib/results';
import { runRequest } from '@/lib/run-request';

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

export async function POST(req: Request): Promise<Response> {
  // Defense in depth: the proxy already blocks viewers and anonymous requests; check again where the work starts.
  const member = await requireMember(req);
  if (member instanceof Response) return member;
  const parsed = runRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send { flowFile, mode } or { mode: 'explore', persona } as JSON." }, { status: 400 });
  try {
    const { id } = await startRun({ flowFile: '', ...parsed.data, startedBy: member.login });
    return Response.json({ id }, { status: 202 });
  } catch (e) {
    if (e instanceof LaunchError) return Response.json({ error: e.message }, { status: 422 });
    console.error('[nightqa] could not start run', e);
    return Response.json({ error: 'Could not start the run. Check that the results folder is writable, then see the server log.' }, { status: 500 });
  }
}
