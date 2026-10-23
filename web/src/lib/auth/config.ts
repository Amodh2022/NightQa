import { z } from 'zod';

export type Role = 'member' | 'viewer';
export type SignInMethod = 'github' | 'oidc' | 'password';

export interface GithubProvider {
  readonly clientId: string;
  readonly clientSecret: string;
  /** GitHub logins that can run things. */
  readonly users: ReadonlySet<string>;
  /** GitHub logins that can look but not start runs. */
  readonly viewers: ReadonlySet<string>;
  /** Members of this GitHub organization can run things. */
  readonly org?: string;
  readonly githubUrl: string;
  readonly apiUrl: string;
}

export interface OidcProvider {
  /** Text on the sign-in button, such as "Acme SSO". */
  readonly name: string;
  /** The issuer URL, without a trailing slash. Endpoints come from its discovery document. */
  readonly issuer: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly scopes: string;
  /** Which ID-token claim lists the person's groups. */
  readonly groupsClaim: string;
  /** Allow-list rules. A person matching any of them may sign in. */
  readonly emails: ReadonlySet<string>;
  readonly domains: ReadonlySet<string>;
  readonly memberGroups: ReadonlySet<string>;
  readonly viewerGroups: ReadonlySet<string>;
  /** Role for people allowed by email or domain (groups decide their own role). */
  readonly defaultRole: Role;
}

export interface PasswordProvider {
  readonly enabled: true;
}

/** Everything the sign-in routes share, whatever the method. */
export interface AuthSettings {
  readonly sessionSecret: string;
  /** The URL people use to open the dashboard. Callbacks live under <publicUrl>/api/auth/. */
  readonly publicUrl: string;
  readonly secureCookies: boolean;
  readonly github?: GithubProvider;
  readonly oidc?: OidcProvider;
  readonly password?: PasswordProvider;
}

export type AuthConfig =
  | { readonly mode: 'off' }
  | { readonly mode: 'unconfigured'; readonly problems: readonly string[] }
  | ({ readonly mode: 'on' } & AuthSettings);

export type EnabledAuth = Extract<AuthConfig, { mode: 'on' }>;

/** The sign-in methods that are fully configured, in the order the login page shows them. */
export const methodsOf = (cfg: AuthSettings): SignInMethod[] => [
  ...(cfg.oidc ? (['oidc'] as const) : []),
  ...(cfg.github ? (['github'] as const) : []),
  ...(cfg.password ? (['password'] as const) : []),
];

type Env = Readonly<Record<string, string | undefined>>;

const list = (v: string | undefined): Set<string> =>
  new Set(
    (v ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean),
  );
/** Group names are case-sensitive in most providers, so they are only trimmed. */
const names = (v: string | undefined): Set<string> =>
  new Set(
    (v ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

const trimSlash = (u: string): string => u.replace(/\/+$/, '');
const needed = (message: string) => ({ error: () => message });
const isLocalHost = (host: string): boolean => host === 'localhost' || host === '127.0.0.1' || host === '[::1]';

const baseSchema = z.object({
  NIGHTQA_SESSION_SECRET: z
    .string(needed('NIGHTQA_SESSION_SECRET is required: at least 32 characters (try: openssl rand -base64 48)'))
    .min(32, 'NIGHTQA_SESSION_SECRET must be at least 32 characters (try: openssl rand -base64 48)'),
  NIGHTQA_PUBLIC_URL: z.url(needed('NIGHTQA_PUBLIC_URL must be the address you open the dashboard at, such as http://localhost:3300')),
});

const githubSchema = z.object({
  NIGHTQA_GITHUB_CLIENT_ID: z.string(needed('NIGHTQA_GITHUB_CLIENT_ID is required (from your GitHub OAuth app)')).min(1, 'NIGHTQA_GITHUB_CLIENT_ID is required (from your GitHub OAuth app)'),
  NIGHTQA_GITHUB_CLIENT_SECRET: z.string(needed('NIGHTQA_GITHUB_CLIENT_SECRET is required (from your GitHub OAuth app)')).min(1, 'NIGHTQA_GITHUB_CLIENT_SECRET is required (from your GitHub OAuth app)'),
  NIGHTQA_GITHUB_URL: z.url().default('https://github.com'),
  NIGHTQA_GITHUB_API_URL: z.url().default('https://api.github.com'),
});

const oidcSchema = z.object({
  NIGHTQA_OIDC_ISSUER: z.url(needed('NIGHTQA_OIDC_ISSUER is required (your identity provider\'s issuer URL)')),
  NIGHTQA_OIDC_CLIENT_ID: z.string(needed('NIGHTQA_OIDC_CLIENT_ID is required')).min(1, 'NIGHTQA_OIDC_CLIENT_ID is required'),
  NIGHTQA_OIDC_CLIENT_SECRET: z.string(needed('NIGHTQA_OIDC_CLIENT_SECRET is required')).min(1, 'NIGHTQA_OIDC_CLIENT_SECRET is required'),
  NIGHTQA_OIDC_NAME: z.string().min(1).max(40).default('Single sign-on'),
  NIGHTQA_OIDC_SCOPES: z.string().min(1).default('openid email profile'),
  NIGHTQA_OIDC_GROUPS_CLAIM: z.string().min(1).default('groups'),
});

const present = (env: Env, names: readonly string[]): boolean => names.some((n) => (env[n] ?? '').trim() !== '');

/**
 * Reads the sign-in settings. Fails closed: a method is on only when all of its settings are present and valid, a
 * half-configured method is a listed problem, and with no method (or sign-in switched off explicitly with
 * NIGHTQA_AUTH=off, local development only) the dashboard refuses to serve anything.
 */
export function loadAuthConfig(raw: Env): AuthConfig {
  if (raw.NIGHTQA_AUTH === 'off') return { mode: 'off' };
  // A blank value in .env (as .env.example ships them) means "not set".
  const env: Env = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined && v.trim() !== ''));
  const problems: string[] = [];
  const issues = (r: { error: z.ZodError }): string[] => r.error.issues.map((i) => i.message);

  let github: GithubProvider | undefined;
  if (present(env, ['NIGHTQA_GITHUB_CLIENT_ID', 'NIGHTQA_GITHUB_CLIENT_SECRET'])) {
    const r = githubSchema.safeParse(env);
    const users = list(env.NIGHTQA_AUTH_USERS);
    const viewers = list(env.NIGHTQA_AUTH_VIEWERS);
    const org = env.NIGHTQA_AUTH_ORG?.trim() || undefined;
    if (!r.success) problems.push(...issues(r));
    else if (users.size === 0 && viewers.size === 0 && !org) {
      problems.push('Say who may sign in with GitHub: NIGHTQA_AUTH_USERS (GitHub logins, comma separated), NIGHTQA_AUTH_VIEWERS, or NIGHTQA_AUTH_ORG');
    } else {
      github = {
        clientId: r.data.NIGHTQA_GITHUB_CLIENT_ID,
        clientSecret: r.data.NIGHTQA_GITHUB_CLIENT_SECRET,
        users,
        viewers,
        ...(org ? { org } : {}),
        githubUrl: trimSlash(r.data.NIGHTQA_GITHUB_URL),
        apiUrl: trimSlash(r.data.NIGHTQA_GITHUB_API_URL),
      };
    }
  }

  let oidc: OidcProvider | undefined;
  if (present(env, ['NIGHTQA_OIDC_ISSUER', 'NIGHTQA_OIDC_CLIENT_ID', 'NIGHTQA_OIDC_CLIENT_SECRET'])) {
    const r = oidcSchema.safeParse(env);
    const emails = list(env.NIGHTQA_OIDC_ALLOWED_EMAILS);
    const domains = list(env.NIGHTQA_OIDC_ALLOWED_DOMAINS);
    const memberGroups = names(env.NIGHTQA_OIDC_MEMBER_GROUPS);
    const viewerGroups = names(env.NIGHTQA_OIDC_VIEWER_GROUPS);
    const role = env.NIGHTQA_OIDC_DEFAULT_ROLE ?? 'member';
    if (!r.success) problems.push(...issues(r));
    else {
      const issuer = trimSlash(r.data.NIGHTQA_OIDC_ISSUER);
      const url = new URL(issuer);
      if (url.protocol !== 'https:' && !isLocalHost(url.hostname) && env.NIGHTQA_OIDC_ALLOW_HTTP !== '1') {
        problems.push('NIGHTQA_OIDC_ISSUER must use https:// (set NIGHTQA_OIDC_ALLOW_HTTP=1 only on a network you trust)');
      } else if (role !== 'member' && role !== 'viewer') {
        problems.push('NIGHTQA_OIDC_DEFAULT_ROLE must be "member" or "viewer"');
      } else if (emails.size + domains.size + memberGroups.size + viewerGroups.size === 0) {
        problems.push('Say who may sign in with SSO: NIGHTQA_OIDC_ALLOWED_EMAILS, NIGHTQA_OIDC_ALLOWED_DOMAINS, NIGHTQA_OIDC_MEMBER_GROUPS or NIGHTQA_OIDC_VIEWER_GROUPS');
      } else {
        oidc = {
          name: r.data.NIGHTQA_OIDC_NAME,
          issuer,
          clientId: r.data.NIGHTQA_OIDC_CLIENT_ID,
          clientSecret: r.data.NIGHTQA_OIDC_CLIENT_SECRET,
          scopes: r.data.NIGHTQA_OIDC_SCOPES,
          groupsClaim: r.data.NIGHTQA_OIDC_GROUPS_CLAIM,
          emails,
          domains,
          memberGroups,
          viewerGroups,
          defaultRole: role,
        };
      }
    }
  }

  let password: PasswordProvider | undefined;
  if (env.NIGHTQA_PASSWORD_AUTH === '1') {
    if (!env.DATABASE_URL) problems.push('Email + password sign-in needs the database: set DATABASE_URL (see ADR 0008)');
    else password = { enabled: true };
  }

  if (!github && !oidc && !password && problems.length === 0) {
    problems.push(
      'Choose how people sign in: GitHub (NIGHTQA_GITHUB_CLIENT_ID, NIGHTQA_GITHUB_CLIENT_SECRET and who may sign in), SSO (NIGHTQA_OIDC_ISSUER, NIGHTQA_OIDC_CLIENT_ID, NIGHTQA_OIDC_CLIENT_SECRET and who may sign in) or email + password (NIGHTQA_PASSWORD_AUTH=1 with DATABASE_URL)',
    );
  }
  const base = baseSchema.safeParse(env);
  if (!base.success) problems.push(...issues(base));
  if (problems.length > 0 || !base.success) return { mode: 'unconfigured', problems };

  return {
    mode: 'on',
    sessionSecret: base.data.NIGHTQA_SESSION_SECRET,
    publicUrl: trimSlash(base.data.NIGHTQA_PUBLIC_URL),
    secureCookies: base.data.NIGHTQA_PUBLIC_URL.startsWith('https://'),
    ...(github ? { github } : {}),
    ...(oidc ? { oidc } : {}),
    ...(password ? { password } : {}),
  };
}

/** Over HTTPS the cookie gets the __Host- prefix, which stops other subdomains from planting it. */
export const sessionCookieName = (secure: boolean): string => (secure ? '__Host-nq_session' : 'nq_session');
export const oauthCookieName = (secure: boolean): string => (secure ? '__Host-nq_oauth' : 'nq_oauth');
export const oidcCookieName = (secure: boolean): string => (secure ? '__Host-nq_oidc' : 'nq_oidc');
