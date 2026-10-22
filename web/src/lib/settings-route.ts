import { z } from 'zod';
import { audit } from './audit';
import { currentViewer } from './auth/server';
import { getSettings, saveSettings, type Settings } from './settings';

/** Same-origin only: a page on another site must not be able to change settings from the user's browser. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // non-browser clients (curl) have no Origin
  try {
    return new URL(origin).host === req.headers.get('host');
  } catch {
    return false;
  }
}

export type SettingsPatch = Parameters<typeof saveSettings>[0];

export interface SettingsRoute<B> {
  /** Validates the request body. Unknown keys are rejected. */
  readonly schema: z.ZodType<B>;
  /** Turns a valid body into a settings patch. */
  readonly toPatch: (body: B) => SettingsPatch;
  /** One short, secret-free line for the activity log. */
  readonly describe: (body: B, before: Settings) => string;
  /** Activity log action name. */
  readonly action: string;
}

/** Shared handler: same-origin, members only, zod-validated, saved through saveSettings, written to the audit log. */
export async function handleSettingsPost<B>(req: Request, route: SettingsRoute<B>): Promise<Response> {
  if (!sameOrigin(req)) return Response.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });
  const viewer = await currentViewer();
  if (!viewer) return Response.json({ error: 'Sign in first.' }, { status: 401 });
  if (viewer.role !== 'member') return Response.json({ error: 'Your account is view-only.' }, { status: 403 });
  const parsed = route.schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 });
  const before = await getSettings();
  try {
    const saved = await saveSettings(route.toPatch(parsed.data));
    await audit(viewer.login, route.action, route.describe(parsed.data, before)).catch(() => undefined);
    return Response.json({ ok: true, settings: saved });
  } catch (e) {
    if (e instanceof z.ZodError) return Response.json({ error: e.issues[0]?.message ?? 'Invalid settings.' }, { status: 400 });
    throw e;
  }
}
