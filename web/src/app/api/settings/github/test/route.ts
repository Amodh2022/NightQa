import { audit } from '@/lib/audit';
import { fail, handleError, ok, requireMember } from '@/lib/api-guard';
import { saveGithubCheck } from '@/lib/connection-checks';
import { testGithub } from '@/lib/github-check';
import { getSettings } from '@/lib/settings';
import { getSecret } from '@/lib/vault';

/** Calls GitHub from the server with the saved token and reports the real answer. The token stays on the server. */
export async function POST(req: Request): Promise<Response> {
  const who = await requireMember(req);
  if ('response' in who) return who.response;
  try {
    const { github } = await getSettings();
    if (!github.repo) return fail('Save the repository first.', 422);
    const token = await getSecret('github:token');
    if (!token) return fail('Save a token first.', 422);
    const result = await testGithub(github.repo, token, process.env.NIGHTQA_GITHUB_API_URL ?? 'https://api.github.com');
    await saveGithubCheck({ ok: result.ok, repo: github.repo, at: new Date().toISOString(), message: result.message });
    await audit(who.viewer.login, 'github.test', `${github.repo}: ${result.ok ? 'ok' : 'failed'}`);
    return ok({ connected: result.ok, message: result.message });
  } catch (e) {
    return handleError(e);
  }
}
