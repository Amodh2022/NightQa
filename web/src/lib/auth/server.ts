import { cookies } from 'next/headers';
import { loadAuthConfig, sessionCookieName, type AuthConfig } from './config';
import { readSession, type Session } from './session';

export const authConfig = (): AuthConfig => loadAuthConfig(process.env);

export interface Viewer {
  readonly login: string;
  readonly role: 'member' | 'viewer';
  /** False when sign-in is switched off (local development). */
  readonly signedIn: boolean;
}

/**
 * The person making this request, from their session cookie. With sign-in switched off everyone is a local member.
 * Returns undefined when nobody valid is signed in. Call it only at request time (Server Components, handlers).
 */
export async function currentViewer(): Promise<Viewer | undefined> {
  const cfg = authConfig();
  if (cfg.mode === 'off') return { login: 'local', role: 'member', signedIn: false };
  if (cfg.mode !== 'github') return undefined;
  const session: Session | undefined = await readSession((await cookies()).get(sessionCookieName(cfg.secureCookies))?.value, cfg.sessionSecret);
  return session ? { login: session.login, role: session.role, signedIn: true } : undefined;
}
