import { audit } from '@/lib/audit';
import { handleError, ok, readBody, requireMember } from '@/lib/api-guard';
import { saveRetentionDays } from '@/lib/retention';
import { retentionBody } from '@/lib/settings-api';

export async function POST(req: Request): Promise<Response> {
  const who = await requireMember(req);
  if ('response' in who) return who.response;
  const body = await readBody(req, retentionBody);
  if ('response' in body) return body.response;
  try {
    await saveRetentionDays(body.data.days);
    await audit(who.viewer.login, 'retention.update', `${String(body.data.days)} days`);
    return ok();
  } catch (e) {
    return handleError(e);
  }
}
