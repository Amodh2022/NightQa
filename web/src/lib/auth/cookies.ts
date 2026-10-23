import type { AuthSettings } from './config';

/** One cookie's value from a Cookie header, or undefined. */
export function cookieValue(header: string | null, name: string): string | undefined {
  let found: string | undefined;
  for (const m of (header ?? '').matchAll(/(?:^|;\s*)([^=;\s]+)=([^;]*)/g)) if (m[1] === name) found = m[2];
  return found;
}

/** The flags every NightQA cookie gets: not readable by scripts, same-site, HTTPS-only when the dashboard is on HTTPS. */
export const cookieFlags = (cfg: AuthSettings, maxAge: number) => ({ httpOnly: true, secure: cfg.secureCookies, sameSite: 'lax' as const, path: '/', maxAge });
