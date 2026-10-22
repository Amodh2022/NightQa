import { audit } from '@/lib/audit';
import { accountSecretNames } from '@/lib/accounts';
import { handleError, ok, readBody, requireMember } from '@/lib/api-guard';
import { accountBody, accountDeleteBody } from '@/lib/settings-api';
import { deleteSecret, setSecret } from '@/lib/vault';

/** Saves a test account. Username and password go straight into the encrypted vault; nothing is echoed back. */
export async function POST(req: Request): Promise<Response> {
  const who = await requireMember(req);
  if ('response' in who) return who.response;
  const body = await readBody(req, accountBody);
  if ('response' in body) return body.response;
  const { name, username, password } = body.data;
  try {
    await setSecret(`account:${name}:username`, username);
    await setSecret(`account:${name}:password`, password);
    await audit(who.viewer.login, 'account.save', `test account "${name}"`);
    return ok({ name });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request): Promise<Response> {
  const who = await requireMember(req);
  if ('response' in who) return who.response;
  const body = await readBody(req, accountDeleteBody);
  if ('response' in body) return body.response;
  try {
    for (const n of accountSecretNames(body.data.name)) await deleteSecret(n);
    await audit(who.viewer.login, 'account.remove', `test account "${body.data.name}"`);
    return ok();
  } catch (e) {
    return handleError(e);
  }
}
