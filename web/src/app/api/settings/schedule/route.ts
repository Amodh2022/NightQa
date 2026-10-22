import { audit } from '@/lib/audit';
import { handleError, ok, readBody, requireMember } from '@/lib/api-guard';
import { saveSettings } from '@/lib/settings';
import { scheduleBody } from '@/lib/settings-api';

export async function POST(req: Request): Promise<Response> {
  const who = await requireMember(req);
  if ('response' in who) return who.response;
  const body = await readBody(req, scheduleBody);
  if ('response' in body) return body.response;
  const { schedule, budgets, maxFixPerNight, explorationMaxSteps } = body.data;
  try {
    await saveSettings({ schedule, budgets, github: { maxFixPerNight }, exploration: { maxSteps: explorationMaxSteps } });
    await audit(
      who.viewer.login,
      'settings.schedule.update',
      `nightly ${schedule.nightlyEnabled ? `on at ${schedule.nightlyTime}` : 'off'}, report ${schedule.morningReportTime}, budgets ${String(budgets.maxSteps)} steps / ${String(budgets.maxSeconds)}s / $${String(budgets.maxCostUsd)}, ${String(maxFixPerNight)} fix PRs, exploration ${String(explorationMaxSteps)} steps`,
    );
    return ok();
  } catch (e) {
    return handleError(e);
  }
}
