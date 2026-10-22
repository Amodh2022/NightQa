import { z } from 'zod';
import { audit } from '@/lib/audit';
import { requireMember } from '@/lib/request-guard';
import { isEmailAddress } from '@/lib/notify/senders';
import { saveSettings } from '@/lib/settings';

const body = z
  .object({
    email: z
      .object({
        enabled: z.boolean().optional(),
        to: z
          .array(z.string().trim().max(254))
          .max(20)
          .refine((l) => l.every(isEmailAddress), 'Every recipient must be a valid email address.')
          .optional(),
      })
      .strict()
      .optional(),
    slack: z.object({ enabled: z.boolean() }).strict().optional(),
    webhook: z.object({ enabled: z.boolean() }).strict().optional(),
    criticalImmediately: z.boolean().optional(),
    /** Lives under schedule in the settings file, but is toggled from the notification screens. */
    quietNight: z.enum(['all_clear', 'nothing']).optional(),
  })
  .strict();

export async function POST(req: Request): Promise<Response> {
  const viewer = await requireMember(req);
  if (viewer instanceof Response) return viewer;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'That is not a valid change.' }, { status: 400 });
  const { quietNight, ...notifications } = parsed.data;
  if (Object.keys(notifications).length === 0 && quietNight === undefined) return Response.json({ error: 'Nothing to change.' }, { status: 400 });
  const saved = await saveSettings({ ...(Object.keys(notifications).length > 0 ? { notifications } : {}), ...(quietNight ? { schedule: { quietNight } } : {}) });
  // names and on/off only: recipient addresses are not written to the activity log
  const changed = [
    ...Object.entries(notifications).map(([k, v]) => (typeof v === 'boolean' ? `${k}=${v ? 'on' : 'off'}` : v && 'enabled' in v && typeof v.enabled === 'boolean' ? `${k}=${v.enabled ? 'on' : 'off'}` : `${k} updated`)),
    ...(quietNight ? [`quietNight=${quietNight}`] : []),
  ];
  await audit(viewer.login, 'notifications.update', changed.join(', ')).catch(() => undefined);
  return Response.json({ notifications: saved.notifications, quietNight: saved.schedule.quietNight });
}
