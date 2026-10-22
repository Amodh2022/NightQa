import { audit } from '@/lib/audit';
import { handleError, ok, readBody, requireMember } from '@/lib/api-guard';
import { deleteExpiredEvidence, getRetention } from '@/lib/retention';
import { evidenceDeleteBody } from '@/lib/settings-api';

/** Deletes results/<run> folders older than the saved retention. Needs the typed word DELETE. Member only, audited. */
export async function POST(req: Request): Promise<Response> {
  const who = await requireMember(req);
  if ('response' in who) return who.response;
  const body = await readBody(req, evidenceDeleteBody);
  if ('response' in body) return body.response;
  try {
    const { days } = await getRetention();
    const removed = await deleteExpiredEvidence(days);
    await audit(who.viewer.login, 'evidence.delete', `${String(removed.length)} run folder(s) older than ${String(days)} days`);
    return ok({ deleted: removed.length, days, message: `Deleted ${String(removed.length)} run folder(s) older than ${String(days)} days.` });
  } catch (e) {
    return handleError(e);
  }
}
