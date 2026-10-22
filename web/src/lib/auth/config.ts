import { z } from 'zod';

export type Role = 'member' | 'viewer';

export interface GithubAuthConfig {
  readonly mode: 'github';
  readonly clientId: string;
  readonly clientSecret: string;
  readonly sessionSecret: string;
  /** The URL people use to open the dashboard. The GitHub callback is <publicUrl>/api/auth/callback. */
  readonly publicUrl: string;
  /** GitHub logins that can run things. */
  readonly users: ReadonlySet<string>;
  /** GitHub logins that can look but not start runs. */
  readonly viewers: ReadonlySet<string>;
  /** Members of this GitHub organization can run things. */
  readonly org?: string;
  readonly githubUrl: string;
  readonly apiUrl: string;
  readonly secureCookies: boolean;
}

export type AuthConfig =
  | { readonly mode: 'off' }
  | { readonly mode: 'unconfigured'; readonly problems: readonly string[] }
  | GithubAuthConfig;

const list = (v: string | undefined): Set<string> =>
  new Set((v ?? '').split(',').map((s) => s.trim().toLowerCase().replace(/^@/, '')).filter(Boolean));

const needed = (message: string) => ({ error: () => message });

const schema = z.object({
  NIGHTQA_GITHUB_CLIENT_ID: z.string(needed('NIGHTQA_GITHUB_CLIENT_ID is required (from your GitHub OAuth app)')).min(1, 'NIGHTQA_GITHUB_CLIENT_ID is required (from your GitHub OAuth app)'),
  NIGHTQA_GITHUB_CLIENT_SECRET: z.string(needed('NIGHTQA_GITHUB_CLIENT_SECRET is required (from your GitHub OAuth app)')).min(1, 'NIGHTQA_GITHUB_CLIENT_SECRET is required (from your GitHub OAuth app)'),
  NIGHTQA_SESSION_SECRET: z.string(needed('NIGHTQA_SESSION_SECRET is required: at least 32 characters (try: openssl rand -base64 48)')).min(32, 'NIGHTQA_SESSION_SECRET must be at least 32 characters (try: openssl rand -base64 48)'),
  NIGHTQA_PUBLIC_URL: z.url(needed('NIGHTQA_PUBLIC_URL must be the address you open the dashboard at, such as http://localhost:3300')),
  NIGHTQA_GITHUB_URL: z.url().default('https://github.com'),
  NIGHTQA_GITHUB_API_URL: z.url().default('https://api.github.com'),
});

/**
 * Reads the sign-in settings. Fails closed: unless GitHub sign-in is fully configured, or sign-in is switched off
 * explicitly with NIGHTQA_AUTH=off (local development only), the dashboard refuses to serve anything.
 */
export function loadAuthConfig(env: Readonly<Record<string, string | undefined>>): AuthConfig {
  if (env.NIGHTQA_AUTH === 'off') return { mode: 'off' };
  const r = schema.safeParse(env);
  const users = list(env.NIGHTQA_AUTH_USERS);
  const viewers = list(env.NIGHTQA_AUTH_VIEWERS);
  const org = env.NIGHTQA_AUTH_ORG?.trim() || undefined;
  const problems = r.success ? [] : r.error.issues.map((i) => i.message);
  if (users.size === 0 && viewers.size === 0 && !org) {
    problems.push('Say who may sign in: NIGHTQA_AUTH_USERS (GitHub logins, comma separated), NIGHTQA_AUTH_VIEWERS, or NIGHTQA_AUTH_ORG');
  }
  if (!r.success || problems.length > 0) return { mode: 'unconfigured', problems };
  const d = r.data;
  return {
    mode: 'github',
    clientId: d.NIGHTQA_GITHUB_CLIENT_ID,
    clientSecret: d.NIGHTQA_GITHUB_CLIENT_SECRET,
    sessionSecret: d.NIGHTQA_SESSION_SECRET,
    publicUrl: d.NIGHTQA_PUBLIC_URL.replace(/\/$/, ''),
    users,
    viewers,
    ...(org ? { org } : {}),
    githubUrl: d.NIGHTQA_GITHUB_URL.replace(/\/$/, ''),
    apiUrl: d.NIGHTQA_GITHUB_API_URL.replace(/\/$/, ''),
    secureCookies: d.NIGHTQA_PUBLIC_URL.startsWith('https://'),
  };
}

/** Over HTTPS the cookie gets the __Host- prefix, which stops other subdomains from planting it. */
export const sessionCookieName = (secure: boolean): string => (secure ? '__Host-nq_session' : 'nq_session');
export const oauthCookieName = (secure: boolean): string => (secure ? '__Host-nq_oauth' : 'nq_oauth');
