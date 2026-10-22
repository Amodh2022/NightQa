import Link from 'next/link';
import { connection } from 'next/server';
import { css } from '@/lib/dc';
import { pickStep } from '@/lib/setup-state';
import { eyebrow } from './live/ui';
import { loadState } from './settings/state';
import { STEP_INTRO, STEP_TITLE, StepBody } from './setup/StepBody';
import Topbar from './Topbar';

const ACCENT = '#34E3CB';
const NEXT = ['NightQA runs your flows on staging.', 'Anything suspicious is replayed 3 times before it is reported.', 'You get one short report with proven bugs and links.'];

/** Setup, live: the checklist, progress and time left are computed from what is really saved. */
export default async function Setup({ step }: { step?: string }) {
  await connection();
  const s = await loadState();
  const { setup } = s;
  const shown = pickStep(setup, step);
  const total = setup.steps.length;
  const pct = Math.round((setup.doneCount / total) * 100);
  const complete = setup.current === undefined;
  return (
    <div style={css("min-height: 100vh; font-family: 'Manrope', system-ui, sans-serif; color: #EAF0FA; background: radial-gradient(1000px 520px at 15% -120px, rgba(52,227,203,0.16), transparent 62%), radial-gradient(800px 520px at 94% 30%, rgba(139,124,255,0.12), transparent 62%), #070A10")}>
      <Topbar active="Setup" accent={ACCENT} />
      <main style={css('max-width: 1240px; margin: 0 auto; box-sizing: border-box; padding: 40px 40px 64px; display: flex; flex-direction: column; gap: 32px')}>
        <header>
          <div style={eyebrow(ACCENT)}>Setup · {complete ? 'all steps done' : `${String(setup.doneCount)} of ${String(total)} done`}</div>
          <h1 style={css('margin: 8px 0 0; font-size: 46px; line-height: 1.05; font-weight: 800; letter-spacing: -1.8px')}>
            {complete ? 'Setup is complete' : `Your first report in about ${String(setup.minutesLeft)} minutes`}
          </h1>
          {s.readOnly ? <div style={css('margin-top: 10px; font-size: 14px; color: #FFC14D; font-weight: 700')}>Your account is view-only. Setup shows real progress but you cannot change anything.</div> : null}
        </header>
        <div style={css('display: flex; flex-wrap: wrap; gap: 32px; align-items: flex-start')}>
          <nav aria-label="Setup steps" style={css('flex: 0 0 300px; display: flex; flex-direction: column')}>
            {setup.steps.map((st, i) => {
              const here = st.n === shown?.n;
              const dot = st.done
                ? `background: ${ACCENT}; color: #03211D`
                : here
                  ? 'background: #EAF0FA; color: #070A10; box-shadow: 0 0 0 6px rgba(255,255,255,0.12), 0 0 28px rgba(255,255,255,0.5)'
                  : 'border: 2px solid #3A455A; color: #8E9BB2';
              return (
                <Link key={st.id} href={`/setup?step=${String(st.n)}`} aria-current={here ? 'step' : undefined} style={css('display: flex; gap: 16px; align-items: stretch')}>
                  <div style={css('display: flex; flex-direction: column; align-items: center; width: 30px; flex: 0 0 30px')}>
                    <span style={css(`width: 30px; height: 30px; border-radius: 50%; box-sizing: border-box; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; ${dot}`)}>{st.done ? '✓' : String(st.n)}</span>
                    <span style={css(i === total - 1 ? 'display: none' : `flex: 1; width: 2px; margin-top: 4px; min-height: 22px; background: ${st.done ? ACCENT : 'rgba(255,255,255,0.12)'}`)} />
                  </div>
                  <div style={css('padding-bottom: 22px')}>
                    <div style={css(`font-size: 15.5px; font-weight: ${here ? '800' : '700'}; color: ${st.done || here ? '#FFFFFF' : '#A3AEC2'}`)}>{st.label}</div>
                    <div style={css('font-size: 12.5px; color: #8E9BB2; margin-top: 3px')}>{st.note}</div>
                  </div>
                </Link>
              );
            })}
          </nav>

          <section style={css('flex: 1 1 480px; min-width: 0; padding: 32px 34px; border-radius: 28px; border: 1px solid rgba(52,227,203,0.5); background: linear-gradient(180deg, rgba(52,227,203,0.09), rgba(255,255,255,0.015)); box-shadow: 0 0 90px -28px rgba(52,227,203,0.6), inset 0 1px 0 rgba(255,255,255,0.09)')}>
            {shown ? (
              <>
                <div style={css('font-size: 26px; font-weight: 800; letter-spacing: -0.8px')}>{STEP_TITLE[shown.id]}</div>
                <div style={css('font-size: 14.5px; color: #B4BFD2; margin-top: 8px; margin-bottom: 24px; line-height: 1.55; max-width: 560px')}>{STEP_INTRO[shown.id]}</div>
                {shown.done ? <div style={css(`font-size: 13px; font-weight: 800; color: ${ACCENT}; margin-bottom: 16px`)}>This step is done: {shown.note}.</div> : null}
                <StepBody id={shown.id} s={s} />
                <div style={css('display: flex; align-items: center; gap: 12px; margin-top: 22px; padding: 14px 16px; border-radius: 14px; background: rgba(52,227,203,0.08); border: 1px solid rgba(52,227,203,0.3); font-size: 13.5px; color: #C7D0E0; line-height: 1.45')}>
                  <span style={css(`width: 18px; height: 13px; border: 2px solid ${ACCENT}; border-radius: 4px; flex: 0 0 auto; box-sizing: content-box`)} />
                  Secrets are encrypted at rest and never written to logs, screenshots or flow files.
                </div>
                <div style={css('display: flex; gap: 12px; margin-top: 22px; flex-wrap: wrap')}>
                  {shown.n > 1 ? <Link href={`/setup?step=${String(shown.n - 1)}`} style={css('min-height: 54px; padding: 0 26px; box-sizing: border-box; border-radius: 16px; border: 1px solid rgba(255,255,255,0.18); display: inline-flex; align-items: center; font-size: 15px; font-weight: 700')}>Back</Link> : null}
                  {shown.n < total ? <Link href={`/setup?step=${String(shown.n + 1)}`} style={css(`min-height: 54px; padding: 0 32px; box-sizing: border-box; border-radius: 16px; background: ${ACCENT}; color: #03211D; display: inline-flex; align-items: center; font-size: 16px; font-weight: 800`)}>{shown.done ? 'Continue' : 'Skip for now'}</Link> : null}
                </div>
              </>
            ) : (
              <>
                <div style={css('font-size: 26px; font-weight: 800; letter-spacing: -0.8px')}>Everything is set up</div>
                <div style={css('font-size: 14.5px; color: #B4BFD2; margin-top: 8px; line-height: 1.55')}>All six steps check out against what is really saved. Runs appear on the Runs page.</div>
                <div style={css('margin-top: 22px')}><Link href="/runs" style={css(`min-height: 54px; padding: 0 32px; box-sizing: border-box; border-radius: 16px; background: ${ACCENT}; color: #03211D; display: inline-flex; align-items: center; font-size: 16px; font-weight: 800`)}>See runs</Link></div>
              </>
            )}
          </section>

          <aside style={css('flex: 1 1 300px; min-width: 0; display: flex; flex-direction: column; gap: 20px')}>
            <div style={css('padding: 26px; border-radius: 26px; border: 1px solid rgba(255,255,255,0.1); background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.016)); box-shadow: inset 0 1px 0 rgba(255,255,255,0.08); text-align: center')}>
              <div style={css(`position: relative; width: 150px; height: 150px; margin: 0 auto; border-radius: 50%; background: conic-gradient(${ACCENT} 0 ${String(pct)}%, rgba(255,255,255,0.1) ${String(pct)}% 100%); box-shadow: 0 0 60px -10px rgba(52,227,203,0.55)`)}>
                <div style={css('position: absolute; inset: 14px; border-radius: 50%; background: #0B1019; display: flex; flex-direction: column; align-items: center; justify-content: center')}>
                  <div style={css('font-size: 34px; font-weight: 800; letter-spacing: -1.2px')}>{complete ? 'Done' : `${String(setup.minutesLeft)} min`}</div>
                  <div style={css('font-size: 12px; color: #A3AEC2')}>{complete ? 'all steps' : 'to first report'}</div>
                </div>
              </div>
              <div style={css('font-size: 13px; color: #A3AEC2; margin-top: 16px; line-height: 1.5')}>
                {setup.doneCount} of {total} steps are done. The time is an estimate from typical step times, for the steps still open.
              </div>
            </div>
            <div style={css('padding: 22px 24px; border-radius: 22px; border: 1px solid rgba(255,255,255,0.09); background: rgba(255,255,255,0.03)')}>
              <div style={css('font-size: 15px; font-weight: 800; margin-bottom: 12px')}>What happens at the end</div>
              {NEXT.map((t) => (
                <div key={t} style={css('display: flex; gap: 12px; padding: 9px 0; font-size: 13.5px; color: #C7D0E0; line-height: 1.45')}>
                  <span style={css(`flex: 0 0 8px; width: 8px; height: 8px; border-radius: 50%; background: ${ACCENT}; margin-top: 6px; box-shadow: 0 0 10px ${ACCENT}`)} />
                  {t}
                </div>
              ))}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
