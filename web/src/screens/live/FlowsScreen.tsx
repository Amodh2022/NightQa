import { connection } from 'next/server';
import { currentViewer } from '@/lib/auth/server';
import Link from 'next/link';
import { AutoRefresh } from '@/components/AutoRefresh';
import { RunFlowButtons } from '@/components/RunFlowButtons';
import { css } from '@/lib/dc';
import { COLORS, VERDICTS, plural, shortStamp } from '@/lib/format';
import { listFlows } from '@/lib/flows';
import { listRuns } from '@/lib/results';
import { isFinished } from '@/lib/stats';
import Topbar from '../Topbar';
import { emptyCard, eyebrow, h1, lead, main, pageBg } from './ui';

const ACCENT = COLORS.accent;
const BASE =
  'padding:22px 22px 20px;border-radius:22px;border:1px solid rgba(255,255,255,0.09);background:linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018));box-shadow:inset 0 1px 0 rgba(255,255,255,0.07),0 24px 48px -28px rgba(0,0,0,0.9);display:flex;flex-direction:column';
const BUG =
  'padding:22px 22px 20px;border-radius:22px;border:1px solid rgba(255,107,91,0.55);background:linear-gradient(180deg,rgba(255,107,91,0.12),rgba(255,107,91,0.03));box-shadow:0 0 50px -16px rgba(255,107,91,0.6),inset 0 1px 0 rgba(255,255,255,0.07);display:flex;flex-direction:column';

/** Every flow file in flows/, with its latest results and buttons to run it. */
export default async function FlowsScreen() {
  await connection();
  const canRun = (await currentViewer())?.role === 'member';
  const [flows, runs] = await Promise.all([listFlows(), listRuns()]);
  const running = runs.some((r) => r.status === 'running');
  const critical = flows.filter((f) => f.tags.includes('critical')).length;

  return (
    <div style={pageBg()}>
      <Topbar active="Flows" accent={ACCENT} />
      <AutoRefresh active={running} />
      <main style={main()}>
        <header style={css('display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 18px')}>
          <div>
            <div style={eyebrow(ACCENT)}>Flows</div>
            <h1 style={h1}>Say what users do. NightQA checks it nightly.</h1>
            <div style={lead}>
              {plural(flows.length, 'flow')} · {critical} tagged critical · written in plain language, saved in your repo (flows/).
            </div>
          </div>
          <div style={css('display: flex; gap: 10px; flex-wrap: wrap')}>
            <Link href="/import" style={css('min-height: 50px; box-sizing: border-box; padding: 0 22px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.05); display: inline-flex; align-items: center; font-size: 15px; font-weight: 700')}>
              Import Excel or CSV
            </Link>
            <Link href="/editor" style={css(`min-height: 50px; box-sizing: border-box; padding: 0 24px; border-radius: 14px; background: ${ACCENT}; color: #03211D; display: inline-flex; align-items: center; font-size: 15px; font-weight: 800; box-shadow: 0 10px 36px -8px rgba(52,227,203,0.7)`)}>
              New flow
            </Link>
          </div>
        </header>

        {flows.length === 0 ? (
          <div style={emptyCard}>
            <div style={css('font-size: 20px; font-weight: 800')}>No flows yet</div>
            <div style={css('font-size: 14.5px; color: #A3AEC2; max-width: 520px; line-height: 1.5')}>Add a YAML file to the flows/ folder, for example flows/checkout.yaml, and it shows up here.</div>
          </div>
        ) : (
          <section aria-label="All flows" style={css('display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 18px')}>
            {flows.map((f) => {
              const mine = runs.filter((r) => r.flow === f.name && isFinished(r));
              const last = mine[0];
              const verdict = last?.result?.verdict;
              const m = verdict ? VERDICTS[verdict] : undefined;
              const dots = [...mine.slice(0, 7)].reverse();
              return (
                <div key={f.file} style={css(verdict === 'bug' ? BUG : BASE)}>
                  <div style={css('display: flex; justify-content: space-between; align-items: center; gap: 8px')}>
                    <div style={css('display: flex; gap: 6px; flex-wrap: wrap')}>
                      {f.tags.map((t) => (
                        <span key={t} style={css('font-size: 11.5px; font-weight: 700; color: #A3AEC2; background: rgba(255,255,255,0.07); padding: 4px 10px; border-radius: 99px')}>{t}</span>
                      ))}
                    </div>
                    <span style={css(`flex: 0 0 auto; font-size: 12px; font-weight: 800; color: ${m?.fg ?? '#B4BFD2'}; background: ${m?.bg ?? 'rgba(255,255,255,0.07)'}; padding: 5px 12px; border-radius: 99px`)}>{m?.label ?? 'Not run yet'}</span>
                  </div>
                  <div style={css('font-size: 20px; font-weight: 800; letter-spacing: -0.5px; margin-top: 18px; line-height: 1.2')}>
                    {last ? <Link href={`/runs/${last.id}`}>{f.name}</Link> : f.name}
                  </div>
                  <div style={css('font-size: 13px; color: #A3AEC2; margin-top: 6px')}>
                    {f.error ? `Cannot read this file: ${f.error}` : `${plural(f.steps, 'step')} · ${plural(f.expectations, 'expectation')} · ${plural(f.variations, 'variation')}`}
                  </div>
                  <div style={css('font-size: 12px; color: #6F7C94; margin-top: 4px')}>{f.file}</div>
                  <div style={css('margin-top: 20px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.07)')}>
                    <div style={css('display: flex; justify-content: space-between; align-items: center')}>
                      <span style={css('font-size: 12px; color: #8E9BB2; font-weight: 700')}>{dots.length <= 1 ? 'Last run' : `Last ${String(dots.length)} runs`}</span>
                      <span style={css('font-size: 12px; color: #8E9BB2')}>{last ? `${m?.label ?? ''} · ${shortStamp(last.startedAt)}` : 'No runs yet'}</span>
                    </div>
                    <div aria-hidden="true" style={css('display: flex; gap: 6px; margin-top: 10px')}>
                      {dots.length === 0 ? <span style={css('flex: 1; height: 10px; border-radius: 99px; background: rgba(255,255,255,0.1)')} /> : null}
                      {dots.map((d) => {
                        const v = d.result?.verdict;
                        const c = v ? VERDICTS[v].color : COLORS.grey;
                        return <span key={d.id} style={css(`flex: 1; height: 10px; border-radius: 99px; background: ${c}${v === 'pass' ? '; opacity: 0.75' : `; box-shadow: 0 0 12px ${c}`}`)} />;
                      })}
                    </div>
                  </div>
                  {!f.error ? (
                    <div style={css('margin-top: 18px')}>
                      <RunFlowButtons flow={{ file: f.file, name: f.name, hasSavedTest: f.hasSavedTest }} readOnly={!canRun} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </section>
        )}
        <div style={css('font-size: 12px; color: #6F7C94')}>Live from the flows/ folder. Creating and editing flows in the browser is not connected yet.</div>
      </main>
    </div>
  );
}
