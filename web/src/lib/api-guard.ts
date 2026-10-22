import { z } from 'zod';
import { currentViewer, type Viewer } from './auth/server';
import { VaultError } from './vault';

/** Turns a thrown error into a safe response. Only known error types show their message; nothing else leaks. */
export function handleError(e: unknown): Response {
  if (e instanceof VaultError) return fail(e.message, 422);
  if (e instanceof z.ZodError) return fail(e.issues[0]?.message ?? 'Invalid value.', 422);
  return fail('Could not save. Check the server log.', 500);
}

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

export const fail = (error: string, status: number): Response => Response.json({ error }, { status, headers: { 'cache-control': 'no-store' } });
export const ok = (body: Record<string, unknown> = {}): Response => Response.json({ ok: true, ...body }, { headers: { 'cache-control': 'no-store' } });

/** Origin check, then sign-in, then member role. Returns the member, or the response to send back. */
export async function requireMember(req: Request, getViewer: () => Promise<Viewer | undefined> = currentViewer): Promise<{ viewer: Viewer } | { response: Response }> {
  if (!sameOrigin(req)) return { response: fail('Cross-origin requests are not allowed.', 403) };
  const viewer = await getViewer();
  if (!viewer) return { response: fail('Sign in first.', 401) };
  if (viewer.role !== 'member') return { response: fail('Your account is view-only.', 403) };
  return { viewer };
}

/** Parses a JSON body. The error text never includes the submitted values (they may be secrets). */
export async function readBody<S extends z.ZodType>(req: Request, schema: S): Promise<{ data: z.infer<S> } | { response: Response }> {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (parsed.success) return { data: parsed.data };
  const first = parsed.error.issues[0];
  const where = first?.path.length ? `${first.path.join('.')}: ` : '';
  return { response: fail(`${where}${first?.message ?? 'Invalid request.'}`, 400) };
}
