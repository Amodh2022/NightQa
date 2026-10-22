import Link from 'next/link';
import { connection } from 'next/server';
import { css } from '@/lib/dc';
import { COLORS } from '@/lib/format';
import { loadNotifyData } from '@/lib/notify/load';
import { timeLabel } from '@/lib/notify/view';
import type { ReportItem } from '@/lib/report';
import { isFinished, type FinishedRun } from '@/lib/stats';
import TabBar from './TabBar';
import { FONT, MONO } from './live/ui';
import { TONE } from './live/notifyUi';

const ACCENT = COLORS.accent;
const SEV_LABEL: Record<ReportItem['tone'], string> = { crit: 'Critical', high: 'High', med: 'Medium', low: 'Low', setup: 'Setup', look: 'Look' };
const CARD = 'display: block; padding: 14px 16px; border-radius: 18px; border: 1px solid rgba(255,255,255,0.09); background: linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.016)); box-shadow: inset 0 1px 0 rgba(255,255,255,0.07)';

const itemHref = (i: ReportItem): string => (i.bugId && i.runId ? `/m/bug?run=${encodeURIComponent(i.runId)}&id=${encodeURIComponent(i.bugId)}` : i.tone === 'setup' ? '/m/setup' : i.runId ? `/runs/${encodeURIComponent(i.runId)}` : '/m/bugs');

function clock(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  } catch {
    return '';
  }
}

/** The morning report on mobile, from the real runs and bug records of the last night. */
export default async function MHome() {
  await connection();
  const { settings, report, runs, window: win, now } = await loadNotifyData();
  const tz = settings.schedule.timezone;
  const dateText = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(win.asOf).replace(',', '');

  // the night's activity: finished runs inside the report window
  const night = runs
    .filter((r): r is FinishedRun => isFinished(r) && r.startedAt >= win.since && r.startedAt <= win.asOf)
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const endOf = (r: FinishedRun): number => r.startedAt.getTime() + r.result.durationSeconds * 1000;
  const lo = night[0]?.startedAt.getTime() ?? 0;
  const hi = night.reduce((m, r) => Math.max(m, endOf(r)), lo + 60_000);
  const span = Math.max(hi - lo, 60_000);
  const pct = (t: number): number => Math.min(98.5, Math.max(1.2, ((t - lo) / span) * 100));
  const pins: { at: number; color: string }[] = night.length > 0 ? [{ at: lo, color: COLORS.blue }] : [];
  for (const r of night) {
    if (r.result.verdict === 'bug') pins.push({ at: endOf(r), color: COLORS.coral });
    else if (r.result.verdict === 'needs_setup') pins.push({ at: endOf(r), color: COLORS.violet });
    else if (r.result.verdict === 'agent_stuck' || r.result.verdict === 'app_changed') pins.push({ at: endOf(r), color: COLORS.amber });
  }
  if (night.length > 0) pins.push({ at: hi, color: '#EAF0FA' });
  const shown = pins.slice(0, 8);
  const bars = Array.from({ length: 60 }, (_, i) => {
    const t0 = lo + (i / 60) * span;
    const t1 = lo + ((i + 1) / 60) * span;
    const active = night.some((r) => r.startedAt.getTime() < t1 && endOf(r) >= t0);
    const near = shown.reduce((m, p) => Math.max(m, 1 - Math.min(1, Math.abs(pct(p.at) - i * (100 / 60)) / 6)), 0);
    const base = (5 + 12 * Math.abs(Math.sin(i * 0.37) + 0.55 * Math.sin(i * 0.91))) * (active ? 1 : 0.4);
    return { h: Math.round(Math.min(30, base + near * 14)), o: (0.28 + near * 0.62) * (active ? 1 : 0.6) };
  });
  const ticks = night.length > 0 ? [0, 1, 2, 3].map((k) => clock(new Date(lo + (k / 3) * span), tz)) : [];

  const prItem = report.items.find((i) => i.refs.includes('PR #') && i.bugId);
  const prNumber = /PR #(\d+)/.exec(prItem?.refs ?? '')?.[1];
  const firstBug = report.items.find((i) => i.bugId);
  const primary = prItem && prNumber ? { href: itemHref(prItem), label: `Review fix PR #${prNumber}` } : firstBug ? { href: itemHref(firstBug), label: 'Open the bug' } : undefined;
  const sub = report.counts.flowsTotal > 0 ? `${String(report.counts.flowsPassed)} of ${String(report.counts.flowsTotal)} flows passed.` : 'Run your first flow to get a report.';
  const needs = report.items.slice(0, 4);

  return (
    <div style={css(`position: relative; width: 390px; max-width: 100%; min-height: 100vh; box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column; font-family: ${FONT}; color: #EAF0FA; background: radial-gradient(420px 320px at 90% -60px, rgba(52,227,203,0.22), transparent 65%), radial-gradient(380px 300px at 0% 30%, rgba(139,124,255,0.12), transparent 65%), #070A10`)}>
      <header style={css('display: flex; align-items: center; justify-content: space-between; padding: 22px 20px 6px; gap: 10px')}>
        <div style={css('display: flex; align-items: center; gap: 10px')}>
          <div aria-hidden="true" style={css(`width: 28px; height: 28px; border-radius: 50%; background: ${ACCENT}; position: relative; overflow: hidden; box-shadow: 0 0 22px rgba(52,227,203,0.6)`)}>
            <div style={css('position: absolute; left: 11px; top: -4px; width: 26px; height: 26px; border-radius: 50%; background: #070A10')} />
          </div>
          <span style={css('font-size: 18px; font-weight: 800; letter-spacing: -0.4px')}>NightQA</span>
        </div>
        <div style={css('display: flex; align-items: center; gap: 8px; min-height: 44px; box-sizing: border-box; padding: 0 14px; border-radius: 99px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05); min-width: 0')}>
          <span style={css('font-size: 13.5px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 130px')}>{settings.app.name}</span>
          <span style={css('font-size: 11px; font-weight: 800; color: #7FB0FF; background: rgba(106,166,255,0.16); padding: 2px 8px; border-radius: 99px')}>Staging</span>
        </div>
      </header>

      <main style={css('flex: 1; min-height: 0; padding: 14px 20px 0; display: flex; flex-direction: column; gap: 18px')}>
        <section style={css('position: relative; overflow: hidden; padding: 22px 20px 18px; border-radius: 26px; border: 1px solid rgba(255,255,255,0.1); background: linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02)); box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), 0 30px 60px -30px rgba(0,0,0,0.9)')}>
          <div aria-hidden="true" style={css(`position: absolute; right: -50px; top: -60px; width: 190px; height: 190px; border-radius: 50%; background: radial-gradient(circle at 34% 32%, #E9FFFB 0%, ${ACCENT} 40%, #0C6F63 80%); box-shadow: 0 0 80px 14px rgba(52,227,203,0.3); opacity: 0.9`)} />
          <div style={css('position: relative')}>
            <div style={css(`font-size: 11.5px; letter-spacing: 1.3px; text-transform: uppercase; font-weight: 800; color: ${ACCENT}`)}>
              {dateText} · {timeLabel(settings.schedule.morningReportTime)}
            </div>
            <h1 style={css('margin: 10px 0 0; font-size: 32px; line-height: 1.05; font-weight: 800; letter-spacing: -1.2px; max-width: 230px')}>
              {report.headline[0]}
              <br />
              <span style={{ color: ACCENT }}>{report.headline[1]}</span>
            </h1>
            <div style={css('font-size: 13.5px; color: #B4BFD2; margin-top: 10px; line-height: 1.45')}>{sub}</div>
          </div>
          <div aria-hidden="true" style={css('position: relative; margin-top: 18px; height: 22px')}>
            <div style={css('position: absolute; left: 0; right: 0; top: 10px; height: 2px; background: rgba(255,255,255,0.16)')} />
            {shown.map((p, i) => (
              <div key={`${String(p.at)}-${String(i)}`} style={css(`position: absolute; top: 4px; left: ${pct(p.at).toFixed(1)}%; transform: translateX(-50%); width: 14px; height: 14px; border-radius: 50%; background: ${p.color}; box-shadow: 0 0 12px ${p.color}, 0 0 0 3px rgba(7,10,16,0.9)`)} />
            ))}
          </div>
          <div aria-hidden="true" style={css('display: flex; align-items: flex-end; gap: 2px; height: 30px; margin-top: 6px')}>
            {bars.map((b, i) => (
              <div key={i} style={css(`flex: 1; border-radius: 2px 2px 0 0; background: ${ACCENT}; height: ${String(b.h)}px; opacity: ${b.o.toFixed(2)}`)} />
            ))}
          </div>
          <div style={css(`display: flex; justify-content: space-between; margin-top: 6px; font-size: 10.5px; color: #8E9BB2; font-family: ${MONO}; min-height: 14px`)}>
            {ticks.map((t, i) => (
              <span key={i}>{t}</span>
            ))}
          </div>
          {primary ? (
            <Link href={primary.href} style={css(`display: flex; align-items: center; justify-content: center; min-height: 52px; margin-top: 16px; border-radius: 16px; background: ${ACCENT}; color: #03211D; font-size: 15px; font-weight: 800; box-shadow: 0 12px 36px -8px rgba(52,227,203,0.75)`)}>
              {primary.label}
            </Link>
          ) : null}
        </section>

        <section style={css('display: flex; flex-direction: column; gap: 12px')}>
          <div style={css('display: flex; justify-content: space-between; align-items: baseline')}>
            <div style={css('font-size: 17px; font-weight: 800; letter-spacing: -0.3px')}>Needs you</div>
            <Link href="/m/bugs" style={css(`font-size: 13px; font-weight: 800; color: ${ACCENT}`)}>All bugs</Link>
          </div>
          {needs.length === 0 ? (
            <div style={css(CARD)}>
              <div style={css('font-size: 15px; font-weight: 700')}>{report.kind === 'no_runs' ? 'Nothing to review yet' : 'All clear'}</div>
              <div style={css('font-size: 12.5px; color: #A3AEC2; margin-top: 4px; line-height: 1.45')}>
                {report.kind === 'no_runs' ? `No flows ran in the last night (as of ${clock(now, tz)}). Run a flow and the report shows up here.` : 'Nothing needs you this morning.'}
              </div>
            </div>
          ) : null}
          {needs.map((n, i) => (
            <Link key={`${n.tag}-${String(i)}`} href={itemHref(n)} style={css(CARD)}>
              <div style={css('display: flex; justify-content: space-between; align-items: center; gap: 8px')}>
                <span style={css(`font-size: 11.5px; font-weight: 800; color: ${TONE[n.tone].fg}; background: ${TONE[n.tone].bg}; padding: 4px 10px; border-radius: 99px`)}>{SEV_LABEL[n.tone]}</span>
                <span style={css(`font-family: ${MONO}; font-size: 11.5px; color: #8E9BB2; text-align: right`)}>{n.refs.split(' · ')[0]}</span>
              </div>
              <div style={css('font-size: 15px; font-weight: 700; margin-top: 10px; line-height: 1.3; overflow-wrap: anywhere')}>{n.title}</div>
            </Link>
          ))}
        </section>
      </main>
      <TabBar active="Home" accent={ACCENT} />
    </div>
  );
}
