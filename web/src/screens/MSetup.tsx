import Link from 'next/link';
import { connection } from 'next/server';
import { css } from '@/lib/dc';
import { pickStep } from '@/lib/setup-state';
import { loadState } from './settings/state';
import { STEP_INTRO, STEP_TITLE, StepBody } from './setup/StepBody';
import TabBar from './TabBar';

const ACCENT = '#34E3CB';

/** Mobile setup, live: same real checklist as the desktop screen. */
export default async function MSetup({ step }: { step?: string }) {
  await connection();
  const s = await loadState();
  const { setup } = s;
  const shown = pickStep(setup, step);
  const total = setup.steps.length;
  const complete = setup.current === undefined;
  const todo = setup.steps.filter((x) => !x.done && x.n !== shown?.n);
  return (
    <div style={css("width: 390px; min-height: 844px; box-sizing: border-box; display: flex; flex-direction: column; font-family: 'Manrope', system-ui, sans-serif; color: #EAF0FA; background: radial-gradient(440px 320px at 10% -60px, rgba(52,227,203,0.20), transparent 65%), radial-gradient(380px 300px at 100% 50%, rgba(139,124,255,0.12), transparent 65%), #070A10")}>
      <header style={css('padding: 26px 20px 6px')}>
        <div style={css(`font-size: 11.5px; letter-spacing: 1.3px; text-transform: uppercase; font-weight: 800; color: ${ACCENT}`)}>Setup · {s.settings.app.name}</div>
        <h1 style={css('margin: 6px 0 0; font-size: 28px; line-height: 1.1; font-weight: 800; letter-spacing: -1px')}>
          {complete ? 'Setup is complete' : `Your first report in about ${String(setup.minutesLeft)} minutes`}
        </h1>
        <div style={css('display: flex; gap: 5px; margin-top: 14px')}>
          {setup.steps.map((x) => (
            <div key={x.id} style={css(`flex: 1; height: 7px; border-radius: 99px; background: ${x.done ? ACCENT : 'rgba(255,255,255,0.12)'}${x.done ? '; box-shadow: 0 0 12px rgba(52,227,203,0.6)' : ''}`)} />
          ))}
        </div>
        <div style={css('font-size: 12.5px; color: #A3AEC2; margin-top: 8px')}>
          {setup.doneCount} of {total} done{complete ? '' : ` · about ${String(setup.minutesLeft)} minutes left (estimate)`}
        </div>
      </header>

      <main style={css('flex: 1; min-height: 0; padding: 14px 20px 20px; display: flex; flex-direction: column; gap: 12px')}>
        <div style={css('display: flex; gap: 8px; flex-wrap: wrap')}>
          {setup.steps.filter((x) => x.done).map((x) => (
            <Link key={x.id} href={`/m/setup?step=${String(x.n)}`} style={css(`display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 700; color: ${ACCENT}; background: rgba(52,227,203,0.12); padding: 7px 12px; border-radius: 99px`)}>
              <span style={css('font-weight: 800')}>✓</span>
              {x.label}
            </Link>
          ))}
        </div>

        {shown ? (
          <section style={css('padding: 18px 18px 16px; border-radius: 24px; border: 1px solid rgba(52,227,203,0.55); background: linear-gradient(180deg, rgba(52,227,203,0.11), rgba(52,227,203,0.02)); box-shadow: 0 0 60px -18px rgba(52,227,203,0.6), inset 0 1px 0 rgba(255,255,255,0.08); display: flex; flex-direction: column; gap: 12px')}>
            <div style={css('display: flex; align-items: center; gap: 12px')}>
              <span style={css('width: 28px; height: 28px; border-radius: 50%; background: #EAF0FA; color: #070A10; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800')}>{shown.n}</span>
              <span style={css('font-size: 17px; font-weight: 800')}>{STEP_TITLE[shown.id]}</span>
            </div>
            <div style={css('font-size: 13px; color: #B4BFD2; line-height: 1.5')}>{STEP_INTRO[shown.id]}</div>
            <StepBody id={shown.id} s={s} compact />
            <div style={css('font-size: 12px; color: #A3AEC2; line-height: 1.45')}>Secrets are encrypted at rest and never written to logs, screenshots or flow files.</div>
          </section>
        ) : (
          <section style={css('padding: 18px; border-radius: 24px; border: 1px solid rgba(52,227,203,0.55); background: rgba(52,227,203,0.08); font-size: 14px; line-height: 1.5; color: #C7D0E0')}>All six steps check out against what is really saved.</section>
        )}

        <section style={css('display: flex; flex-direction: column; gap: 8px')}>
          {todo.map((t) => (
            <Link key={t.id} href={`/m/setup?step=${String(t.n)}`} style={css('display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 0 14px; border-radius: 14px; border: 1px dashed rgba(255,255,255,0.18)')}>
              <span style={css('flex: 0 0 22px; height: 22px; border-radius: 50%; border: 2px solid #3A455A; box-sizing: border-box; font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center; color: #8E9BB2')}>{t.n}</span>
              <span style={css('flex: 1; font-size: 14px; color: #C7D0E0; font-weight: 600')}>{t.label}</span>
            </Link>
          ))}
        </section>
      </main>
      <TabBar active="Setup" accent={ACCENT} />
    </div>
  );
}
