// Hand-maintained (not generated). Mobile tab bar from design/source/TabBar.dc.html.
// Static navigation with the active tab highlighted; no counts, so nothing here can be fake.
import Link from 'next/link';
import type { CSSProperties } from 'react';

type TabLabel = 'Home' | 'Bugs' | 'Runs' | 'Alerts' | 'Setup';

interface Tab {
  label: TabLabel;
  href: string;
  shape: CSSProperties;
}

const TABS: readonly Tab[] = [
  { label: 'Home', href: '/m/home', shape: { borderRadius: '50%' } },
  { label: 'Bugs', href: '/m/bugs', shape: { borderRadius: 4, transform: 'rotate(45deg)' } },
  { label: 'Runs', href: '/m/run', shape: { borderRadius: 2, height: 4, width: 18 } },
  { label: 'Alerts', href: '/m/alerts', shape: { borderRadius: '8px 8px 3px 3px' } },
  { label: 'Setup', href: '/m/setup', shape: { borderRadius: 3 } },
];

const DEFAULT_ACCENT = '#34E3CB';

export interface TabBarProps {
  accent?: string;
  active?: string;
}

function tabStyle(on: boolean): CSSProperties {
  return {
    flex: 1,
    minHeight: 52,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 20,
    fontWeight: on ? 800 : 600,
    color: on ? '#FFFFFF' : '#8E9BB2',
    background: on ? 'rgba(255,255,255,0.1)' : 'transparent',
  };
}

function glyphStyle(tab: Tab, on: boolean, accent: string): CSSProperties {
  return {
    display: 'block',
    boxSizing: 'border-box',
    width: 14,
    height: 14,
    border: `2px solid ${on ? accent : '#6F7C94'}`,
    ...tab.shape,
    ...(on ? { boxShadow: `0 0 12px ${accent}` } : {}),
  };
}

export default function TabBar({ accent = DEFAULT_ACCENT, active = 'Home' }: TabBarProps) {
  return (
    <nav
      aria-label="Tabs"
      style={{
        boxSizing: 'border-box',
        width: '100%',
        padding: '8px 14px 22px',
        fontFamily: "'Manrope', system-ui, sans-serif",
        // Stays at the bottom of the screen on long pages (identical to the design when the page is short).
        position: 'sticky',
        bottom: 0,
        zIndex: 20,
        background: 'linear-gradient(to top, #070A10 55%, rgba(7,10,16,0))',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 2,
          padding: 6,
          borderRadius: 26,
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(18,24,36,0.92)',
          boxShadow: '0 18px 40px -12px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
      >
        {TABS.map((t) => {
          const on = t.label === active;
          return (
            <Link key={t.label} href={t.href} aria-current={on ? 'page' : undefined} style={tabStyle(on)}>
              <span style={glyphStyle(t, on, accent)} />
              <span style={{ fontSize: 11.5 }}>{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
