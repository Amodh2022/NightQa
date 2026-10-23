import { z } from 'zod';
import { fail, handleError, ok, readBody, requireMember } from '@/lib/api-guard';
import { audit } from '@/lib/audit';
import { authConfig } from '@/lib/auth/server';
import { createUser } from '@/lib/auth/users';
import { PgUserStore } from '@/lib/auth/users-pg';
import { db } from '@/lib/db';

const body = z.object({ email: z.string().min(1).max(254), password: z.string().min(1).max(200), role: z.enum(['member', 'viewer']) });

/** A member adds an email + password account. The password is hashed here and never stored or logged in clear. */
export async function POST(req: Request): Promise<Response> {
  const guard = await requireMember(req);
  if ('response' in guard) return guard.response;
  const cfg = authConfig();
  const pool = db();
  if (cfg.mode !== 'on' || !cfg.password || !pool) return fail('Email + password sign-in is not turned on.', 409);
  const parsed = await readBody(req, body);
  if ('response' in parsed) return parsed.response;
  try {
    const r = await createUser(new PgUserStore(pool), parsed.data.email, parsed.data.password, parsed.data.role);
    if (!r.ok) return fail(r.error, 422);
    await audit(guard.viewer.login, 'user.create', `${parsed.data.email.trim().toLowerCase()} (${parsed.data.role})`).catch(() => undefined);
    return ok();
  } catch (e) {
    return handleError(e);
  }
}
