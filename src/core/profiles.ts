import { z } from 'zod';

/**
 * Real-world conditions a flow can run under. Bugs hide on slow networks and small screens, so the same flow can
 * be run as "slow 3G on a small Android phone". Numbers follow Chrome DevTools throttling presets (approximate).
 */
export const NETWORK_NAMES = ['none', 'fast-4g', 'slow-4g', 'fast-3g', 'slow-3g'] as const;
export const SCREEN_NAMES = [
  'desktop',
  'laptop',
  'tablet',
  'iphone',
  'android-small',
  'android',
] as const;

export const networkNameSchema = z.enum(NETWORK_NAMES);
export const screenNameSchema = z.enum(SCREEN_NAMES);
export type NetworkName = z.infer<typeof networkNameSchema>;
export type ScreenName = z.infer<typeof screenNameSchema>;

export interface RunProfile {
  readonly network: NetworkName;
  readonly screen: ScreenName;
}

export const DEFAULT_PROFILE: RunProfile = { network: 'none', screen: 'desktop' };

export interface NetworkConditions {
  /** Kilobits per second. */
  readonly downloadKbps: number;
  readonly uploadKbps: number;
  /** Added round-trip delay in milliseconds. */
  readonly latencyMs: number;
}

export const NETWORKS: Record<Exclude<NetworkName, 'none'>, NetworkConditions> = {
  'fast-4g': { downloadKbps: 9000, uploadKbps: 9000, latencyMs: 85 },
  'slow-4g': { downloadKbps: 3000, uploadKbps: 1500, latencyMs: 170 },
  'fast-3g': { downloadKbps: 1600, uploadKbps: 750, latencyMs: 562 },
  'slow-3g': { downloadKbps: 400, uploadKbps: 400, latencyMs: 2000 },
};

export interface ScreenSpec {
  readonly width: number;
  readonly height: number;
  readonly deviceScaleFactor: number;
  readonly isMobile: boolean;
  readonly hasTouch: boolean;
  readonly userAgent?: string;
}

const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

export const SCREENS: Record<ScreenName, ScreenSpec> = {
  desktop: { width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  laptop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  tablet: { width: 820, height: 1180, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  iphone: {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: IPHONE_UA,
  },
  android: {
    width: 412,
    height: 915,
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    userAgent: MOBILE_UA,
  },
  'android-small': {
    width: 360,
    height: 640,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: MOBILE_UA,
  },
};

export const isDefaultProfile = (p: RunProfile): boolean =>
  p.network === 'none' && p.screen === 'desktop';

/** Short label such as "slow-3g on android-small", or "default". */
export function describeProfile(p: RunProfile): string {
  if (isDefaultProfile(p)) return 'default';
  return [
    p.network !== 'none' ? p.network : undefined,
    p.screen !== 'desktop' ? p.screen : undefined,
  ]
    .filter(Boolean)
    .join(' on ');
}

/**
 * Lines for a generated Playwright test so the customer's own copy runs under the same conditions.
 * Screen sizes become `test.use` options; throttling uses a Chromium DevTools session.
 */
export function profileSpecLines(p: RunProfile): { use: string[]; setup: string[] } {
  const use: string[] = [];
  const setup: string[] = [];
  if (p.screen !== 'desktop') {
    const s = SCREENS[p.screen];
    use.push(
      `test.use({ viewport: { width: ${String(s.width)}, height: ${String(s.height)} }, deviceScaleFactor: ${String(s.deviceScaleFactor)}, isMobile: ${String(s.isMobile)}, hasTouch: ${String(s.hasTouch)}${s.userAgent ? `, userAgent: ${JSON.stringify(s.userAgent)}` : ''} });`,
    );
  }
  if (p.network !== 'none') {
    const n = NETWORKS[p.network];
    setup.push(
      `  const cdp = await page.context().newCDPSession(page);`,
      `  await cdp.send('Network.emulateNetworkConditions', { offline: false, downloadThroughput: ${String(Math.round((n.downloadKbps * 1000) / 8))}, uploadThroughput: ${String(Math.round((n.uploadKbps * 1000) / 8))}, latency: ${String(n.latencyMs)} });`,
    );
  }
  return { use, setup };
}
