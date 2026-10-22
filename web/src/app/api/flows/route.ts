import { z } from 'zod';
import { requireMember } from '@/lib/api-guard';
import { audit } from '@/lib/audit';
import { FlowStoreError, deleteFlow, saveFlow } from '@/lib/flow-store';

const short = (n: number) => z.string().max(n);
const draftSchema = z.object({
  name: short(200),
  start: short(500),
  login: short(100),
  tags: z.array(short(60)).max(30),
  steps: z.array(z.object({ text: short(1000), expect: short(1000) })).max(100),
  variations: z.array(short(1000)).max(50),
});

const saveBody = z.object({ draft: draftSchema, file: z.string().max(300).optional(), onConflict: z.enum(['fail', 'suffix']).optional() });
const deleteBody = z.object({ file: z.string().min(1).max(300) });

const STATUS = { invalid: 422, engine: 422, exists: 409, missing: 404, path: 400 } as const;

function failure(e: unknown): Response {
  if (e instanceof FlowStoreError) {
    return Response.json({ error: e.message, issues: e.issues.map((i) => ({ line: i.line, message: i.message })) }, { status: STATUS[e.kind] });
  }
  throw e;
}

/** Create or replace a flow file in flows/. The same path serves the editor and the Excel import. */
export async function POST(req: Request): Promise<Response> {
  const who = await requireMember(req);
  if ('response' in who) return who.response;
  const body = saveBody.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: 'Send { draft } as JSON.' }, { status: 400 });
  try {
    const r = await saveFlow(body.data.draft, { ...(body.data.file ? { file: body.data.file } : {}), ...(body.data.onConflict ? { onConflict: body.data.onConflict } : {}) });
    await audit(who.viewer.login, body.data.file ? 'flow.update' : 'flow.create', r.file);
    return Response.json({ file: r.file, warnings: r.warnings }, { status: body.data.file ? 200 : 201 });
  } catch (e) {
    return failure(e);
  }
}

export async function DELETE(req: Request): Promise<Response> {
  const who = await requireMember(req);
  if ('response' in who) return who.response;
  const body = deleteBody.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: 'Send { file } as JSON.' }, { status: 400 });
  try {
    await deleteFlow(body.data.file);
    await audit(who.viewer.login, 'flow.delete', body.data.file);
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
