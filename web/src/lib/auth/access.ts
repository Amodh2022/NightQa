import type { AuthConfig } from './config';
import type { Session } from './session';

export type AccessDecision =
  | { readonly kind: 'allow' }
  | { readonly kind: 'redirect'; readonly to: string }
  | { readonly kind: 'deny'; readonly status: 401 | 403 | 503; readonly message: string };

const PUBLIC_EXACT = new Set(['/login', '/favicon.ico']);
const PUBLIC_PREFIX = ['/api/auth/', '/_next/'];

export const isPublicPath = (pathname: string): boolean => PUBLIC_EXACT.has(pathname) || PUBLIC_PREFIX.some((p) => pathname.startsWith(p));

const isApi = (pathname: string): boolean => pathname === '/api' || pathname.startsWith('/api/');
const isMutation = (method: string): boolean => !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());

/**
 * One decision for every request. Everything except the login page, the sign-in routes and static assets needs a
 * valid session. Viewers can read but cannot change anything. With sign-in unconfigured nothing is served.
 */
export function routeAccess(input: { pathname: string; method: string; session: Session | undefined; config: AuthConfig }): AccessDecision {
  const { pathname, method, session, config } = input;
  if (config.mode === 'off') return { kind: 'allow' };
  if (isPublicPath(pathname)) return { kind: 'allow' };
  if (config.mode === 'unconfigured') {
    return isApi(pathname) ? { kind: 'deny', status: 503, message: 'Sign-in is not configured' } : { kind: 'redirect', to: '/login' };
  }
  if (!session) {
    return isApi(pathname) ? { kind: 'deny', status: 401, message: 'Sign in first' } : { kind: 'redirect', to: '/login' };
  }
  if (session.role === 'viewer' && isMutation(method)) return { kind: 'deny', status: 403, message: 'Viewers cannot start or change anything' };
  return { kind: 'allow' };
}
