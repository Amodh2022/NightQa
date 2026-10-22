import type { Settings } from './settings';

type Network = Settings['profiles']['network'];
type Screen = Settings['profiles']['screen'];

/**
 * What each network profile does. Mirrors NETWORKS in src/core/profiles.ts (Chrome DevTools throttling presets);
 * keep the two in step. Kilobits per second and added round-trip delay in milliseconds.
 */
export const NETWORK_INFO: Record<Network, { label: string; text: string; bars: number }> = {
  none: { label: 'No throttling', text: 'Full speed, as the machine running NightQA has it. The baseline for every flow.', bars: 4 },
  'fast-4g': { label: 'Fast 4G', text: 'Good mobile data: 9 Mbps down and up, 85 ms added delay.', bars: 3 },
  'slow-4g': { label: 'Slow 4G', text: 'Weak mobile data: 3 Mbps down, 1.5 Mbps up, 170 ms added delay.', bars: 2 },
  'fast-3g': { label: 'Fast 3G', text: 'Older mobile data: 1.6 Mbps down, 750 kbps up, 562 ms added delay.', bars: 2 },
  'slow-3g': { label: 'Slow 3G', text: 'Slow pages and long waits: 400 kbps both ways, 2 s added delay.', bars: 1 },
};

/** Screen sizes. Mirrors SCREENS in src/core/profiles.ts (CSS pixels); keep the two in step. */
export const SCREEN_INFO: Record<Screen, { label: string; width: number; height: number; touch: boolean }> = {
  desktop: { label: 'Desktop', width: 1280, height: 800, touch: false },
  laptop: { label: 'Laptop', width: 1440, height: 900, touch: false },
  tablet: { label: 'Tablet', width: 820, height: 1180, touch: true },
  iphone: { label: 'iPhone', width: 390, height: 844, touch: true },
  android: { label: 'Common Android', width: 412, height: 915, touch: true },
  'android-small': { label: 'Small Android', width: 360, height: 640, touch: true },
};

export const NETWORK_ORDER: readonly Network[] = ['none', 'fast-4g', 'slow-4g', 'fast-3g', 'slow-3g'];
export const SCREEN_ORDER: readonly Screen[] = ['android-small', 'android', 'iphone', 'tablet', 'desktop', 'laptop'];

export const networkLabel = (n: string): string => (n in NETWORK_INFO ? NETWORK_INFO[n as Network].label : n);
export const screenLabel = (s: string): string => (s in SCREEN_INFO ? SCREEN_INFO[s as Screen].label : s);
