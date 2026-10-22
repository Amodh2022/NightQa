import { audit } from '@/lib/audit';
import { handleError, ok, readBody, requireMember } from '@/lib/api-guard';
import { clearGithubCheck } from '@/lib/connection-checks';
import { saveSettings } from '@/lib/settings';
import { githubBody } from '@/lib/settings-api';
import { deleteSecret, setSecret } from '@/lib/vault';

/** Saves the repository (settings) and, when given, the token (vault only). The token is never echoed back. */
export async function POST(req: Request): Promise<Response> {
  const who = await requireMember(req);
  if ('response' in who) return who.response;
  const body = await readBody(req, githubBody);
  if ('response' in body) return body.response;
  const { repo, token } = body.data;
  try {
    if (token) await setSecret('github:token', token);
    await saveSettings({ github: { repo } });
    await clearGithubCheck(); // a new repo or token has not been tested yet
    await audit(who.viewer.login, 'github.save', `repo ${repo}${token ? ', token replaced' : ''}`);
    return ok({ tokenSaved: Boolean(token) });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request): Promise<Response> {
  const who = await requireMember(req);
  if ('response' in who) return who.response;
  try {
    await deleteSecret('github:token');
    await clearGithubCheck();
    await audit(who.viewer.login, 'github.disconnect', 'token removed');
    return ok();
  } catch (e) {
    return handleError(e);
  }
}
