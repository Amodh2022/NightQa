import { audit } from '@/lib/audit';
import { fail, handleError, ok, readBody, requireMember } from '@/lib/api-guard';
import { saveSettings } from '@/lib/settings';
import { appBody } from '@/lib/settings-api';
import { checkStagingUrl } from '@/lib/staging-check';

export async function POST(req: Request): Promise<Response> {
  const who = await requireMember(req);
  if ('response' in who) return who.response;
  const body = await readBody(req, appBody);
  if ('response' in body) return body.response;
  const { name, targetUrl, confirmProduction } = body.data;
  const check = checkStagingUrl(targetUrl);
  if (check.status === 'blocked') return fail(check.message, 422);
  if (check.status === 'production' && confirmProduction !== true) return fail(`${check.message} Tick the confirmation to save it anyway.`, 422);
  try {
    const url = targetUrl.trim();
    await saveSettings({ app: { name, targetUrl: url } });
    await audit(who.viewer.login, 'settings.app.update', `app "${name}", staging URL ${url || 'cleared'}`);
    return ok({ check: checkStagingUrl(url) });
  } catch (e) {
    return handleError(e);
  }
}
