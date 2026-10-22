import Link from 'next/link';
import type { Metadata } from 'next';
import { SCREENS } from '@/lib/routes';

export const metadata: Metadata = { title: 'NightQA screens' };

const GROUPS = [
  ['Web app', 'web'],
  ['Fixed-size boards', 'fixed'],
  ['Mobile app', 'mobile'],
  ['Components', 'component'],
] as const;

export default function Screens() {
  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '48px 24px', fontFamily: "'Manrope', system-ui, sans-serif", color: '#EAF0FA' }}>
      <h1 style={{ fontSize: 42, fontWeight: 800, letterSpacing: -1.6, margin: '0 0 28px' }}>All screens</h1>
      {GROUPS.map(([label, kind]) => (
        <section key={kind} style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 12px' }}>{label}</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
            {SCREENS.filter((s) => s.kind === kind).map((s) => (
              <li key={s.name}>
                <Link href={s.route} style={{ display: 'block', padding: '14px 16px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.04)', fontWeight: 700 }}>
                  {s.title.replace('NightQA ', '')}
                  <span style={{ display: 'block', fontSize: 12.5, color: '#A3AEC2', fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>{s.route}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
