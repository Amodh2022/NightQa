import { requireMember } from '@/lib/api-guard';
import { audit } from '@/lib/audit';
import { IMPORT_LIMITS, ImportError, suggestMapping } from '@/lib/flow-import';
import { parseUpload } from '@/lib/flow-upload';

/** Reads an uploaded .csv or .xlsx into a table and a suggested column mapping. Nothing is saved or run here. */
export async function POST(req: Request): Promise<Response> {
  const who = await requireMember(req);
  if ('response' in who) return who.response;
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > IMPORT_LIMITS.maxBytes + 64 * 1024) return Response.json({ error: `The file is larger than ${String(IMPORT_LIMITS.maxBytes / 1024 / 1024)} MB.` }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return Response.json({ error: 'Choose a .csv or .xlsx file.' }, { status: 400 });
  if (file.size > IMPORT_LIMITS.maxBytes) return Response.json({ error: `The file is larger than ${String(IMPORT_LIMITS.maxBytes / 1024 / 1024)} MB.` }, { status: 413 });
  try {
    const table = parseUpload(file.name, Buffer.from(await file.arrayBuffer()));
    await audit(who.viewer.login, 'flow.import.read', `${file.name.slice(0, 80)}: ${String(table.rows.length)} rows`);
    return Response.json({ fileName: file.name.slice(0, 200), table, mapping: suggestMapping(table.headers) });
  } catch (e) {
    if (e instanceof ImportError) return Response.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
