import type { CSSProperties, ReactNode } from 'react';
import { css } from '@/lib/dc';
import { card } from '../live/ui';

export const ACCENT = '#34E3CB';
const chipStyle = (fg: string, bg: string): CSSProperties => css(`flex: 0 0 auto; font-size: 12px; font-weight: 800; color: ${fg}; background: ${bg}; padding: 5px 12px; border-radius: 99px`);
export const OK = chipStyle(ACCENT, 'rgba(52,227,203,0.13)');
export const BAD = chipStyle('#FF8A7B', 'rgba(255,107,91,0.18)');
export const WARN = chipStyle('#FFC14D', 'rgba(255,193,77,0.16)');
export const OFF = chipStyle('#A3AEC2', 'rgba(255,255,255,0.08)');

export const sectionTitle = css('font-size: 19px; font-weight: 800; letter-spacing: -0.4px');
export const note = css('margin-top: 14px; font-size: 13px; color: #A3AEC2; line-height: 1.5');
export const rowStyle = css('display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; padding: 14px 0; border-top: 1px solid rgba(255,255,255,0.07)');

export function Section({ id, title, aside, children }: { id: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} style={{ ...card('padding: 26px 30px'), scrollMarginTop: 20 }}>
      {aside ? (
        <div style={css('display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px')}>
          <div style={sectionTitle}>{title}</div>
          {aside}
        </div>
      ) : (
        <div style={sectionTitle}>{title}</div>
      )}
      {children}
    </section>
  );
}

export const stagingChip = (status: string): CSSProperties => (status === 'ok' ? OK : status === 'blocked' ? BAD : status === 'empty' ? OFF : WARN);
export const stagingLabel = (status: string): string =>
  ({ ok: 'Passes staging rules', blocked: 'Blocked', empty: 'Not set', private: 'Private network', production: 'Looks like production' })[status] ?? status;
