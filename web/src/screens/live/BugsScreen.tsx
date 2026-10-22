import { connection } from 'next/server';
import Link from 'next/link';
import { AutoRefresh } from '@/components/AutoRefresh';
import { COLUMNS, SEVERITY, fixLine, groupByColumn, percent, reproLabel, safeHref } from '@/lib/bug-view';
import { latestPerBug, listBugs, mergedFixRate, type BugRecord } from '@/lib/bugs';
import { css } from '@/lib/dc';
import { COLORS, VERDICTS, plural, shortStamp } from '@/lib/format';
import { listRuns } from '@/lib/results';
import { isFinished, latestPerFlow, shortId } from '@/lib/stats';
import Topbar from '../Topbar';
import { MONO, card, emptyCard, eyebrow, h1, lead, main, pageBg } from './ui';

const ACCENT = COLORS.accent;
const BASE =
  'display:block;padding:18px 18px 16px;border-radius:18px;border:1px solid rgba(255,255,255,0.09);background:linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02));box-shadow:inset 0 1px 0 rgba(255,255,255,0.07)';
const HOT = (rgb: string): string =>
  `display:block;padding:18px 18px 16px;border-radius:18px;border:1px solid rgba(${rgb},0.55);background:linear-gradient(180deg,rgba(${rgb},0.13),rgba(${rgb},0.03));box-shadow:0 0 42px -14px rgba(${rgb},0.6),inset 0 1px 0 rgba(255,255,255,0.07)`;
const PANEL = 'padding:16px;border-radius:24px;border:1px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.025)';
const PILL = 'font-size: 11.5px; font-weight: 700; color: #C7D0E0; background: rgba(255,255,255,0.07); padding: 4px 10px; border-radius: 99px';

const bugHref = (b: BugRecord): string => `/bug?run=${encodeURIComponent(b.runId)}&id=${encodeURIComponent(b.id)}`;

function BugCard({ bug, rgb }: { bug: BugRecord; rgb: string | undefined }) {
  const sev = SEVERITY[bug.severity];
  const issueHref = bug.issue ? safeHref(bug.issue.url) : undefined;
  return (
    <div style={css(rgb ? HOT(rgb) : BASE)}>
      <Link href={bugHref(bug)} style={css('display: block')}>
        <div style={css('display: flex; justify-content: space-between; align-items: center; gap: 8px')}>
          <span style={css(`font-size: 11.5px; font-weight: 800; color: ${sev.fg}; background: ${sev.bg}; padding: 4px 10px; border-radius: 99px`)}>{sev.label}</span>
          <span style={css(`font-size: 12px; color: #8E9BB2; font-family: ${MONO}`)}>
            {bug.issue ? `#${String(bug.issue.number)}` : ''}
            {bug.issue && bug.pull ? ' · ' : ''}
            {bug.pull ? `PR #${String(bug.pull.number)}` : ''}
          </span>
        </div>
        <div style={css('font-size: 15.5px; font-weight: 700; margin-top: 12px; line-height: 1.35')}>{bug.title}</div>
        <div style={css('font-size: 12.5px; color: #A3AEC2; margin-top: 6px')}>{fixLine(bug)}</div>
        <div style={css('display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px')}>
          <span style={css(PILL)}>{reproLabel(bug)}</span>
          <span style={css(PILL)}>{bug.flow}</span>
          {bug.closeReason ? <span style={css(PILL)}>Closed: {bug.closeReason.replace(/_/g, ' ')}</span> : null}
        </div>
      </Link>
      {issueHref ? (
        <a href={issueHref} target="_blank" rel="noreferrer noopener" style={css(`display: inline-block; margin-top: 12px; font-size: 13px; font-weight: 800; color: ${ACCENT}`)}>
          Issue #{bug.issue?.number} on GitHub
        </a>
      ) : null}
    </div>
  );
}

/** The bug board, from the engine's real bug records (results/<run>/bugs/<bug>/bug.json). */
export default async function BugsScreen() {
  await connection();
  const [all, runs] = await Promise.all([listBugs(), listRuns()]);
  const bugs = latestPerBug(all);
  const cols = groupByColumn(bugs);
  const rate = percent(mergedFixRate(all));
  const open = cols.proven.length + cols.fix_pr.length;
  const finished = runs.filter(isFinished);
  // Runs that ended without a bug record: a saved test that regressed, or a run that could not finish. Real, but not proven bugs.
  const signals = [...latestPerFlow(runs).values()].filter((r) => r.result.verdict === 'needs_setup' || r.result.verdict === 'agent_stuck' || r.result.verdict === 'app_changed' || (r.result.verdict === 'bug' && r.mode === 'replay'));

  return (
    <div style={pageBg()}>
      <Topbar active="Bugs" accent={ACCENT} />
      <AutoRefresh active={runs.some((r) => r.status === 'running')} />
      <main style={main()}>
        <header style={css('display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 18px')}>
          <div>
            <div style={eyebrow(ACCENT)}>Bugs</div>
            <h1 style={h1}>{open === 0 ? 'No proven bugs open' : `${plural(open, 'proven bug')} open`}</h1>
            <div style={lead}>
              A bug is listed once NightQA reproduced it 3 of 3 times and a failing test ran and failed. Each card opens the evidence, the test and the GitHub links.
            </div>
          </div>
          <div style={card('padding: 14px 20px; display: flex; flex-direction: column; gap: 2px')}>
            <span style={css('font-size: 12.5px; color: #8E9BB2')}>Merged fix rate</span>
            <span style={css(`font-size: 26px; font-weight: 800; font-family: ${MONO}; color: ${rate ? ACCENT : '#6F7C94'}`)}>{rate ?? '—'}</span>
            <span style={css('font-size: 12px; color: #8E9BB2')}>{rate ? 'of closed fix PRs were merged' : 'No fix PR has closed yet'}</span>
          </div>
        </header>

        {bugs.length === 0 ? (
          <div style={emptyCard}>
            <div style={css('font-size: 20px; font-weight: 800')}>No bug records yet</div>
            <div style={css('font-size: 14.5px; color: #A3AEC2; max-width: 540px; line-height: 1.5')}>
              {finished.length === 0 ? 'Run a flow from Flows or Runs.' : 'None of the runs so far produced a reproduced bug.'} Bugs appear here after NightQA investigates a failed run.
            </div>
          </div>
        ) : (
          <section aria-label="Bug board" style={css('display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 18px; align-items: start')}>
            {COLUMNS.map((c) => (
              <div key={c.key} style={css(PANEL)}>
                <div style={css('display: flex; align-items: center; gap: 10px; padding: 4px 4px 0')}>
                  <span style={css(`width: 10px; height: 10px; border-radius: 50%; background: ${c.dot}; box-shadow: 0 0 12px ${c.dot}`)} />
                  <div style={css('font-size: 16px; font-weight: 800')}>{c.title}</div>
                  <span style={css('margin-left: auto; font-size: 12.5px; font-weight: 800; color: #A3AEC2; background: rgba(255,255,255,0.07); padding: 3px 10px; border-radius: 99px')}>{cols[c.key].length}</span>
                </div>
                <div style={css('font-size: 12.5px; color: #8E9BB2; margin: 8px 4px 14px; line-height: 1.45')}>{c.hint}</div>
                <div style={css('display: flex; flex-direction: column; gap: 12px')}>
                  {cols[c.key].length === 0 ? <div style={card('padding: 16px; font-size: 13.5px; color: #8E9BB2')}>Nothing here.</div> : null}
                  {cols[c.key].map((b) => (
                    <BugCard key={`${b.runId}/${b.id}`} bug={b} rgb={c.key === 'proven' ? c.rgb : undefined} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {signals.length > 0 ? (
          <section aria-label="Other run signals" style={css(PANEL)}>
            <div style={css('font-size: 16px; font-weight: 800; padding: 4px')}>Runs that need attention, but are not proven bugs</div>
            <div style={css('display: flex; flex-direction: column; margin-top: 8px')}>
              {signals.map((r) => {
                const m = VERDICTS[r.result.verdict];
                return (
                  <Link key={r.id} href={`/runs/${r.id}`} style={css('display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding: 12px 4px; border-top: 1px solid rgba(255,255,255,0.07)')}>
                    <span style={css(`font-size: 11.5px; font-weight: 800; color: ${m.fg}; background: ${m.bg}; padding: 4px 10px; border-radius: 99px`)}>{r.mode === 'replay' && r.result.verdict === 'bug' ? 'Replay regression' : m.label}</span>
                    <span style={css('font-size: 14px; font-weight: 700')}>{r.flow}</span>
                    <span style={css('font-size: 12.5px; color: #8E9BB2')}>{shortStamp(r.startedAt)}</span>
                    <span style={css(`margin-left: auto; font-size: 12px; color: #8E9BB2; font-family: ${MONO}`)}>#{shortId(r.id)}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}
        <div style={css('font-size: 12px; color: #6F7C94')}>Live data from the results folder.</div>
      </main>
    </div>
  );
}
