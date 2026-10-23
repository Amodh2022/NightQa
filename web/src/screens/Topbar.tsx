import { connection } from 'next/server';
import { Suspense } from 'react';
import Link from 'next/link';
import { hostLabel } from '@/lib/format';
import { targetUrl } from '@/lib/paths';
import { listRuns } from '@/lib/results';
import { getSettings } from '@/lib/settings';
import { currentViewer, type Viewer } from '@/lib/auth/server';
import { openBugCount } from '@/lib/stats';

const ITEMS = [
  { label: 'Overview', href: '/' },
  { label: 'Runs', href: '/runs' },
  { label: 'Bugs', href: '/bugs' },
  { label: 'Flows', href: '/flows' },
  { label: 'Explore', href: '/explore' },
  { label: 'Profiles', href: '/profiles' },
  { label: 'Autonomy', href: '/autonomy' },
] as const;

interface TopbarProps {
  active?: string;
  accent?: string;
}

/**
 * Top navigation. The Bugs badge counts flows whose latest run found a bug. That count is read at request time,
 * so it streams inside its own Suspense boundary and the bar itself shows instantly.
 */
export default function Topbar(props: TopbarProps) {
  return (
    <Suspense fallback={<TopbarView {...props} bugs={0} />}>
      <LiveTopbar {...props} />
    </Suspense>
  );
}

async function LiveTopbar(props: TopbarProps) {
  await connection();
  const [runs, viewer, settings] = await Promise.all([listRuns(), currentViewer(), getSettings()]);
  return <TopbarView {...props} bugs={openBugCount(runs)} url={settings.app.targetUrl || targetUrl()} {...(viewer ? { viewer } : {})} />;
}

function TopbarView({ active = 'Overview', accent = '#34E3CB', bugs, viewer, url = targetUrl() }: TopbarProps & { bugs: number; viewer?: Viewer; url?: string }) {
  return (
    <header
      style={{
        boxSizing: 'border-box', width: '100%', padding: '14px 40px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px 28px',
        borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(7,10,16,0.72)', fontFamily: "'Manrope', system-ui, sans-serif", color: '#EAF0FA',
      }}
    >
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <div style={{ width: 30, height: 30, borderRadius: '50%', background: accent, position: 'relative', overflow: 'hidden', boxShadow: '0 0 24px rgba(52,227,203,0.55)' }}>
          <div style={{ position: 'absolute', left: 12, top: -4, width: 28, height: 28, borderRadius: '50%', background: '#070A10' }} />
        </div>
        <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.5 }}>NightQA</span>
      </Link>

      <Link
        href="/settings"
        style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, boxSizing: 'border-box', padding: '0 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.035)' }}
      >
        <span style={{ fontSize: 14, fontWeight: 700 }}>{hostLabel(url)}</span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#7FB0FF', background: 'rgba(106,166,255,0.15)', padding: '3px 9px', borderRadius: 99 }}>Staging</span>
      </Link>

      <nav aria-label="Main" style={{ flex: '1 1 520px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: 4, borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
          {ITEMS.map((t) => {
            const on = t.label === active;
            return (
              <Link
                key={t.label}
                href={t.href}
                aria-current={on ? 'page' : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, minHeight: 40, boxSizing: 'border-box', padding: '0 14px', borderRadius: 12, fontSize: 14,
                  fontWeight: on ? 700 : 600, color: on ? '#FFFFFF' : '#A3AEC2',
                  background: on ? 'linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0.06))' : 'transparent',
                  boxShadow: on ? 'inset 0 1px 0 rgba(255,255,255,0.14),0 0 0 1px rgba(255,255,255,0.08)' : 'none',
                }}
              >
                {t.label}
                {t.label === 'Bugs' && bugs > 0 ? (
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#FF8A7B', background: 'rgba(255,107,91,0.16)', padding: '2px 7px', borderRadius: 99 }}>{bugs}</span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </nav>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
        <Link
          href="/notifications"
          aria-label="Notifications"
          style={{ position: 'relative', width: 44, height: 44, borderRadius: 12, border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.035)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span style={{ width: 16, height: 16, border: '2px solid #C7D0E0', borderRadius: '8px 8px 4px 4px', boxSizing: 'border-box' }} />
          {bugs > 0 ? <span style={{ position: 'absolute', top: 10, right: 11, width: 9, height: 9, borderRadius: '50%', background: '#FF6B5B', boxShadow: '0 0 10px #FF6B5B' }} /> : null}
        </Link>
        {viewer?.signedIn ? (
          <form method="post" action="/api/auth/logout">
            <button
              type="submit"
              title={`Signed in as ${viewer.login}${viewer.role === 'viewer' ? ' (view only)' : ''}`}
              style={{ minHeight: 44, padding: '0 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.035)', color: '#C7D0E0', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
            >
              Sign out
            </button>
          </form>
        ) : null}
        <Link
          href="/settings"
          aria-label={viewer ? `Account and settings (${viewer.login})` : 'Account and settings'}
          style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, #3A4560, #1B2233)', border: '1px solid rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, textTransform: 'uppercase' }}
        >
          {viewer ? viewer.login.slice(0, 1) : ''}
        </Link>
      </div>
    </header>
  );
}
