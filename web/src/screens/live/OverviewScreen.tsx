import { connection } from 'next/server';
import { currentViewer } from '@/lib/auth/server';
import Link from 'next/link';
import { AutoRefresh } from '@/components/AutoRefresh';
import { RunNowMenu } from '@/components/RunNowMenu';
import { css } from '@/lib/dc';
import { listFlows } from '@/lib/flows';
import { COLORS, VERDICTS, VERDICT_ORDER, formatClock, formatUsd, longDay, plural, startOfDay } from '@/lib/format';
import { listRuns, type Verdict } from '@/lib/results';
import { costByDay, countByDay, groupByDay, isFinished, latestPerFlow, shortId, type FinishedRun } from '@/lib/stats';
import Topbar from '../Topbar';
import { FONT, MONO, card, main } from './ui';

const ACCENT = COLORS.accent;

// Star positions and links from the design's constellation (viewBox 760 x 340).
const NODES: [number, number, number][] = [
  [380, 170, 12], [470, 105, 7], [505, 205, 7], [435, 265, 7], [295, 115, 7], [325, 270, 8], [215, 75, 6], [130, 105, 7],
  [195, 185, 7], [105, 235, 6], [560, 145, 7], [615, 68, 7], [685, 125, 6], [620, 262, 8], [690, 215, 6], [520, 305, 6],
];
const EDGES: [number, number][] = [
  [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [4, 6], [6, 7], [7, 8], [8, 9], [4, 8], [1, 10], [10, 11], [11, 12], [10, 12], [2, 13], [13, 14], [3, 15], [15, 13],
];

const IDLE = 'rgba(255,255,255,0.38)';
const spark = (arr: readonly number[]): string => {
  const max = Math.max(...arr, 0);
  return arr.map((v, i) => `${(i * (96 / Math.max(1, arr.length - 1))).toFixed(1)},${(34 - (max === 0 ? 0 : (v / max) * 30)).toFixed(1)}`).join(' ');
};

interface Star { name: string; verdict: Verdict | 'idle'; href?: string }

const rank = (v: Star['verdict']): number => ({ bug: 0, needs_setup: 1, agent_stuck: 2, app_changed: 3, pass: 4, idle: 5 })[v];

/** The morning view: what the latest night found, built from the real results folder. */
export default async function OverviewScreen() {
  await connection();
  const canRun = (await currentViewer())?.role === 'member';
  const now = new Date();
  const [runs, flows] = await Promise.all([listRuns(), listFlows()]);
  const finished = runs.filter(isFinished);
  const latestFlows = latestPerFlow(runs);
  const night = groupByDay(finished)[0];
  const nightRuns = night ? [...night.runs].filter(isFinished).sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime()) : [];
  const running = runs.some((r) => r.status === 'running');
  const choices = flows.filter((f) => !f.error).map((f) => ({ file: f.file, name: f.name, hasSavedTest: f.hasSavedTest }));

  const nightFlows = new Map<string, FinishedRun>();
  for (const r of nightRuns) nightFlows.set(r.flow, r); // chronological, so the last run per flow wins
  const verdicts = [...nightFlows.values()].map((r) => r.result.verdict);
  const bugs = nightRuns.filter((r) => r.result.verdict === 'bug').length; // every bug run counts, even if a later run of the flow passed
  const passed = verdicts.filter((v) => v === 'pass').length;
  const attention = verdicts.filter((v) => v === 'needs_setup' || v === 'agent_stuck' || v === 'app_changed').length;
  const replays = nightRuns.filter((r) => r.mode === 'replay').length;
  const nightCost = nightRuns.reduce((s, r) => s + r.result.cost.usd, 0);
  const when = !night ? '' : startOfDay(now).getTime() === night.date.getTime() ? 'today' : startOfDay(now).getTime() - night.date.getTime() === 86_400_000 ? 'yesterday' : `on ${longDay(night.date)}`;
  const firstBug = nightRuns.find((r) => r.result.verdict === 'bug');
  const latest = finished[0];

  const line1 = !night ? 'No runs yet.' : bugs > 0 ? `${plural(bugs, 'bug')} found ${when}.` : attention > 0 ? `No bugs found ${when}.` : `All ${plural(nightFlows.size, 'flow')} passed ${when}.`;
  const line2 = !night ? 'Run your first flow.' : bugs > 0 ? 'Start with the failing run.' : attention > 0 ? `${plural(attention, 'flow')} need${attention === 1 ? 's' : ''} a look.` : 'Nothing needs you.';

  // timeline
  type Ev = { at: number; color: string; text: string };
  const evs: Ev[] = [];
  const first = nightRuns[0];
  if (first) evs.push({ at: first.startedAt.getTime(), color: COLORS.blue, text: 'Run started' });
  for (const r of nightRuns) {
    const end = r.startedAt.getTime() + r.result.durationSeconds * 1000;
    if (r.result.verdict === 'bug') evs.push({ at: end, color: COLORS.coral, text: `Bug found: ${r.flow}` });
    else if (r.result.verdict === 'needs_setup') evs.push({ at: end, color: COLORS.violet, text: `Needs setup: ${r.flow}` });
    else if (r.result.verdict === 'agent_stuck') evs.push({ at: end, color: COLORS.grey, text: `Agent stuck: ${r.flow}` });
  }
  const lastRun = nightRuns[nightRuns.length - 1];
  const lastEnd = lastRun ? lastRun.startedAt.getTime() + lastRun.result.durationSeconds * 1000 : 0;
  if (lastRun) evs.push({ at: lastEnd, color: '#EAF0FA', text: 'Last run finished' });
  evs.sort((a, b) => a.at - b.at);
  const shownEvs = evs.slice(0, 8);
  const lo0 = first ? first.startedAt.getTime() : 0;
  const span0 = Math.max(lastEnd - lo0, 60_000);
  const lo = lo0 - span0 * 0.04;
  const span = span0 * 1.08;
  const pct = (t: number): number => Math.min(98, Math.max(2, ((t - lo) / span) * 100));
  const bars = Array.from({ length: 100 }, (_, i) => {
    const t0 = lo + (i / 100) * span;
    const t1 = lo + ((i + 1) / 100) * span;
    const active = nightRuns.some((r) => r.startedAt.getTime() < t1 && r.startedAt.getTime() + r.result.durationSeconds * 1000 >= t0);
    const hot = shownEvs.some((e) => e.at >= t0 && e.at < t1);
    const base = 8 + 20 * Math.abs(Math.sin(i * 0.37) + 0.55 * Math.sin(i * 0.91)) * (active ? 1 : 0.35);
    return { h: Math.round(Math.min(50, base + (hot ? 22 : 0))), a: (active ? 0.45 : 0.2) + (hot ? 0.4 : 0) };
  });

  // KPIs
  const weekPass = countByDay(runs, now, (r) => r.result.verdict === 'pass');
  const weekBug = countByDay(runs, now, (r) => r.result.verdict === 'bug');
  const weekReplay = countByDay(runs, now, (r) => r.mode === 'replay');
  const weekCost = costByDay(runs, now, 7).map((d) => d.usd);
  const weekFinished = finished.filter((r) => now.getTime() - r.startedAt.getTime() < 7 * 86_400_000);
  const replayPct = weekFinished.length ? Math.round((weekFinished.filter((r) => r.mode === 'replay').length / weekFinished.length) * 100) : 0;
  const latestList = [...latestFlows.values()];
  const kpis = [
    { label: 'Flows passing now', value: latestList.length ? `${String(latestList.filter((r) => r.result.verdict === 'pass').length)}/${String(latestList.length)}` : '—', note: 'Latest run of each flow', color: ACCENT, line: spark(weekPass) },
    { label: 'Bugs found, 7 days', value: String(weekBug.reduce((a, b) => a + b, 0)), note: 'Runs that ended as a bug', color: COLORS.coral, line: spark(weekBug) },
    { label: 'Runs with no AI', value: weekFinished.length ? `${String(replayPct)}%` : '—', note: 'Replays are free and fast', color: COLORS.blue, line: spark(weekReplay) },
    { label: night ? 'AI cost, latest night' : 'AI cost', value: formatUsd(nightCost), note: `${plural(replays, 'replay')} used no AI calls`, color: COLORS.violet, line: spark(weekCost) },
  ];

  // constellation
  const stars: Star[] = [
    ...[...latestFlows.values()].map((r) => ({ name: r.flow, verdict: r.result.verdict, href: `/runs/${r.id}` })),
    ...flows.filter((f) => !f.error && !latestFlows.has(f.name)).map((f): Star => ({ name: f.name, verdict: 'idle' })),
  ].sort((a, b) => rank(a.verdict) - rank(b.verdict) || a.name.localeCompare(b.name));
  const placed = stars.slice(0, NODES.length);
  const colorOf = (v: Star['verdict']): string => (v === 'idle' ? IDLE : VERDICTS[v].color);
  const keyCounts = VERDICT_ORDER.map((v) => ({ v, n: stars.filter((s) => s.verdict === v).length })).filter((k) => k.n > 0);
  const idleCount = stars.filter((s) => s.verdict === 'idle').length;

  // needs you
  const needs = latestList.filter((r) => r.result.verdict !== 'pass').sort((a, b) => rank(a.result.verdict) - rank(b.result.verdict)).slice(0, 3);

  return (
    <div style={css(`min-height: 100vh; font-family: ${FONT}; color: #EAF0FA; background: radial-gradient(1000px 520px at 82% -120px, rgba(52,227,203,0.15), transparent 62%), radial-gradient(760px 520px at 2% 18%, rgba(139,124,255,0.11), transparent 62%), #070A10`)}>
      <Topbar active="Overview" accent={ACCENT} />
      <AutoRefresh active={running} />
      <main style={main()}>
        <section style={card('position: relative; padding: 40px 44px 34px')}>
          <div aria-hidden="true" style={css('position: absolute; inset: 0; border-radius: 22px; overflow: hidden')}>
            <div style={css(`position: absolute; right: -70px; top: -90px; width: 340px; height: 340px; border-radius: 50%; background: radial-gradient(circle at 34% 32%, #E9FFFB 0%, ${ACCENT} 38%, #0C6F63 78%, #07312D 100%); box-shadow: 0 0 120px 30px rgba(52,227,203,0.28), inset -30px -20px 60px rgba(0,0,0,0.35)`)} />
            <div style={css('position: absolute; right: 150px; top: 60px; width: 18px; height: 18px; border-radius: 50%; background: rgba(0,0,0,0.18)')} />
            <div style={css('position: absolute; right: 70px; top: 120px; width: 28px; height: 28px; border-radius: 50%; background: rgba(0,0,0,0.14)')} />
          </div>
          <div style={css('position: relative; max-width: 700px')}>
            <div style={css(`font-size: 12.5px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 700; color: ${ACCENT}`)}>
              {night ? `${longDay(night.date)} · last run ${formatClock(new Date(lastEnd))}` : 'Waiting for the first run'}
            </div>
            <h1 style={css('margin: 14px 0 0; font-size: 58px; line-height: 1.02; font-weight: 800; letter-spacing: -2.4px')}>
              {line1}
              <br />
              <span style={{ color: ACCENT }}>{line2}</span>
            </h1>
            <p style={css('margin: 18px 0 0; font-size: 17px; line-height: 1.55; color: #B4BFD2; max-width: 560px')}>
              {night
                ? `${String(passed)} of ${plural(nightFlows.size, 'flow')} passed. ${plural(replays, 'run')} replayed with no AI. AI cost ${formatUsd(nightCost)}.`
                : 'Press Run now, choose a flow, and the agent tests your staging app in a real browser. Results, video and trace show up here.'}
            </p>
            <div style={css('display: flex; gap: 12px; margin-top: 26px; flex-wrap: wrap; align-items: center')}>
              {firstBug || latest ? (
                <Link
                  href={`/runs/${(firstBug ?? latest)?.id ?? ''}`}
                  style={css(`min-height: 50px; box-sizing: border-box; padding: 0 24px; border-radius: 14px; background: ${ACCENT}; color: #03211D; display: inline-flex; align-items: center; font-size: 15px; font-weight: 800; box-shadow: 0 10px 36px -8px rgba(52,227,203,0.7)`)}
                >
                  {firstBug ? 'Open the failing run' : 'Open the latest run'}
                </Link>
              ) : null}
              <RunNowMenu flows={choices} accent={ACCENT} readOnly={!canRun} />
              <Link href="/runs" style={css('min-height: 50px; box-sizing: border-box; padding: 0 22px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.05); display: inline-flex; align-items: center; font-size: 15px; font-weight: 700')}>
                All runs
              </Link>
            </div>
          </div>

          <div style={css('position: relative; margin-top: 40px')}>
            <div style={css('display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 14px; gap: 12px; flex-wrap: wrap')}>
              <div style={css('font-size: 14px; font-weight: 800')}>The night, minute by minute</div>
              <div style={css('font-size: 12.5px; color: #8E9BB2')}>{night ? `Agent activity from ${formatClock(new Date(lo))} to ${formatClock(new Date(lo + span))}` : 'Appears after the first run'}</div>
            </div>
            <div style={css('position: relative; height: 28px')}>
              <div style={css('position: absolute; left: 0; right: 0; top: 13px; height: 2px; background: rgba(255,255,255,0.14)')} />
              {shownEvs.map((e, i) => (
                <div key={`${String(e.at)}-${String(i)}`} style={css(`position: absolute; top: 2px; left: ${String(pct(e.at))}%; transform: translateX(-50%); width: 24px; height: 24px; border-radius: 50%; box-sizing: border-box; display: flex; align-items: center; justify-content: center; font-size: 11.5px; font-weight: 800; color: #06121A; background: ${e.color}; box-shadow: 0 0 16px ${e.color}99, 0 0 0 4px rgba(7,10,16,0.9)`)}>{i + 1}</div>
              ))}
            </div>
            <div aria-hidden="true" style={css('display: flex; align-items: flex-end; gap: 3px; height: 52px; margin-top: 6px')}>
              {bars.map((b, i) => (
                <div key={i} style={css(`flex: 1; border-radius: 3px 3px 0 0; height: ${String(b.h)}px; background: ${ACCENT}; opacity: ${b.a.toFixed(2)}`)} />
              ))}
            </div>
            <div style={css(`position: relative; height: 22px; margin-top: 6px; font-size: 11.5px; color: #8E9BB2; font-family: ${MONO}`)}>
              {night
                ? [0, 20, 40, 60, 80, 100].map((p) => (
                    <span key={p} style={css(`position: absolute; left: ${String(p)}%; transform: translateX(${p === 0 ? '0' : p === 100 ? '-100%' : '-50%'})`)}>{formatClock(new Date(lo + (p / 100) * span))}</span>
                  ))
                : null}
            </div>
            {shownEvs.length > 0 ? (
              <div style={css('display: flex; flex-wrap: wrap; gap: 10px 26px; margin-top: 14px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.08)')}>
                {shownEvs.map((e, i) => (
                  <div key={`${String(e.at)}-l-${String(i)}`} style={css('display: flex; align-items: center; gap: 9px; font-size: 13px')}>
                    <span style={css(`width: 20px; height: 20px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; color: #06121A; background: ${e.color}`)}>{i + 1}</span>
                    <span style={css(`font-family: ${MONO}; color: #8E9BB2; font-size: 12px`)}>{formatClock(new Date(e.at))}</span>
                    <span style={css('font-weight: 600')}>{e.text}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section aria-label="Health" style={css('display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px')}>
          {kpis.map((k) => (
            <div key={k.label} style={card('padding: 20px 22px; display: flex; flex-direction: column; gap: 6px')}>
              <div style={css('font-size: 13px; color: #A3AEC2; font-weight: 600')}>{k.label}</div>
              <div style={css('display: flex; align-items: flex-end; justify-content: space-between; gap: 10px')}>
                <div style={css('font-size: 38px; font-weight: 800; letter-spacing: -1.6px; line-height: 1')}>{k.value}</div>
                <svg viewBox="0 0 96 36" width="96" height="36" aria-hidden="true">
                  <polyline points={k.line} fill="none" stroke={k.color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div style={css('font-size: 12.5px; color: #8E9BB2')}>{k.note}</div>
            </div>
          ))}
        </section>

        <div style={css('display: flex; flex-wrap: wrap; gap: 24px; align-items: stretch')}>
          <section style={card('flex: 1.7 1 620px; min-width: 0; padding: 26px 28px 20px')}>
            <div style={css('display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; align-items: baseline')}>
              <div>
                <div style={css('font-size: 20px; font-weight: 800; letter-spacing: -0.5px')}>Flow constellation</div>
                <div style={css('font-size: 13.5px; color: #A3AEC2; margin-top: 4px')}>Every flow is a star. Brighter halos mean something needs you.</div>
              </div>
              <Link href="/flows" style={css(`font-size: 13.5px; font-weight: 700; color: ${ACCENT}`)}>All flows</Link>
            </div>
            <svg viewBox="0 0 760 340" width="100%" role="img" aria-label={`Constellation of ${plural(stars.length, 'flow')}: ${keyCounts.map((k) => `${String(k.n)} ${VERDICTS[k.v].label.toLowerCase()}`).join(', ')}${idleCount ? `, ${String(idleCount)} not run yet` : ''}`} style={css('display: block; margin-top: 8px')}>
              <g stroke="rgba(255,255,255,0.14)" strokeWidth="1">
                {EDGES.filter(([a, b]) => a < placed.length && b < placed.length).map(([a, b]) => (
                  <line key={`${String(a)}-${String(b)}`} x1={NODES[a]?.[0]} y1={NODES[a]?.[1]} x2={NODES[b]?.[0]} y2={NODES[b]?.[1]} />
                ))}
              </g>
              {placed.length === 0 ? (
                <text x="380" y="175" textAnchor="middle" fontFamily={FONT} fontSize="14" fill="#8E9BB2">No flows yet. Add a YAML file to flows/.</text>
              ) : null}
              {placed.map((s, i) => {
                const n = NODES[i];
                if (!n) return null;
                const [x, y, r] = n;
                const c = colorOf(s.verdict);
                const body = (
                  <>
                    <circle cx={x} cy={y} r={s.verdict === 'pass' || s.verdict === 'idle' ? r + 7 : r + 16} fill={c} opacity="0.16" />
                    <circle cx={x} cy={y} r={r} fill={c} />
                    <text x={x} y={y - r - 9} textAnchor="middle" fontFamily={FONT} fontSize="11.5" fontWeight={s.verdict === 'pass' || s.verdict === 'idle' ? 600 : 700} fill={s.verdict === 'bug' ? '#EAF0FA' : s.verdict === 'pass' || s.verdict === 'idle' ? '#A3AEC2' : VERDICTS[s.verdict].fg}>
                      {s.name.length > 19 ? `${s.name.slice(0, 18)}…` : s.name}
                    </text>
                  </>
                );
                return s.href ? (
                  <a key={s.name} href={s.href} aria-label={`${s.name}: ${VERDICTS[s.verdict as Verdict].label}`}>
                    {body}
                  </a>
                ) : (
                  <g key={s.name}>{body}</g>
                );
              })}
            </svg>
            <div style={css('display: flex; flex-wrap: wrap; gap: 8px 22px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.08); font-size: 12.5px; color: #A3AEC2')}>
              {keyCounts.map((k) => (
                <span key={k.v} style={css('display: inline-flex; align-items: center; gap: 8px')}>
                  <span style={css(`width: 10px; height: 10px; border-radius: 50%; background: ${VERDICTS[k.v].color}; box-shadow: 0 0 10px ${VERDICTS[k.v].color}`)} />
                  {k.n} {VERDICTS[k.v].label.toLowerCase()}
                </span>
              ))}
              {idleCount > 0 ? (
                <span style={css('display: inline-flex; align-items: center; gap: 8px')}>
                  <span style={css(`width: 10px; height: 10px; border-radius: 50%; background: ${IDLE}`)} />
                  {idleCount} not run yet
                </span>
              ) : null}
              {stars.length > NODES.length ? <span>+{stars.length - NODES.length} more flows</span> : null}
            </div>
          </section>

          <section style={css('flex: 1 1 380px; min-width: 0; display: flex; flex-direction: column; gap: 16px')}>
            <div style={css('display: flex; justify-content: space-between; align-items: baseline')}>
              <div style={css('font-size: 20px; font-weight: 800; letter-spacing: -0.5px')}>Needs you</div>
              <Link href="/bugs" style={css(`font-size: 13.5px; font-weight: 700; color: ${ACCENT}`)}>Open board</Link>
            </div>
            {needs.length === 0 ? (
              <div style={card('padding: 22px')}>
                <div style={css('font-size: 16.5px; font-weight: 700')}>{night ? 'All clear' : 'Nothing to review yet'}</div>
                <div style={css('font-size: 13px; color: #A3AEC2; margin-top: 6px; line-height: 1.45')}>
                  {night ? 'The latest run of every flow passed.' : 'Run a flow to see results here.'}
                </div>
              </div>
            ) : null}
            {needs.map((r) => {
              const m = VERDICTS[r.result.verdict];
              const hot = r.result.verdict === 'bug';
              const note = r.result.findings[0]?.message ?? r.result.reason;
              return (
                <Link
                  key={r.id}
                  href={`/runs/${r.id}`}
                  style={css(
                    hot
                      ? 'display: block; padding: 20px 22px; border-radius: 20px; border: 1px solid rgba(255,107,91,0.55); background: linear-gradient(180deg,rgba(255,107,91,0.13),rgba(255,107,91,0.035)); box-shadow: 0 0 44px -14px rgba(255,107,91,0.6), inset 0 1px 0 rgba(255,255,255,0.07)'
                      : 'display: block; padding: 20px 22px; border-radius: 20px; background: linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.016)); border: 1px solid rgba(255,255,255,0.085); box-shadow: inset 0 1px 0 rgba(255,255,255,0.06)',
                  )}
                >
                  <div style={css('display: flex; justify-content: space-between; align-items: center; gap: 8px')}>
                    <span style={css(`font-size: 12px; font-weight: 800; color: ${m.fg}; background: ${m.bg}; padding: 5px 11px; border-radius: 99px`)}>{m.label}</span>
                    <span style={css(`font-size: 12.5px; color: #8E9BB2; font-family: ${MONO}`)}>#{shortId(r.id)}</span>
                  </div>
                  <div style={css('font-size: 16.5px; font-weight: 700; margin-top: 12px; line-height: 1.3; letter-spacing: -0.2px')}>{r.flow}</div>
                  <div style={css('font-size: 13px; color: #A3AEC2; margin-top: 6px; line-height: 1.45')}>{note.length > 150 ? `${note.slice(0, 147)}…` : note}</div>
                  <div style={css(`margin-top: 14px; font-size: 13.5px; font-weight: 800; color: ${hot ? '#FF8A7B' : ACCENT}`)}>Open the run</div>
                </Link>
              );
            })}
          </section>
        </div>
        <div style={css('font-size: 12px; color: #6F7C94')}>Live data from the results folder. Reproduction (3 of 3) and GitHub issues are not connected yet.</div>
      </main>
    </div>
  );
}
