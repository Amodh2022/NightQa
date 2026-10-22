import { audit } from '@/lib/audit';
import { fail, handleError, ok, readBody, requireMember } from '@/lib/api-guard';
import { saveSettings } from '@/lib/settings';
import { recipientsBody } from '@/lib/settings-api';

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export async function POST(req: Request): Promise<Response> {
  const who = await requireMember(req);
  if ('response' in who) return who.response;
  const body = await readBody(req, recipientsBody);
  if ('response' in body) return body.response;
  if (!body.data.to.every((a) => EMAIL.test(a))) return fail('Every recipient must be an email address.', 422);
  try {
    await saveSettings({ notifications: { email: { to: body.data.to } } });
    await audit(who.viewer.login, 'notify.recipients', `${String(body.data.to.length)} recipient(s)`);
    return ok();
  } catch (e) {
    return handleError(e);
  }
}
