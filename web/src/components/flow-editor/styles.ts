import type { CSSProperties } from 'react';
import { css } from '@/lib/dc';
import { MONO } from '@/screens/live/ui';

/** Form styles from the Moonlight design (Import and Editor screens). */
export const ACCENT = '#34E3CB';

export const label = css('font-size: 12.5px; color: #A3AEC2; font-weight: 700');
export const field = css('display: flex; flex-direction: column; gap: 6px');

const INPUT =
  'min-height: 46px; box-sizing: border-box; padding: 0 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.14); background: #05080D; color: #EAF0FA; font-family: inherit; font-size: 15px; width: 100%';
export const input: CSSProperties = css(`${INPUT}; font-weight: 600`);
export const inputMono: CSSProperties = css(`${INPUT}; font-family: ${MONO}; font-size: 14px`);
export const select: CSSProperties = css(`${INPUT}; font-family: ${MONO}; font-size: 14px`);

export const primaryBtn = (off = false): CSSProperties =>
  css(
    `min-height: 50px; padding: 0 26px; border: 0; border-radius: 14px; background: ${ACCENT}; color: #03211D; font-family: inherit; font-size: 15px; font-weight: 800; cursor: ${off ? 'not-allowed' : 'pointer'}; box-shadow: 0 10px 36px -8px rgba(52,227,203,0.7); opacity: ${off ? '0.45' : '1'}`,
  );
export const ghostBtn: CSSProperties = css(
  'min-height: 50px; padding: 0 22px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.05); color: #EAF0FA; font-family: inherit; font-size: 15px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center',
);
export const smallBtn = (off = false): CSSProperties =>
  css(
    `min-height: 36px; min-width: 36px; padding: 0 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.05); color: #EAF0FA; font-family: inherit; font-size: 13px; font-weight: 700; cursor: ${off ? 'not-allowed' : 'pointer'}; opacity: ${off ? '0.4' : '1'}`,
  );
export const dangerBtn: CSSProperties = css(
  'min-height: 50px; padding: 0 22px; border-radius: 14px; border: 1px solid rgba(255,107,91,0.55); background: rgba(255,107,91,0.1); color: #FF8A7B; font-family: inherit; font-size: 15px; font-weight: 800; cursor: pointer',
);
