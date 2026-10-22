import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** Webhook targets are chosen by a person, but must never reach private, loopback or cloud-metadata addresses. */

export class UnsafeTargetError extends Error {
  override readonly name = 'UnsafeTargetError';
}

function ipv4Octets(ip: string): number[] | undefined {
  const parts = ip.split('.').map(Number);
  return parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? parts : undefined;
}

function blockedV4(o: readonly number[]): boolean {
  const [a = 0, b = 0, c = 0] = o;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, includes the cloud metadata address 169.254.169.254
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224 // multicast, reserved, broadcast
  );
}

/** Expands an IPv6 address (with optional :: and trailing dotted IPv4) to eight 16-bit groups. */
export function expandIpv6(ip: string): number[] | undefined {
  let s = ip.toLowerCase();
  const zone = s.indexOf('%');
  if (zone >= 0) s = s.slice(0, zone);
  const tail = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (tail) {
    const v4 = ipv4Octets(tail[2] ?? '');
    if (!v4) return undefined;
    const [a = 0, b = 0, c = 0, d = 0] = v4;
    s = `${tail[1] ?? ''}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return undefined;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 0) return undefined;
  const groups = [...head, ...(halves.length === 2 ? Array<string>(missing).fill('0') : []), ...rest].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : undefined;
}

function blockedV6(g: readonly number[]): boolean {
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = g;
  const embedded = [g6 >> 8, g6 & 255, g7 >> 8, g7 & 255];
  if (g.slice(0, 5).every((x) => x === 0) && (g5 === 0xffff || g5 === 0)) return blockedV4(embedded) || (g5 === 0 && g6 === 0 && g7 <= 1); // ::, ::1, ::ffff:a.b.c.d, ::a.b.c.d
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return blockedV4(embedded); // NAT64
  if (g0 === 0x2002) return blockedV4([g1 >> 8, g1 & 255, g2 >> 8, g2 & 255]); // 6to4
  return (
    (g0 & 0xfe00) === 0xfc00 || // unique local
    (g0 & 0xffc0) === 0xfe80 || // link-local
    (g0 & 0xff00) === 0xff00 || // multicast
    (g0 === 0x2001 && g1 === 0x0db8) || // documentation
    g0 === 0x100 // discard-only
  );
}

/** True for any address a webhook must not be sent to. Anything that does not parse as an IP counts as blocked. */
export function isBlockedAddress(ip: string): boolean {
  const kind = isIP(ip.replace(/^\[|\]$/g, ''));
  const bare = ip.replace(/^\[|\]$/g, '');
  if (kind === 4) {
    const o = ipv4Octets(bare);
    return !o || blockedV4(o);
  }
  if (kind === 6) {
    const g = expandIpv6(bare);
    return !g || blockedV6(g);
  }
  return true;
}

export interface TargetRules {
  /** Exact hostnames that may be used. When set, only these are accepted (Slack: hooks.slack.com). */
  readonly allowedHosts?: readonly string[];
  /** Required path prefix, for example /services/ for Slack. */
  readonly pathPrefix?: string;
}

export type Resolver = (host: string) => Promise<string[]>;

const systemResolver: Resolver = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

/** Shape checks that need no network: https only, no credentials, no odd ports, host rules. */
export function parseTarget(raw: string, rules: TargetRules = {}): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UnsafeTargetError('That is not a valid URL.');
  }
  if (u.protocol !== 'https:') throw new UnsafeTargetError('Only https:// addresses are allowed.');
  if (u.username || u.password) throw new UnsafeTargetError('Addresses with a username or password are not allowed.');
  if (u.port && u.port !== '443') throw new UnsafeTargetError('Only the standard https port is allowed.');
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) throw new UnsafeTargetError('That host is not allowed.');
  if (rules.allowedHosts && !rules.allowedHosts.includes(host)) throw new UnsafeTargetError('That host is not allowed for this channel.');
  if (rules.pathPrefix && !u.pathname.startsWith(rules.pathPrefix)) throw new UnsafeTargetError('That address does not look right for this channel.');
  if ((isIP(host.replace(/^\[|\]$/g, '')) !== 0 || /^\d+$/.test(host.split('.').pop() ?? '')) && isBlockedAddress(host)) throw new UnsafeTargetError('That address is not allowed.');
  return u;
}

/**
 * Full check before a request: shape rules, then every address the host resolves to must be public. A name that
 * resolves to nothing, or to any private address, is refused (fail closed).
 */
export async function assertSafeTarget(raw: string, rules: TargetRules = {}, resolve: Resolver = systemResolver): Promise<URL> {
  const u = parseTarget(raw, rules);
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) !== 0) return u;
  let addrs: string[];
  try {
    addrs = await resolve(host);
  } catch {
    throw new UnsafeTargetError('That host could not be resolved.');
  }
  if (addrs.length === 0 || addrs.some(isBlockedAddress)) throw new UnsafeTargetError('That host resolves to a private or internal address.');
  return u;
}
