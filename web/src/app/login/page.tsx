import type { Metadata } from 'next';
import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { methodsOf } from '@/lib/auth/config';
import { authConfig, currentViewer } from '@/lib/auth/server';
import s from './login.module.css';

export const metadata: Metadata = { title: 'Sign in to NightQA' };

const MESSAGES: Record<string, string> = {
  not_allowed: 'That GitHub account is not on the allow-list for this dashboard. Ask an owner to add it.',
  denied: 'GitHub sign-in was cancelled.',
  state: 'The sign-in link expired or was not started here. Please try again.',
  failed: 'The sign-in could not be completed. Please try again.',
  credentials: 'That email and password do not match.',
  locked: 'Too many wrong passwords. This account is locked for 15 minutes.',
};

function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

function KeyMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Zm0 6a2.5 2.5 0 0 1 1 4.8V16h-2v-3.2A2.5 2.5 0 0 1 12 8Z" />
    </svg>
  );
}

function Pitch() {
  return (
    <section className={s.pitch}>
      <div className={s.brand}>
        <div className={s.moon} />
        <span className={s.brandName}>NightQA</span>
      </div>
      <h2>
        Your app gets tested <em>while you sleep.</em>
      </h2>
      <p>NightQA walks your staging app every night, proves each bug three times, and hands you a failing test, not a guess.</p>
      <div className={s.feed} aria-hidden="true">
        <div className={s.feedHead}>
          <span className={s.dot} /> Tonight&apos;s run
        </div>
        <div className={s.line}><span className={s.tag}>step 1</span>Open the shop, add an item to the cart</div>
        <div className={s.line}><span className={s.tag}>step 2</span><span className={s.pass}>Checkout form loads, passed</span></div>
        <div className={s.line}><span className={s.tag}>step 3</span><span className={s.bug}>Total shows $0.00, reproduced 3/3</span></div>
        <div className={s.line}><span className={s.tag}>result</span>Failing test written, issue filed<span className={s.cursor} /></div>
      </div>
    </section>
  );
}

export default async function Page({ searchParams }: PageProps<'/login'>) {
  await connection();
  const cfg = authConfig();
  if (cfg.mode === 'off' || (cfg.mode === 'on' && (await currentViewer()))) redirect('/');
  const error = (await searchParams).error;
  const message = typeof error === 'string' ? MESSAGES[error] : undefined;

  return (
    <main className={s.page}>
      <Pitch />
      <div className={s.card}>
        {cfg.mode === 'on' ? (
          <>
            <h1>Welcome back</h1>
            <p className={s.lead}>Sign in to see last night&apos;s runs, bugs and fixes.</p>
            {message ? (
              <p role="alert" className={s.alert}>
                {message}
              </p>
            ) : null}
            {cfg.oidc ? (
              <a href="/api/auth/oidc" className={s.cta}>
                <KeyMark /> Continue with {cfg.oidc.name}
              </a>
            ) : null}
            {cfg.github ? (
              <a href="/api/auth/github" className={cfg.oidc ? s.ctaAlt : s.cta}>
                <GithubMark /> Continue with GitHub
              </a>
            ) : null}
            {cfg.password ? (
              <>
                {cfg.oidc || cfg.github ? <div className={s.divider}>or use email</div> : null}
                <form method="post" action="/api/auth/password" className={s.form}>
                  <label className={s.label} htmlFor="email">
                    Email
                  </label>
                  <input id="email" name="email" type="email" autoComplete="username" required maxLength={254} className={s.input} />
                  <label className={s.label} htmlFor="password">
                    Password
                  </label>
                  <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={200} className={s.input} />
                  <button type="submit" className={methodsOf(cfg).length > 1 ? s.ctaAlt : s.cta}>
                    Sign in
                  </button>
                </form>
              </>
            ) : null}
            <p className={s.fine}>Only people who were given access can get in.</p>
          </>
        ) : (
          <>
            <h1>Sign-in is not set up</h1>
            <p className={s.lead}>For safety the dashboard shows nothing until it knows who may open it. Add these settings and restart:</p>
            <ul className={s.list}>
              {(cfg.mode === 'unconfigured' ? cfg.problems : []).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <p className={s.small}>
              Create a GitHub OAuth app at github.com/settings/developers with the callback URL <code className={s.code}>&lt;your dashboard address&gt;/api/auth/callback</code>. See the README, section &quot;Sign-in&quot;. For local development only you can set{' '}
              <code className={s.code}>NIGHTQA_AUTH=off</code>.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
