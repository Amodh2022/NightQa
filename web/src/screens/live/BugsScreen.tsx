import { connection } from 'next/server';
import Link from 'next/link';
import { AutoRefresh } from '@/components/AutoRefresh';
import { css } from '@/lib/dc';
import { COLORS, VERDICTS, formatDuration, shortStamp } from '@/lib/format';
import { listRuns, type RunView } from '@/lib/results';
import { findingLabel, isFinished, latestPerFlow, shortId, type FinishedRun } from '@/lib/stats';
import Topbar from '../Topbar';
import { MONO, card, emptyCard, eyebrow, h1, lead, main, pageBg } from './ui';

const ACCENT = COLORS.accent;

const BASE =
  'display:block;padding:18px 18px 16px;border-radius:18px;border:1px solid rgba(255,255,255,0.09);background:linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02));box-shadow:inset 0 1px 0 rgba(255,255,255,0.07)';
const HOT = (rgb: string): string =>
  `display:block;padding:18px 18px 16px;border-radius:18px;border:1px solid rgba(${rgb},0.55);background:linear-gradient(180deg,rgba(${rgb},0.13),rgba(${rgb},0.03));box-shadow:0 0 42px -14px rgba(${rgb},0.6),inset 0 1px 0 rgba(255,255,255,0.07)`;
const PANEL = 'padding:16px;border-radius:24px;border:1px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.025)';

interface Col {
  readonly title: string;
  readonly hint: string;
  readonly dot: string;
  readonly hotRgb?: string;
  readonly cta: string;
  readonly runs: FinishedRun[];
  readonly note?: (r: FinishedRun) => string;
}

function summary(r: FinishedRun): string {
  const f = r.result.findings[0];
  const text = f ? f.message : r.result.reason;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Bugs found by real runs, grouped by what the latest run of each flow says. */
export default async function BugsScreen() {
  await connection();
  const runs = await listRuns();
  const latest = [...latestPerFlow(runs).values()];
  const finished = runs.filter(isFinished);
  // a flow that failed before and passes now, newest pass first
  const fixed = latest.filter((l) => l.result.verdict === 'pass' && finished.some((r) => r.flow === l.flow && r.result.verdict === 'bug' && r.startedAt < l.startedAt));
  const cols: Col[] = [
    {
      title: 'Bugs found',
      hint: 'The latest AI run of the flow found a bug. Seen once so far.',
      dot: COLORS.coral,
      hotRgb: '255,107,91',
      cta: 'Open the run',
      runs: latest.filter((r) => r.result.verdict === 'bug' && r.mode === 'ai'),
    },
    {
      title: 'Replay regressions',
      hint: 'A saved test that passed before now fails, after one retry.',
      dot: COLORS.amber,
      hotRgb: '255,193,77',
      cta: 'Open the run',
      runs: latest.filter((r) => r.result.verdict === 'bug' && r.mode === 'replay'),
    },
    {
      title: 'Needs a look',
      hint: 'Could not start, got stuck or the app changed. Not counted as bugs.',
      dot: COLORS.violet,
      cta: 'Open the run',
      runs: latest.filter((r) => ['needs_setup', 'agent_stuck', 'app_changed'].includes(r.result.verdict)),
    },
    {
      title: 'Passing again',
      hint: 'Failed in an earlier run, passes now.',
      dot: ACCENT,
      cta: 'Open the run',
      runs: fixed,
      note: (r) => {
        const bug = finished.find((x) => x.flow === r.flow && x.result.verdict === 'bug' && x.startedAt < r.startedAt);
        return bug ? `Bug on ${shortStamp(bug.startedAt)}, passed on ${shortStamp(r.startedAt)}` : '';
      },
    },
  ];
  const open = cols[0].runs.length + cols[1].runs.length;
  const running = runs.some((r: RunView) => r.status === 'running');

  return (
    <div style={pageBg()}>
      <Topbar active="Bugs" accent={ACCENT} />
      <AutoRefresh active={running} />
      <main style={main()}>
        <header>
          <div style={eyebrow(ACCENT)}>Bugs</div>
          <h1 style={h1}>{open === 0 ? 'No open bugs' : `${String(open)} open ${open === 1 ? 'bug' : 'bugs'}, each with the run that found it`}</h1>
          <div style={lead}>
            Built from your real runs. Each card opens the video, the screenshots and what the agent saw. Reproducing a bug 3 times, the failing test and the GitHub issue are the next
            steps and are not connected yet.
          </div>
        </header>
        {runs.length === 0 ? (
          <div style={emptyCard}>
            <div style={css('font-size: 20px; font-weight: 800')}>No runs yet</div>
            <div style={css('font-size: 14.5px; color: #A3AEC2; max-width: 520px; line-height: 1.5')}>Run a flow from Flows or Runs and the bugs it finds appear here.</div>
          </div>
        ) : (
          <section aria-label="Bug board" style={css('display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 18px; align-items: start')}>
            {cols.map((c) => (
              <div key={c.title} style={css(PANEL)}>
                <div style={css('display: flex; align-items: center; gap: 10px; padding: 4px 4px 0')}>
                  <span style={css(`width: 10px; height: 10px; border-radius: 50%; background: ${c.dot}; box-shadow: 0 0 12px ${c.dot}`)} />
                  <div style={css('font-size: 16px; font-weight: 800')}>{c.title}</div>
                  <span style={css('margin-left: auto; font-size: 12.5px; font-weight: 800; color: #A3AEC2; background: rgba(255,255,255,0.07); padding: 3px 10px; border-radius: 99px')}>{c.runs.length}</span>
                </div>
                <div style={css('font-size: 12.5px; color: #8E9BB2; margin: 8px 4px 14px; line-height: 1.45')}>{c.hint}</div>
                <div style={css('display: flex; flex-direction: column; gap: 12px')}>
                  {c.runs.length === 0 ? <div style={card('padding: 16px; font-size: 13.5px; color: #8E9BB2')}>Nothing here.</div> : null}
                  {c.runs.map((r) => {
                    const m = VERDICTS[r.result.verdict];
                    const kinds = [...new Set(r.result.findings.map((f) => findingLabel(f.kind)))];
                    return (
                      <Link key={r.id} href={`/runs/${r.id}`} style={css(c.hotRgb ? HOT(c.hotRgb) : BASE)}>
                        <div style={css('display: flex; justify-content: space-between; align-items: center; gap: 8px')}>
                          <span style={css(`font-size: 11.5px; font-weight: 800; color: ${m.fg}; background: ${m.bg}; padding: 4px 10px; border-radius: 99px`)}>{r.mode === 'replay' && r.result.verdict === 'bug' ? 'Regression' : m.label}</span>
                          <span style={css(`font-size: 12px; color: #8E9BB2; font-family: ${MONO}`)}>#{shortId(r.id)}</span>
                        </div>
                        <div style={css('font-size: 15.5px; font-weight: 700; margin-top: 12px; line-height: 1.35')}>{summary(r).length > 120 ? `${summary(r).slice(0, 117)}…` : summary(r)}</div>
                        <div style={css('font-size: 12.5px; color: #A3AEC2; margin-top: 6px')}>{c.note?.(r) || `${r.flow} · ${shortStamp(r.startedAt)} · ${formatDuration(r.result.durationSeconds)}`}</div>
                        <div style={css('display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px')}>
                          {kinds.map((k) => (
                            <span key={k} style={css('font-size: 11.5px; font-weight: 700; color: #C7D0E0; background: rgba(255,255,255,0.07); padding: 4px 10px; border-radius: 99px')}>{k}</span>
                          ))}
                        </div>
                        <div style={css(`margin-top: 14px; font-size: 13px; font-weight: 800; color: ${c.hotRgb ? '#FF8A7B' : ACCENT}`)}>{c.cta}</div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        )}
        <div style={css('font-size: 12px; color: #6F7C94')}>Live data from the results folder.</div>
      </main>
    </div>
  );
}
