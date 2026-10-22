import type { CSSProperties } from 'react';
import { css } from '@/lib/dc';
import { COLORS } from '@/lib/format';
import type { Tone } from '@/lib/report';
import type { FeedColor } from '@/lib/notify/view';

/** Chip colors from the design's report rows. */
export const TONE: Record<Tone, { fg: string; bg: string }> = {
  crit: { fg: '#FFFFFF', bg: '#FF6B5B' },
  high: { fg: '#FF8A7B', bg: 'rgba(255,107,91,0.2)' },
  med: { fg: '#FFC14D', bg: 'rgba(255,193,77,0.18)' },
  low: { fg: '#8DB8FF', bg: 'rgba(106,166,255,0.18)' },
  setup: { fg: '#B9A6FF', bg: 'rgba(139,124,255,0.22)' },
  look: { fg: '#B4BFD2', bg: 'rgba(142,155,178,0.2)' },
};

export const reportChip = (tone: Tone): CSSProperties =>
  css(`flex: 0 0 auto; font-size: 11.5px; font-weight: 800; color: ${TONE[tone].fg}; background: ${TONE[tone].bg}; padding: 4px 9px; border-radius: 99px; min-width: 46px; text-align: center; box-sizing: border-box`);

export const FEED_COLOR: Record<FeedColor, string> = {
  accent: COLORS.accent,
  white: '#FFFFFF',
  violet: COLORS.violet,
  blue: COLORS.blue,
  coral: COLORS.coral,
  amber: COLORS.amber,
};

/** Dot beside an alert feed line (MAlerts design). */
export const feedDot = (color: string): CSSProperties =>
  css(`flex: 0 0 10px; width: 10px; height: 10px; margin-top: 5px; border-radius: 50%; background: ${color}; box-shadow: 0 0 12px ${color}`);
