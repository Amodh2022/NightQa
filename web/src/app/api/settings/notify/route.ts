import { audit } from '@/lib/audit';
import { fail, handleError, ok, readBody, requireMember } from '@/lib/api-guard';
import { saveSettings } from '@/lib/settings';
import { notifyDeleteBody, notifySetBody, notifyValueError, type NotifySecret } from '@/lib/settings-api';
import { deleteSecret, listSecretNames, setSecret } from '@/lib/vault';

/** Keeps settings.notifications.*.enabled in step with which secrets are really stored. */
async function syncEnabled(): Promise<void> {
  const names = new Set(await listSecretNames());
  await saveSettings({
    notifications: {
      slack: { enabled: names.has('notify:slack-webhook') },
      webhook: { enabled: names.has('notify:webhook-url') },
      email: { enabled: names.has('notify:smtp-url') && names.has('notify:smtp-from') },
    },
  });
}

export async function POST(req: Request): Promise<Response> {
  const who = await requireMember(req);
  if ('response' in who) return who.response;
  const body = await readBody(req, notifySetBody);
  if ('response' in body) return body.response;
  const { name, value } = body.data;
  const problem = notifyValueError(name satisfies NotifySecret, value);
  if (problem) return fail(problem, 422);
  try {
    await setSecret(name, value);
    await syncEnabled();
    await audit(who.viewer.login, 'notify.save', `${name} saved`);
    return ok();
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request): Promise<Response> {
  const who = await requireMember(req);
  if ('response' in who) return who.response;
  const body = await readBody(req, notifyDeleteBody);
  if ('response' in body) return body.response;
  try {
    await deleteSecret(body.data.name);
    await syncEnabled();
    await audit(who.viewer.login, 'notify.remove', `${body.data.name} removed`);
    return ok();
  } catch (e) {
    return handleError(e);
  }
}
