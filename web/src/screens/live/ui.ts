import type { CSSProperties } from 'react';
import { css } from '@/lib/dc';

/** Styles shared by the live screens, copied from the Moonlight design tokens. */
export const FONT = "'Manrope', system-ui, sans-serif";
export const MONO = "'JetBrains Mono', monospace";

export const CARD =
  'background:linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.016));border:1px solid rgba(255,255,255,0.085);border-radius:22px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.06),0 28px 56px -30px rgba(0,0,0,0.9)';

export const card = (extra = ''): CSSProperties => css(`${CARD};${extra}`);

export const pageBg = (glow = 'rgba(52,227,203,0.13)', violet = 'rgba(139,124,255,0.10)'): CSSProperties =>
  css(
    `min-height: 100vh; font-family: ${FONT}; color: #EAF0FA; background: radial-gradient(1000px 520px at 82% -120px, ${glow}, transparent 62%), radial-gradient(760px 520px at 2% 18%, ${violet}, transparent 62%), #070A10`,
  );

export const main = (pad = '36px 40px 64px'): CSSProperties =>
  css(`max-width: 1320px; margin: 0 auto; box-sizing: border-box; padding: ${pad}; display: flex; flex-direction: column; gap: 28px`);

export const eyebrow = (accent: string): CSSProperties =>
  css(`font-size: 12.5px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 700; color: ${accent}`);

export const h1 = css('margin: 8px 0 0; font-size: 42px; font-weight: 800; letter-spacing: -1.6px');
export const lead = css('font-size: 15.5px; color: #A3AEC2; margin-top: 8px; max-width: 760px; line-height: 1.5');

export const chip = (fg: string, bg: string): CSSProperties =>
  css(`font-size: 12.5px; font-weight: 800; color: ${fg}; background: ${bg}; padding: 7px 14px; border-radius: 99px`);

export const emptyCard = css(
  `${CARD}; padding: 40px 32px; text-align: center; display: flex; flex-direction: column; gap: 10px; align-items: center`,
);
