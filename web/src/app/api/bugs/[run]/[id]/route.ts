import { connection } from 'next/server';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { setCloseReason } from '@/lib/bug-files';
import { closeReasonSchema } from '@/lib/bug-view';
import { getBug } from '@/lib/bugs';
import { requireMember } from '@/lib/request-guard';

const body = z.object({ closeReason: closeReasonSchema });

export async function GET(_req: Request, ctx: RouteContext<'/api/bugs/[run]/[id]'>): Promise<Response> {
  await connection();
  const { run, id } = await ctx.params;
  const bug = await getBug(run, id);
  if (!bug) return Response.json({ error: 'No such bug.' }, { status: 404 });
  return Response.json({ id: bug.id, runId: bug.runId, closeReason: bug.closeReason ?? null });
}

/** Records why a member closed a bug (wrong fix / not a bug / won't fix). It never talks to GitHub. */
export async function POST(req: Request, ctx: RouteContext<'/api/bugs/[run]/[id]'>): Promise<Response> {
  const member = await requireMember(req);
  if (member instanceof Response) return member;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Send { closeReason } as JSON: wrong_fix, not_a_bug or wont_fix.' }, { status: 400 });
  const { run, id } = await ctx.params;
  const result = await setCloseReason(run, id, parsed.data.closeReason);
  if (!result.ok) return Response.json({ error: 'No such bug.' }, { status: 404 });
  await audit(member.login, 'bug.close_reason', `${id} in run ${run}: ${parsed.data.closeReason}`);
  return Response.json({ id, closeReason: result.bug.closeReason });
}
