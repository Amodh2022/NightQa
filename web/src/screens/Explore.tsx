import Link from 'next/link';
import { connection } from 'next/server';
import { currentViewer } from '@/lib/auth/server';
import { latestPerBug, listBugs } from '@/lib/bugs';
import { readCoverage, summarizeCoverage, type TileState } from '@/lib/coverage';
import { css } from '@/lib/dc';
import { exploreFindings, exploreRuns, findingsPerPersona, PERSONA_INFO } from '@/lib/explore';
import { COLORS, formatUsd, plural, shortStamp } from '@/lib/format';
import { listRuns } from '@/lib/results';
import { getSettings } from '@/lib/settings';
import { ExploreEditor, ExploreNow } from '@/components/ExploreEditor';
import Topbar from './Topbar';
import { MONO, card, emptyCard, eyebrow, h1, main } from './live/ui';

const ACCENT = COLORS.accent;
const bg =
  "min-height: 100vh; font-family: 'Manrope', system-ui, sans-serif; color: #EAF0FA; background: radial-gradient(1000px 520px at 88% -120px, rgba(139,124,255,0.15), transparent 62%), radial-gradient(760px 520px at 3% 20%, rgba(52,227,203,0.10), transparent 62%), #070A10";

const TILE: Record<TileState, string> = {
  visited: 'background: rgba(52,227,203,0.2); border: 1px solid rgba(52,227,203,0.4); color: #BFF7EF',
  new: 'background: rgba(255,255,255,0.9); color: #070A10; box-shadow: 0 0 22px rgba(255,255,255,0.55)',
  blocked: 'background: rgba(255,107,91,0.18); border: 1px solid #FF6B5B; color: #FF8A7B',
};
const LEGEND: { label: string; state: TileState }[] = [
  { label: 'Visited', state: 'visited' },
  { label: 'New in the latest run', state: 'new' },
  { label: 'Blocked', state: 'blocked' },
];

const bar = (value: number, max: number): string => String(Math.min(100, Math.round((value / max) * 100)));

/** Exploration: personas, coverage memory and the bugs it found. Reads settings, results/ and coverage.json. */
export default async function ExploreScreen() {
  await connection();
  const now = new Date();
  const [settings, runs, bugs, coverage, viewer] = await Promise.all([getSettings(), listRuns(), listBugs(), readCoverage(), currentViewer()]);
  const readOnly = viewer?.role !== 'member';
  const { exploration, autonomy, budgets } = settings;
  const explored = exploreRuns(runs);
  const latest = explored[0];
  const summary = summarizeCoverage(coverage, latest?.result.newPages ?? [], autonomy.blockedPaths);
  const findings = exploreFindings(latestPerBug(bugs), runs);
  const week = findingsPerPersona(findings, new Date(now.getTime() - 7 * 86_400_000));
  const blocked = [...autonomy.blockedPaths, ...autonomy.blockedActions];
  const blockedReason = autonomy.paused
    ? 'NightQA is paused. Resume it in Autonomy and policy.'
    : !exploration.enabled
      ? 'Exploration is off. Turn it on and save.'
      : exploration.personas.length === 0
        ? 'Turn on at least one persona and save.'
        : undefined;

  return (
    <div style={css(bg)}>
      <Topbar active="Explore" accent={ACCENT} />
      <main style={main()}>
        <header style={css('display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 18px')}>
          <div>
            <div style={eyebrow(ACCENT)}>Exploration</div>
            <h1 style={h1}>Find the bugs no flow covers</h1>
            <div style={css('font-size: 15.5px; color: #A3AEC2; margin-top: 8px; max-width: 700px; line-height: 1.5')}>
              The agent wanders your app as different kinds of users. It remembers where it has been so later nights can spend their steps on new pages.
            </div>
          </div>
          <ExploreNow personas={exploration.personas} readOnly={readOnly} {...(blockedReason ? { blockedReason } : {})} />
        </header>

        <ExploreEditor enabled={exploration.enabled} personas={exploration.personas} maxSteps={exploration.maxSteps} found={Object.fromEntries(week)} readOnly={readOnly} />

        <div style={css('display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start')}>
          <section style={card('flex: 1.6 1 600px; min-width: 0; padding: 26px 28px')}>
            <div style={css('display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 10px')}>
              <div>
                <div style={css('font-size: 20px; font-weight: 800; letter-spacing: -0.5px')}>Coverage memory</div>
                <div style={css('font-size: 13.5px; color: #A3AEC2; margin-top: 4px')}>
                  {summary.total === 0
                    ? 'No exploration has run yet.'
                    : `${plural(summary.total, 'page')} visited so far.${latest ? ` ${plural(summary.newCount, 'new page')} in the latest run (${shortStamp(latest.startedAt)}).` : ''}`}
                </div>
              </div>
              <div style={css('display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 12.5px; color: #A3AEC2')}>
                {LEGEND.map((l) => (
                  <span key={l.state} style={css('display: inline-flex; align-items: center; gap: 7px')}>
                    <span style={css(`width: 12px; height: 12px; border-radius: 4px; box-sizing: border-box; ${TILE[l.state]}`)} />
                    {l.label}
                  </span>
                ))}
              </div>
            </div>
            {summary.total === 0 ? (
              <div style={css('margin-top: 22px; font-size: 14px; color: #8E9BB2; line-height: 1.5')}>
                Turn on a persona, save, and press Explore now. Every page it visits is remembered here.
              </div>
            ) : (
              <div style={css('display: grid; grid-template-columns: repeat(auto-fill, minmax(108px, 1fr)); gap: 8px; margin-top: 22px')}>
                {summary.tiles.map((t) => (
                  <div
                    key={t.path}
                    title={`${t.path} · ${plural(t.visits, 'visit')}`}
                    style={css(`height: 54px; border-radius: 10px; box-sizing: border-box; display: flex; align-items: flex-end; padding: 6px 8px; font-size: 11.5px; font-weight: 700; font-family: ${MONO}; overflow: hidden; ${TILE[t.state]}`)}
                  >
                    <span style={css('overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0')}>{t.path}</span>
                  </div>
                ))}
              </div>
            )}
            {summary.total > summary.tiles.length ? <div style={css('margin-top: 14px; font-size: 12.5px; color: #8E9BB2')}>Showing the {summary.tiles.length} most recent of {summary.total} pages.</div> : null}
          </section>

          <aside style={css('flex: 1 1 380px; min-width: 0; display: flex; flex-direction: column; gap: 20px')}>
            <div style={card('padding: 24px 26px')}>
              <div style={css('font-size: 17px; font-weight: 800')}>Blocked pages and actions</div>
              <div style={css('font-size: 13px; color: #A3AEC2; margin-top: 6px; line-height: 1.5')}>The agent never visits or takes these. Edit them in Autonomy and policy.</div>
              <div style={css('display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px')}>
                {blocked.length === 0 ? <span style={css('font-size: 13px; color: #8E9BB2')}>None set.</span> : null}
                {blocked.map((b) => (
                  <span key={b} style={css(`font-size: 12.5px; font-weight: 700; color: #FF8A7B; background: rgba(255,107,91,0.12); border: 1px solid rgba(255,107,91,0.4); padding: 7px 12px; border-radius: 10px; font-family: ${MONO}; overflow-wrap: anywhere`)}>
                    {b}
                  </span>
                ))}
                <Link href="/autonomy" style={css('min-height: 44px; display: inline-flex; align-items: center; padding: 0 14px; border-radius: 10px; border: 1px dashed rgba(255,255,255,0.25); color: #A3AEC2; font-size: 13px; font-weight: 700')}>
                  Edit rules
                </Link>
              </div>
            </div>

            <div style={card('padding: 24px 26px')}>
              <div style={css('font-size: 17px; font-weight: 800; margin-bottom: 16px')}>Limits so cost stays predictable</div>
              <div style={css('display: flex; flex-direction: column; gap: 18px')}>
                {[
                  { label: 'Steps per session', value: String(exploration.maxSteps), pct: bar(exploration.maxSteps, 100) },
                  { label: 'Seconds per run', value: String(budgets.maxSeconds), pct: bar(budgets.maxSeconds, 1800) },
                  { label: 'AI cost cap per run', value: formatUsd(budgets.maxCostUsd), pct: bar(budgets.maxCostUsd, 20) },
                ].map((m) => (
                  <div key={m.label}>
                    <div style={css('display: flex; justify-content: space-between; font-size: 13.5px; font-weight: 700')}>
                      <span>{m.label}</span>
                      <span style={css(`font-family: ${MONO}; color: ${ACCENT}`)}>{m.value}</span>
                    </div>
                    <div style={css('position: relative; height: 8px; border-radius: 99px; background: rgba(255,255,255,0.1); margin-top: 10px; overflow: hidden')}>
                      <div style={css(`height: 100%; border-radius: 99px; width: ${m.pct}%; background: ${ACCENT}`)} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={css('font-size: 12.5px; color: #8E9BB2; margin-top: 16px; line-height: 1.5')}>Steps are set above. Seconds and cost caps come from Settings and apply to every run.</div>
            </div>
          </aside>
        </div>

        <section style={card('padding: 26px 28px')}>
          <div style={css('font-size: 20px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 8px')}>Found by exploration</div>
          {findings.length === 0 ? (
            <div style={{ ...emptyCard, boxShadow: 'none', border: 0, background: 'transparent', padding: '24px 0' }}>
              <div style={css('font-size: 15px; color: #A3AEC2')}>{explored.length === 0 ? 'No exploration has run yet, so nothing has been found.' : 'Exploration has not found a proven bug yet.'}</div>
            </div>
          ) : (
            findings.slice(0, 12).map(({ bug, persona }) => {
              const info = persona ? PERSONA_INFO[persona as keyof typeof PERSONA_INFO] : undefined;
              const color = info?.color ?? COLORS.grey;
              return (
                <Link key={`${bug.runId}-${bug.id}`} href={`/runs/${bug.runId}`} style={css('display: flex; flex-wrap: wrap; align-items: center; gap: 12px 18px; padding: 16px 0; border-top: 1px solid rgba(255,255,255,0.07)')}>
                  <span style={css(`flex: 0 0 auto; font-size: 12px; font-weight: 800; padding: 5px 12px; border-radius: 99px; color: ${color}; background: ${color}26`)}>{info?.name ?? persona ?? 'Exploration'}</span>
                  <span style={css('flex: 1 1 300px; font-size: 15.5px; font-weight: 700; overflow-wrap: anywhere')}>{bug.title}</span>
                  <span style={css(`font-family: ${MONO}; font-size: 12.5px; color: #8E9BB2`)}>{bug.issue ? `#${String(bug.issue.number)}` : bug.status === 'needs_look' ? 'Needs a look' : bug.severity}</span>
                </Link>
              );
            })
          )}
        </section>
        <div style={css('font-size: 12px; color: #6F7C94')}>Live data: settings, results and coverage memory are read every time you open this page.</div>
      </main>
    </div>
  );
}
