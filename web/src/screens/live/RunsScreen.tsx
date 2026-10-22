import { connection } from 'next/server';
import { currentViewer } from '@/lib/auth/server';
import Link from 'next/link';
import { AutoRefresh } from '@/components/AutoRefresh';
import { RunNowMenu } from '@/components/RunNowMenu';
import { css } from '@/lib/dc';
import { listFlows } from '@/lib/flows';
import { COLORS, VERDICTS, VERDICT_ORDER, dayKey, formatClock, formatDuration, formatUsd, hostLabel, plural, relativeDay } from '@/lib/format';
import { listRuns, verdictSchema, type RunView, type Verdict } from '@/lib/results';
import { costByDay, groupByDay, isFinished, stepTicks, verdictCounts } from '@/lib/stats';
import Topbar from '../Topbar';
import { FONT, MONO, card, emptyCard, eyebrow, h1, lead, main, pageBg } from './ui';

const ACCENT = COLORS.accent;
const TICK: Record<string, string> = { o: ACCENT, b: COLORS.coral, v: COLORS.violet, s: COLORS.grey, a: COLORS.blue };

function tickBar(r: RunView): string {
  return r.result ? stepTicks(r.result) : 'i';
}

function howText(r: RunView): string {
  if (r.status === 'running') return 'Running now';
  if (r.status === 'crashed') return 'Did not finish';
  if (r.mode === 'replay') return 'Replay, no AI';
  if (r.result?.verdict === 'needs_setup') return 'Could not start';
  if (r.result?.verdict === 'agent_stuck') return r.result.reason.includes('Budget') ? 'Budget reached' : 'Agent stuck';
  return `AI-assisted · ${plural(r.result?.steps ?? 0, 'step')}`;
}

const FILTERS: { label: string; value: string }[] = [
  { label: 'All runs', value: 'all' },
  ...VERDICT_ORDER.map((v) => ({ label: VERDICTS[v].label, value: v })),
];

/** Every run, grouped by night, with the verdict mix and the AI cost per night. Reads the results folder. */
export default async function RunsScreen({ filter }: { filter: string }) {
  await connection();
  const canRun = (await currentViewer())?.role === 'member';
  const now = new Date();
  const [all, flows] = await Promise.all([listRuns(), listFlows()]);
  const parsed = verdictSchema.safeParse(filter);
  const verdict: Verdict | undefined = parsed.success ? parsed.data : undefined;
  const shown = verdict ? all.filter((r) => r.result?.verdict === verdict) : all;

  const week = all.filter((r) => now.getTime() - r.startedAt.getTime() < 7 * 86_400_000);
  const finishedWeek = week.filter(isFinished);
  const noAi = finishedWeek.filter((r) => r.mode === 'replay').length;
  const aiRuns = finishedWeek.length - noAi;
  const noAiPct = finishedWeek.length ? Math.round((noAi / finishedWeek.length) * 100) : 0;
  const counts = verdictCounts(week);
  const nights = costByDay(all, now, 7);
  const maxCost = Math.max(0.01, ...nights.map((n) => n.usd));
  const running = all.some((r) => r.status === 'running');
  const choices = flows.filter((f) => !f.error).map((f) => ({ file: f.file, name: f.name, hasSavedTest: f.hasSavedTest }));

  return (
    <div style={pageBg()}>
      <Topbar active="Runs" accent={ACCENT} />
      <AutoRefresh active={running} />
      <main style={main()}>
        <header style={css('display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 18px')}>
          <div>
            <div style={eyebrow(ACCENT)}>Runs</div>
            <h1 style={h1}>Every night, on the record</h1>
            <div style={lead}>
              {finishedWeek.length === 0
                ? 'No runs yet. Press Run now to test a flow.'
                : `${plural(finishedWeek.length, 'run')} in the last 7 days. ${plural(noAi, 'replay')} used no AI, so they cost nothing.`}
            </div>
          </div>
          <RunNowMenu flows={choices} accent={ACCENT} readOnly={!canRun} />
        </header>

        <section aria-label="Week summary" style={css('display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 18px')}>
          <div style={card('padding: 24px; display: flex; align-items: center; gap: 22px')}>
            <div
              role="img"
              aria-label={`${String(noAiPct)} percent of runs used no AI`}
              style={css(
                `position: relative; width: 120px; height: 120px; border-radius: 50%; flex: 0 0 auto; background: conic-gradient(${ACCENT} 0 ${String(noAiPct)}%, ${COLORS.violet} ${String(noAiPct)}% 100%); box-shadow: 0 0 50px -10px rgba(52,227,203,0.5)${finishedWeek.length === 0 ? '; opacity: 0.35' : ''}`,
              )}
            >
              <div style={css('position: absolute; inset: 14px; border-radius: 50%; background: #0B1019; display: flex; flex-direction: column; align-items: center; justify-content: center')}>
                <div style={css('font-size: 26px; font-weight: 800; letter-spacing: -1px')}>{String(noAiPct)}%</div>
                <div style={css('font-size: 11px; color: #A3AEC2')}>no AI</div>
              </div>
            </div>
            <div style={css('display: flex; flex-direction: column; gap: 8px; font-size: 13.5px')}>
              <div><b style={{ color: ACCENT }}>{noAi}</b> replays, no AI calls</div>
              <div><b style={{ color: '#B9A6FF' }}>{aiRuns}</b> AI-assisted runs</div>
              <div style={css('color: #8E9BB2; font-size: 12.5px')}>Replays only wake the AI when something changes.</div>
            </div>
          </div>

          <div style={card('padding: 24px')}>
            <div style={css('font-size: 14px; font-weight: 800')}>Verdicts this week</div>
            <div style={css('display: flex; height: 16px; border-radius: 99px; overflow: hidden; gap: 3px; margin: 18px 0 16px')}>
              {finishedWeek.length === 0 ? <div style={css('flex: 1; background: rgba(255,255,255,0.08); border-radius: 99px')} /> : null}
              {VERDICT_ORDER.filter((v) => counts[v] > 0).map((v) => (
                <div key={v} style={css(`height: 100%; border-radius: 99px; flex: ${String(counts[v])}; background: ${VERDICTS[v].color}`)} />
              ))}
            </div>
            <div style={css('display: flex; flex-wrap: wrap; gap: 8px 20px; font-size: 13px; color: #C7D0E0')}>
              {VERDICT_ORDER.map((v) => (
                <span key={v} style={css('display: inline-flex; align-items: center; gap: 8px')}>
                  <span style={css(`width: 10px; height: 10px; border-radius: 50%; background: ${VERDICTS[v].color}; box-shadow: 0 0 8px ${VERDICTS[v].color}`)} />
                  {VERDICTS[v].label} <b>{counts[v]}</b>
                </span>
              ))}
            </div>
          </div>

          <div style={card('padding: 24px')}>
            <div style={css('display: flex; justify-content: space-between; align-items: baseline')}>
              <div style={css('font-size: 14px; font-weight: 800')}>AI cost per night</div>
              <div style={css('font-size: 12.5px; color: #8E9BB2')}>7 nights</div>
            </div>
            <div style={css('display: flex; align-items: flex-end; gap: 10px; height: 78px; margin-top: 16px')}>
              {nights.map((n, i) => (
                <div key={n.key} style={css('flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; justify-content: flex-end; height: 100%')}>
                  <div
                    title={`${n.key}: ${formatUsd(n.usd)}`}
                    style={css(
                      `width: 100%; max-width: 26px; border-radius: 6px 6px 2px 2px; height: ${String(Math.max(3, Math.round((n.usd / maxCost) * 52)))}px; background: ${i === 6 ? ACCENT : 'rgba(139,124,255,0.55)'}${i === 6 ? '; box-shadow: 0 0 18px rgba(52,227,203,0.5)' : ''}`,
                    )}
                  />
                  <div style={css(`font-size: 10.5px; color: #8E9BB2; font-family: ${MONO}`)}>{formatUsd(n.usd)}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <nav aria-label="Filter runs" style={css('display: flex; flex-wrap: wrap; gap: 10px')}>
          {FILTERS.map((f) => {
            const on = (verdict ?? 'all') === f.value;
            return (
              <Link
                key={f.value}
                href={f.value === 'all' ? '/runs' : `/runs?v=${f.value}`}
                aria-current={on ? 'true' : undefined}
                style={css(
                  `min-height: 44px; box-sizing: border-box; display: inline-flex; align-items: center; padding: 0 18px; border-radius: 99px; font-family: ${FONT}; font-size: 13.5px; font-weight: 700; border: 1px solid ${on ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.09)'}; background: ${on ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)'}; color: ${on ? '#FFFFFF' : '#A3AEC2'}`,
                )}
              >
                {f.label}
              </Link>
            );
          })}
        </nav>

        {shown.length === 0 ? (
          <div style={emptyCard}>
            <div style={css('font-size: 20px; font-weight: 800')}>{all.length === 0 ? 'No runs yet' : `No ${verdict ? VERDICTS[verdict].label.toLowerCase() : ''} runs`}</div>
            <div style={css('font-size: 14.5px; color: #A3AEC2; max-width: 520px; line-height: 1.5')}>
              {all.length === 0
                ? 'Press Run now, pick a flow, and the agent will test your staging app in a real browser. The result, video and trace show up here.'
                : 'Try another filter.'}
            </div>
          </div>
        ) : (
          <section aria-label="Runs" style={css('display: flex; flex-direction: column; gap: 10px')}>
            {groupByDay(shown).map((g) => (
              <div key={g.key} style={css('display: flex; flex-direction: column; gap: 10px; margin-top: 12px')}>
                <div style={css('font-size: 13px; font-weight: 800; letter-spacing: 0.4px; color: #A3AEC2; text-transform: uppercase')}>{relativeDay(g.date, now)}</div>
                {g.runs.map((r) => {
                  const meta = r.result ? VERDICTS[r.result.verdict] : undefined;
                  const label = r.status === 'running' ? 'Running' : r.status === 'crashed' ? 'Did not finish' : (meta?.label ?? '');
                  const fg = r.status === 'running' ? '#8DB8FF' : (meta?.fg ?? '#B4BFD2');
                  const bg = r.status === 'running' ? 'rgba(106,166,255,0.18)' : (meta?.bg ?? 'rgba(142,155,178,0.2)');
                  const cost = r.result?.cost.usd ?? 0;
                  return (
                    <Link
                      key={r.id}
                      href={`/runs/${r.id}`}
                      style={css(
                        'display: flex; flex-wrap: wrap; align-items: center; gap: 14px 24px; padding: 18px 24px; border-radius: 18px; background: linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.014)); border: 1px solid rgba(255,255,255,0.08); box-shadow: inset 0 1px 0 rgba(255,255,255,0.05)',
                      )}
                    >
                      <div style={css('flex: 0 0 74px')}>
                        <div style={css(`font-family: ${MONO}; font-size: 14px; font-weight: 500`)}>{formatClock(r.startedAt)}</div>
                        <div style={css('font-size: 12px; color: #8E9BB2; margin-top: 3px')}>{r.result ? formatDuration(r.result.durationSeconds) : '…'}</div>
                      </div>
                      <div style={css('flex: 1 1 260px; min-width: 0')}>
                        <div style={css('font-size: 16px; font-weight: 800; letter-spacing: -0.2px')}>{r.flow}</div>
                        <div style={css('font-size: 12.5px; color: #8E9BB2; margin-top: 4px')}>Chrome · {hostLabel(r.result?.url ?? '')}</div>
                      </div>
                      <div aria-hidden="true" style={css('flex: 1 1 160px; display: flex; gap: 4px; min-width: 120px')}>
                        {tickBar(r).split('').map((c, i) => (
                          <span key={`${r.id}-${String(i)}`} style={css(`flex: 1; height: 8px; border-radius: 99px; background: ${TICK[c] ?? 'rgba(255,255,255,0.1)'}`)} />
                        ))}
                      </div>
                      <span style={css(`flex: 0 0 auto; min-width: 104px; text-align: center; box-sizing: border-box; font-size: 12.5px; font-weight: 800; color: ${fg}; background: ${bg}; padding: 7px 14px; border-radius: 99px`)}>{label}</span>
                      <div style={css(`flex: 0 0 70px; text-align: right; font-family: ${MONO}; font-size: 14px; font-weight: 500; color: ${cost === 0 ? '#8E9BB2' : '#EAF0FA'}`)}>{formatUsd(cost)}</div>
                      <div style={css('flex: 0 0 150px; font-size: 13px; color: #A3AEC2')}>{howText(r)}</div>
                    </Link>
                  );
                })}
              </div>
            ))}
          </section>
        )}
        <div style={css('font-size: 12px; color: #6F7C94')}>Live data from {dayKey(now)}: read from the results folder every time you open this page.</div>
      </main>
    </div>
  );
}
