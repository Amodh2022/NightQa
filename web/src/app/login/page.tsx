import type { Metadata } from 'next';
import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { authConfig, currentViewer } from '@/lib/auth/server';

export const metadata: Metadata = { title: 'Sign in to NightQA' };

const MESSAGES: Record<string, string> = {
  not_allowed: 'That GitHub account is not on the allow-list for this dashboard. Ask an owner to add it.',
  denied: 'GitHub sign-in was cancelled.',
  state: 'The sign-in link expired or was not started here. Please try again.',
  failed: 'GitHub could not complete the sign-in. Please try again.',
};

const card = { width: 'min(460px, 92vw)', boxSizing: 'border-box', padding: '36px 34px', borderRadius: 24, border: '1px solid rgba(255,255,255,0.09)', background: 'linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), 0 30px 70px -30px rgba(0,0,0,0.9)' } as const;

export default async function Page({ searchParams }: PageProps<'/login'>) {
  await connection();
  const cfg = authConfig();
  if (cfg.mode === 'off' || (cfg.mode === 'github' && (await currentViewer()))) redirect('/');
  const error = (await searchParams).error;
  const message = typeof error === 'string' ? MESSAGES[error] : undefined;

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: "'Manrope', system-ui, sans-serif", color: '#EAF0FA', background: 'radial-gradient(1000px 520px at 82% -120px, rgba(52,227,203,0.15), transparent 62%), radial-gradient(760px 520px at 2% 18%, rgba(139,124,255,0.11), transparent 62%), #070A10' }}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#34E3CB', position: 'relative', overflow: 'hidden', boxShadow: '0 0 24px rgba(52,227,203,0.55)' }}>
            <div style={{ position: 'absolute', left: 12, top: -4, width: 28, height: 28, borderRadius: '50%', background: '#070A10' }} />
          </div>
          <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.5 }}>NightQA</span>
        </div>

        {cfg.mode === 'github' ? (
          <>
            <h1 style={{ margin: '26px 0 0', fontSize: 30, fontWeight: 800, letterSpacing: -1.2 }}>Sign in</h1>
            <p style={{ margin: '10px 0 0', fontSize: 15, lineHeight: 1.55, color: '#A3AEC2' }}>Use your GitHub account. Only people on this dashboard&apos;s allow-list can get in.</p>
            {message ? (
              <p role="alert" style={{ margin: '18px 0 0', padding: '12px 14px', borderRadius: 12, fontSize: 14, lineHeight: 1.5, color: '#FF8A7B', background: 'rgba(255,107,91,0.1)', border: '1px solid rgba(255,107,91,0.5)' }}>{message}</p>
            ) : null}
            <a href="/api/auth/github" style={{ marginTop: 24, minHeight: 50, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 14, background: '#34E3CB', color: '#03211D', fontSize: 15, fontWeight: 800, boxShadow: '0 10px 36px -8px rgba(52,227,203,0.7)' }}>
              Continue with GitHub
            </a>
          </>
        ) : (
          <>
            <h1 style={{ margin: '26px 0 0', fontSize: 28, fontWeight: 800, letterSpacing: -1 }}>Sign-in is not set up</h1>
            <p style={{ margin: '10px 0 0', fontSize: 15, lineHeight: 1.55, color: '#A3AEC2' }}>
              For safety the dashboard shows nothing until it knows who may open it. Add these settings and restart:
            </p>
            <ul style={{ margin: '14px 0 0', paddingLeft: 20, fontSize: 14, lineHeight: 1.7, color: '#FFC14D' }}>
              {(cfg.mode === 'unconfigured' ? cfg.problems : []).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <p style={{ margin: '16px 0 0', fontSize: 13.5, lineHeight: 1.6, color: '#8E9BB2' }}>
              Create a GitHub OAuth app at github.com/settings/developers with the callback URL <code style={{ fontFamily: "'JetBrains Mono', monospace", color: '#C7D0E0' }}>&lt;your dashboard address&gt;/api/auth/callback</code>. See the README, section &quot;Sign-in&quot;.
              For local development only you can set <code style={{ fontFamily: "'JetBrains Mono', monospace", color: '#C7D0E0' }}>NIGHTQA_AUTH=off</code>.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
