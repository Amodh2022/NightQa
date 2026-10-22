import { connection } from 'next/server';
import { chartPoints, costPerNight, costVsCap, summarizeMonth } from '@/lib/billing';
import { css } from '@/lib/dc';
import { COLORS, formatUsd } from '@/lib/format';
import { listRuns } from '@/lib/results';
import { getSettings } from '@/lib/settings';
import Topbar from './Topbar';
import { MONO, card, eyebrow, h1, main } from './live/ui';

const ACCENT = COLORS.accent;
const bg =
  "min-height: 100vh; font-family: 'Manrope', system-ui, sans-serif; color: #EAF0FA; background: radial-gradient(1000px 520px at 12% -120px, rgba(139,124,255,0.14), transparent 62%), radial-gradient(760px 520px at 94% 10%, rgba(52,227,203,0.12), transparent 62%), #070A10";

const fmtTokens = (n: number): string => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** Usage: AI cost per night, runs by type and cost against the budget cap, all from the results folder. */
export default async function BillingScreen() {
  await connection();
  const now = new Date();
  const [runs, settings] = await Promise.all([listRuns(), getSettings()]);
  const month = summarizeMonth(runs, now);
  const nights = costPerNight(runs, now, 30);
  const chart = chartPoints(nights.map((n) => n.usd));
  const peak = nights.reduce((a, b) => (b.usd > a.usd ? b : a), nights[0] ?? { key: '', usd: 0 });
  const cap = settings.budgets.maxCostUsd;
  const flows = costVsCap(runs, now, cap);
  const replayPct = month.runs ? Math.round((month.replays / month.runs) * 100) : 0;
  const maxWeek = Math.max(1, ...month.weeks.map((w) => w.replay + w.ai));
  const hasData = month.runs > 0;

  const kpis = [
    { label: 'Runs this month', value: String(month.runs), note: hasData ? `${String(replayPct)}% were replays with no AI` : 'No runs yet this month' },
    { label: 'AI cost this month', value: formatUsd(month.usd), note: `${String(month.aiCalls)} AI calls · ${fmtTokens(month.inputTokens + month.outputTokens)} tokens` },
    { label: 'Average cost per AI run', value: month.aiRuns ? formatUsd(month.usd / month.aiRuns) : '—', note: `Replays cost nothing. Cap per run: ${formatUsd(cap)}` },
  ];

  return (
    <div style={css(bg)}>
      <Topbar active="Billing" accent={ACCENT} />
      <main style={main()}>
        <header>
          <div style={eyebrow(ACCENT)}>Usage and billing</div>
          <h1 style={h1}>What NightQA costs, and why</h1>
          <div style={css('font-size: 15.5px; color: #A3AEC2; margin-top: 8px; max-width: 700px; line-height: 1.5')}>
            Most nightly runs can be replays that use no AI. You only pay AI cost when the agent has to think. Every number here is added up from your own run results.
          </div>
        </header>

        <div style={css('display: flex; flex-wrap: wrap; gap: 24px; align-items: stretch')}>
          <section style={css('flex: 1.6 1 600px; min-width: 0; display: flex; flex-direction: column; gap: 24px')}>
            <div style={css('display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 16px')}>
              {kpis.map((k) => (
                <div key={k.label} style={card('padding: 20px 22px')}>
                  <div style={css('font-size: 13px; color: #A3AEC2; font-weight: 600')}>{k.label}</div>
                  <div style={css('font-size: 34px; font-weight: 800; letter-spacing: -1.4px; margin-top: 6px')}>{k.value}</div>
                  <div style={css('font-size: 12.5px; color: #8E9BB2; margin-top: 4px')}>{k.note}</div>
                </div>
              ))}
            </div>

            <div style={card('padding: 26px 28px')}>
              <div style={css('display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 8px')}>
                <div style={css('font-size: 18px; font-weight: 800; letter-spacing: -0.4px')}>AI cost per night, last 30 nights</div>
                <div style={css('font-size: 12.5px; color: #8E9BB2')}>{peak.usd > 0 ? `Highest night: ${formatUsd(peak.usd)} on ${peak.key}` : 'No AI cost in the last 30 nights'}</div>
              </div>
              <svg viewBox="0 0 640 200" width="100%" role="img" aria-label="Area chart of AI cost per night over 30 nights" style={css('display: block; margin-top: 16px')}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACCENT} stopOpacity="0.5" />
                    <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <g stroke="rgba(255,255,255,0.08)">
                  <line x1="0" y1="40" x2="640" y2="40" />
                  <line x1="0" y1="100" x2="640" y2="100" />
                  <line x1="0" y1="160" x2="640" y2="160" />
                </g>
                <polygon points={chart.area} fill="url(#g1)" />
                <polyline points={chart.line} fill="none" stroke={ACCENT} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                {chart.last ? <circle cx={chart.last[0]} cy={chart.last[1]} r="5" fill="#FFFFFF" /> : null}
                <g fontFamily="JetBrains Mono, monospace" fontSize="10.5" fill="#8E9BB2">
                  <text x="0" y="192">30 nights ago</text>
                  <text x="640" y="192" textAnchor="end">Today</text>
                </g>
              </svg>
            </div>

            <div style={card('padding: 26px 28px')}>
              <div style={css('font-size: 18px; font-weight: 800; letter-spacing: -0.4px; margin-bottom: 16px')}>Runs by type, this month</div>
              {hasData ? (
                <div style={css('display: flex; align-items: flex-end; gap: 18px; height: 120px')}>
                  {month.weeks.map((w) => (
                    <div key={w.label} style={css('flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; justify-content: flex-end; height: 100%')}>
                      <div title={`${w.label}: ${String(w.replay)} replays, ${String(w.ai)} AI-assisted`} style={css('width: 100%; max-width: 70px; display: flex; flex-direction: column; justify-content: flex-end; gap: 2px; height: 96px')}>
                        {w.ai > 0 ? <div style={css(`border-radius: 6px 6px 2px 2px; background: #8B7CFF; height: ${String(Math.max(4, Math.round((w.ai / maxWeek) * 96)))}px; box-shadow: 0 0 16px rgba(139,124,255,0.5)`)} /> : null}
                        {w.replay > 0 ? <div style={css(`border-radius: 6px 6px 2px 2px; background: ${ACCENT}; height: ${String(Math.max(4, Math.round((w.replay / maxWeek) * 96)))}px; opacity: 0.85`)} /> : null}
                      </div>
                      <div style={css('font-size: 12px; color: #8E9BB2')}>{w.label}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={css('font-size: 14px; color: #8E9BB2')}>No finished runs this month yet.</div>
              )}
              <div style={css('display: flex; gap: 20px; margin-top: 14px; font-size: 12.5px; color: #A3AEC2')}>
                <span style={css('display: inline-flex; align-items: center; gap: 7px')}>
                  <span style={css(`width: 12px; height: 12px; border-radius: 4px; background: ${ACCENT}`)} />
                  Replay, no AI · {month.replays}
                </span>
                <span style={css('display: inline-flex; align-items: center; gap: 7px')}>
                  <span style={css('width: 12px; height: 12px; border-radius: 4px; background: #8B7CFF')} />
                  AI-assisted · {month.aiRuns}
                </span>
              </div>
            </div>
          </section>

          <aside style={css('flex: 1 1 400px; min-width: 0; display: flex; flex-direction: column; gap: 24px')}>
            <section
              style={css(
                'padding: 26px 28px; border-radius: 24px; border: 1px solid rgba(52,227,203,0.55); background: linear-gradient(180deg, rgba(52,227,203,0.11), rgba(52,227,203,0.02)); box-shadow: 0 0 70px -20px rgba(52,227,203,0.55), inset 0 1px 0 rgba(255,255,255,0.08)',
              )}
            >
              <span style={css(`font-size: 12px; font-weight: 800; color: #03211D; background: ${ACCENT}; padding: 4px 12px; border-radius: 99px`)}>Self-hosted</span>
              <div style={css('font-size: 24px; font-weight: 800; letter-spacing: -0.6px; margin-top: 16px')}>You pay your AI provider directly</div>
              <div style={css('font-size: 13.5px; color: #C7D0E0; margin-top: 12px; line-height: 1.6')}>NightQA is self-hosted; you pay your AI provider directly. Billing is not part of this build.</div>
            </section>

            <section style={card('padding: 24px 26px')}>
              <div style={css('font-size: 17px; font-weight: 800; margin-bottom: 6px')}>Cost against the budget cap</div>
              <div style={css('font-size: 12.5px; color: #8E9BB2; margin-bottom: 14px; line-height: 1.5')}>
                Each run may spend at most {formatUsd(cap)} (set in Settings). Bars show the average and highest AI run per flow this month.
              </div>
              {flows.length === 0 ? (
                <div style={css('font-size: 13.5px; color: #8E9BB2')}>No AI-assisted runs this month yet.</div>
              ) : (
                <div style={css('display: flex; flex-direction: column; gap: 16px')}>
                  {flows.slice(0, 8).map((f) => (
                    <div key={f.flow}>
                      <div style={css('display: flex; justify-content: space-between; gap: 12px; font-size: 13.5px; font-weight: 700')}>
                        <span style={css('min-width: 0; overflow-wrap: anywhere')}>{f.flow}</span>
                        <span style={css(`font-family: ${MONO}; color: ${f.atCap > 0 ? '#FF8A7B' : ACCENT}; flex: 0 0 auto`)}>
                          {formatUsd(f.avgUsd)} avg · {formatUsd(f.maxUsd)} max
                        </span>
                      </div>
                      <div style={css('position: relative; height: 8px; border-radius: 99px; background: rgba(255,255,255,0.1); margin-top: 10px; overflow: hidden')}>
                        <div style={css(`height: 100%; border-radius: 99px; width: ${String(Math.min(100, Math.round((f.avgUsd / cap) * 100)))}%; background: ${f.atCap > 0 ? '#FF6B5B' : ACCENT}`)} />
                      </div>
                      <div style={css('font-size: 12px; color: #8E9BB2; margin-top: 6px')}>
                        {f.aiRuns} AI {f.aiRuns === 1 ? 'run' : 'runs'}
                        {f.atCap > 0 ? ` · ${String(f.atCap)} reached the cap` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section style={card('padding: 24px 26px')}>
              <div style={css('font-size: 17px; font-weight: 800; margin-bottom: 12px')}>Tokens this month</div>
              {[
                ['Input tokens', month.inputTokens],
                ['Output tokens', month.outputTokens],
                ['AI calls', month.aiCalls],
              ].map(([label, n]) => (
                <div key={String(label)} style={css('display: flex; justify-content: space-between; padding: 12px 0; border-top: 1px solid rgba(255,255,255,0.07); font-size: 14px')}>
                  <span style={css('font-weight: 700')}>{label}</span>
                  <span style={css(`font-family: ${MONO}`)}>{Number(n).toLocaleString('en-IN')}</span>
                </div>
              ))}
            </section>
          </aside>
        </div>
        <div style={css('font-size: 12px; color: #6F7C94')}>Live data: added up from the results folder every time you open this page.</div>
      </main>
    </div>
  );
}
