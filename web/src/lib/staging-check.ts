import { isIP } from 'node:net';

export type StagingStatus = 'empty' | 'ok' | 'private' | 'production' | 'blocked';

export interface StagingCheck {
  readonly status: StagingStatus;
  /** One plain sentence for the person looking at the settings page. */
  readonly message: string;
}

const METADATA_HOSTS = new Set(['metadata.google.internal', 'metadata', 'instance-data']);
const STAGING_MARKERS = new Set(['staging', 'stage', 'stg', 'dev', 'test', 'testing', 'qa', 'uat', 'preview', 'sandbox', 'demo', 'canary']);

function octets(ip: string): number[] | undefined {
  const parts = ip.split('.').map(Number);
  return parts.length === 4 && parts.every((p) => Number.isInteger(p) && p >= 0 && p <= 255) ? parts : undefined;
}

function unmap(ip: string): string {
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

/** Link-local and cloud metadata addresses. Always blocked. */
export function isMetadataAddress(address: string): boolean {
  const ip = unmap(address.replace(/^\[|\]$/g, '').toLowerCase());
  const o = octets(ip);
  if (o) return o[0] === 169 && o[1] === 254;
  return ip === 'fd00:ec2::254';
}

function isPrivateAddress(address: string): boolean {
  const ip = unmap(address.replace(/^\[|\]$/g, '').toLowerCase());
  const o = octets(ip);
  if (o) {
    const [a = 0, b = 0] = o;
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return ip === '::' || ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || /^fe[89ab]/.test(ip);
}

const isPrivateHostname = (h: string): boolean => h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan') || !h.includes('.');
const looksLikeStaging = (h: string): boolean => h.split(/[.-]/).some((t) => STAGING_MARKERS.has(t));

/**
 * A pure, non-throwing port of the engine's staging rules (src/core/url-policy.ts), for showing feedback in the
 * dashboard. The engine still enforces its own check at run time; this never replaces it.
 * `blocked` means the URL must not be saved at all.
 */
export function checkStagingUrl(raw: string): StagingCheck {
  const value = raw.trim();
  if (!value) return { status: 'empty', message: 'No URL saved. NightQA falls back to NIGHTQA_TARGET_URL from the server environment.' };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { status: 'blocked', message: 'This is not a valid URL. Start with http:// or https://.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { status: 'blocked', message: 'Only http and https URLs can be tested.' };
  if (url.username || url.password) return { status: 'blocked', message: 'Remove the username and password from the URL. Use a saved test account instead.' };
  const host = url.hostname.toLowerCase();
  const bare = host.replace(/^\[|\]$/g, '');
  if (METADATA_HOSTS.has(host) || isMetadataAddress(bare)) return { status: 'blocked', message: 'Cloud metadata and link-local addresses are always blocked.' };
  const priv = isIP(bare) !== 0 ? isPrivateAddress(bare) : isPrivateHostname(host);
  if (priv) return { status: 'private', message: 'Loopback or private address. The engine only tests it when the operator allows the private network (NIGHTQA_ALLOW_PRIVATE_NETWORK=1).' };
  if (!looksLikeStaging(host)) return { status: 'production', message: 'This looks like production. NightQA tests staging only and the engine will refuse it unless the operator overrides that.' };
  return { status: 'ok', message: 'Passes the staging rules: http(s), not a metadata address, and the name looks like staging.' };
}
