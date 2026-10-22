import { isIP } from 'node:net';

export interface UrlPolicyOptions {
  /** Allow URLs that look like production. Off by default (rule: staging only). */
  readonly allowProduction?: boolean;
  /** Allow loopback and private-network targets, such as a local demo app. Cloud metadata stays blocked. */
  readonly allowPrivateNetwork?: boolean;
}

export type UrlPolicyReason =
  | 'invalid-url'
  | 'bad-protocol'
  | 'credentials-in-url'
  | 'cloud-metadata'
  | 'private-network'
  | 'production-looking';

/** Thrown when a URL breaks the staging-only or SSRF rules. */
export class UrlPolicyError extends Error {
  override readonly name = 'UrlPolicyError';

  constructor(
    readonly reason: UrlPolicyReason,
    message: string,
  ) {
    super(message);
  }
}

const METADATA_HOSTS = new Set(['metadata.google.internal', 'metadata', 'instance-data']);
const STAGING_MARKERS = new Set([
  'staging',
  'stage',
  'stg',
  'dev',
  'test',
  'testing',
  'qa',
  'uat',
  'preview',
  'sandbox',
  'demo',
  'canary',
]);

function ipv4Octets(ip: string): number[] | undefined {
  const parts = ip.split('.').map(Number);
  return parts.length === 4 && parts.every((p) => Number.isInteger(p) && p >= 0 && p <= 255)
    ? parts
    : undefined;
}

/** Converts IPv4-mapped IPv6 (dotted or the hex form URL parsing produces) back to IPv4. */
function unmapIpv6(ip: string): string {
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (dotted?.[1] !== undefined) return dotted[1];
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
  if (hex?.[1] !== undefined && hex[2] !== undefined) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${String(hi >> 8)}.${String(hi & 255)}.${String(lo >> 8)}.${String(lo & 255)}`;
  }
  return ip;
}

/** True for link-local and cloud metadata addresses (169.254.0.0/16, fd00:ec2::254). Always blocked. */
export function isMetadataAddress(address: string): boolean {
  const ip = unmapIpv6(address.replace(/^\[|\]$/g, '').toLowerCase());
  const o = ipv4Octets(ip);
  if (o) return o[0] === 169 && o[1] === 254;
  return ip === 'fd00:ec2::254';
}

/** True for loopback, private, link-local and unspecified addresses. */
export function isPrivateAddress(address: string): boolean {
  const ip = unmapIpv6(address.replace(/^\[|\]$/g, '').toLowerCase());
  const o = ipv4Octets(ip);
  if (o) {
    const [a = 0, b = 0] = o;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  return (
    ip === '::' ||
    ip === '::1' ||
    ip.startsWith('fc') ||
    ip.startsWith('fd') ||
    /^fe[89ab]/.test(ip)
  );
}

function isPrivateHostname(host: string): boolean {
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.lan') ||
    !host.includes('.')
  );
}

function looksLikeStaging(host: string): boolean {
  return host.split(/[.-]/).some((t) => STAGING_MARKERS.has(t));
}

/**
 * Checks that a URL is safe to test: http(s) only, no credentials, never cloud metadata,
 * no private network unless allowed, and not production-looking unless allowed.
 * @returns the parsed URL
 * @throws UrlPolicyError
 */
export function checkTestUrl(raw: string, opts: UrlPolicyOptions = {}): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UrlPolicyError('invalid-url', `Not a valid URL: ${raw}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UrlPolicyError(
      'bad-protocol',
      `Only http and https URLs can be tested, got ${url.protocol}`,
    );
  }
  if (url.username || url.password) {
    throw new UrlPolicyError('credentials-in-url', 'URLs must not contain credentials');
  }
  const host = url.hostname.toLowerCase();
  const bare = host.replace(/^\[|\]$/g, '');
  if (METADATA_HOSTS.has(host) || isMetadataAddress(bare)) {
    throw new UrlPolicyError('cloud-metadata', `Cloud metadata address is always blocked: ${host}`);
  }
  const isPrivate = isIP(bare) !== 0 ? isPrivateAddress(bare) : isPrivateHostname(host);
  if (isPrivate) {
    if (!opts.allowPrivateNetwork) {
      throw new UrlPolicyError(
        'private-network',
        `${host} is a loopback or private address. Pass --allow-private-network to test it.`,
      );
    }
    return url;
  }
  if (!opts.allowProduction && !looksLikeStaging(host)) {
    throw new UrlPolicyError(
      'production-looking',
      `${host} looks like production. NightQA tests staging only. Pass --allow-production to override.`,
    );
  }
  return url;
}

/** Network requests the browser may make: only the allow-listed origins (plus inline data and blank pages). */
export function isRequestAllowed(rawUrl: string, allowedOrigins: ReadonlySet<string>): boolean {
  if (rawUrl.startsWith('data:') || rawUrl === 'about:blank') return true;
  try {
    return allowedOrigins.has(new URL(rawUrl).origin);
  } catch {
    return false;
  }
}
