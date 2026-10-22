import { z } from 'zod';
import { audit } from '@/lib/audit';
import { deliver } from '@/lib/notify/dispatch';
import { requireMember } from '@/lib/request-guard';
import { testReport } from '@/lib/report';
import { getSettings } from '@/lib/settings';

const body = z.object({ channel: z.enum(['email', 'slack', 'webhook']) }).strict();

const lastSent = new Map<string, number>();
const COOLDOWN_MS = 5000;

/** Sends one clearly labelled test message to one channel, even if it is switched off. */
export async function POST(req: Request): Promise<Response> {
  const viewer = await requireMember(req);
  if (viewer instanceof Response) return viewer;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Send { channel } as JSON: email, slack or webhook.' }, { status: 400 });
  const { channel } = parsed.data;
  const now = Date.now();
  if (now - (lastSent.get(channel) ?? 0) < COOLDOWN_MS) return Response.json({ error: 'Wait a few seconds before sending another test.' }, { status: 429 });
  lastSent.set(channel, now);
  const settings = await getSettings();
  const [result] = await deliver(testReport(channel, settings.app.name, new Date(), settings.schedule.timezone), { kind: 'test', only: channel }, { settings });
  await audit(viewer.login, 'notifications.test', `${channel}: ${result?.ok ? 'sent' : 'failed'}`).catch(() => undefined);
  return Response.json({ channel, ok: result?.ok ?? false, reason: result?.reason ?? 'Could not send.' });
}
