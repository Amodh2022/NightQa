import { connection } from 'next/server';
import { recentAudit } from '@/lib/audit';
import { currentViewer } from '@/lib/auth/server';
import { latestPerBug, listBugs, mergedFixRate } from '@/lib/bugs';
import { css } from '@/lib/dc';
import { COLORS, shortStamp } from '@/lib/format';
import { getSettings, reportingFor } from '@/lib/settings';
import { LevelLadder, ListEditor, PauseButton } from '@/components/AutonomyControls';
import Topbar from './Topbar';
import { MONO, card, eyebrow, main } from './live/ui';

const ACCENT = COLORS.accent;
const bg =
  'min-height: 100vh; font-family: \'Manrope\', system-ui, sans-serif; color: #EAF0FA; background: radial-gradient(1100px 560px at 50% -160px, rgba(52,227,203,0.16), transparent 62%), radial-gradient(760px 520px at 96% 30%, rgba(255,193,77,0.08), transparent 62%), #070A10';

const REPORTING: Record<'L0' | 'L1' | 'L2', string> = {
  L0: 'Proven bugs stay in your morning report. Nothing is sent to GitHub.',
  L1: 'Each proven bug becomes a GitHub issue with a failing test.',
  L2: 'Each proven bug becomes an issue, and your coding agent is asked for a fix PR.',
};

function when(at: string): string {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? at : shortStamp(d);
}

/** Autonomy and policy: the level, pause, blocked pages and actions, real fix acceptance and the activity log. */
export default async function AutonomyScreen() {
  await connection();
  const [settings, bugs, events, viewer] = await Promise.all([getSettings(), listBugs(), recentAudit(12), currentViewer()]);
  const readOnly = viewer?.role !== 'member';
  const { autonomy } = settings;
  const rate = mergedFixRate(bugs);
  const closed = latestPerBug(bugs).filter((b) => b.pull && b.pull.state !== 'open');
  const merged = closed.filter((b) => b.pull?.state === 'merged').length;
  const pct = rate === undefined ? 0 : Math.round(rate * 100);
  const reporting = reportingFor(autonomy.level);

  const rules: { title: string; note: string; value: string }[] = [
    { title: 'What NightQA does at this level', note: REPORTING[autonomy.level], value: autonomy.level },
    { title: 'Severity reported', note: 'Bugs below this severity are kept locally and not filed.', value: settings.github.minSeverity },
    { title: 'Fix PRs per night', note: 'Stops runaway changes.', value: reporting.fixMode === 'off' || reporting.fixMode === 'manual' ? 'None asked for' : `${String(settings.github.maxFixPerNight)} at most` },
    { title: 'Who merges', note: 'NightQA never merges, deploys or changes production.', value: 'A human, always' },
  ];

  return (
    <div style={css(bg)}>
      <Topbar active="Autonomy" accent={ACCENT} />
      <main style={main()}>
        <header style={css('display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 18px')}>
          <div style={css('max-width: 720px')}>
            <div style={eyebrow(ACCENT)}>Autonomy · {settings.app.name}</div>
            <h1 style={css('margin: 8px 0 8px; font-size: 42px; font-weight: 800; letter-spacing: -1.6px')}>How much may NightQA do without you?</h1>
            <div style={css('font-size: 15.5px; color: #A3AEC2; line-height: 1.5')}>
              Trust is earned in steps. NightQA stops at L2: it reports, opens issues and asks for fixes, and a human always merges. One click pauses everything.
            </div>
            {autonomy.paused ? (
              <div role="status" style={css('margin-top: 14px; display: inline-block; font-size: 13px; font-weight: 800; color: #FFC14D; background: rgba(255,193,77,0.14); padding: 7px 14px; border-radius: 99px')}>
                Paused: no runs will start until you resume.
              </div>
            ) : null}
          </div>
          <PauseButton paused={autonomy.paused} readOnly={readOnly} />
        </header>

        <section aria-label="Autonomy ladder" style={card('padding: 34px 34px 28px; overflow: hidden')}>
          <LevelLadder level={autonomy.level} readOnly={readOnly} />
          <div style={css('display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; margin-top: 20px; font-size: 12.5px; color: #8E9BB2')}>
            <span>Levels above L2 are not built: nothing merges, deploys or touches production without a human.</span>
            <span>Shipping now: L0 to L2</span>
          </div>
          {readOnly ? <div style={css('margin-top: 10px; font-size: 12.5px; color: #8E9BB2')}>View-only account: you can read the policy but not change it.</div> : null}
        </section>

        <div style={css('display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start')}>
          <section style={card('flex: 1.5 1 560px; min-width: 0; padding: 28px 30px')}>
            <div style={css('display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px')}>
              <div>
                <div style={css('font-size: 22px; font-weight: 800; letter-spacing: -0.6px')}>L3 · Auto-merge low-risk fixes</div>
                <div style={css('font-size: 13.5px; color: #A3AEC2; margin-top: 6px; max-width: 520px; line-height: 1.5')}>Not available: nothing merges without a human. This is a project rule, not a setting.</div>
              </div>
              <span role="switch" aria-checked="false" aria-disabled="true" aria-label="Auto-merge is not available" style={css('width: 64px; height: 48px; display: flex; align-items: center; opacity: 0.45')}>
                <span style={css('width: 58px; height: 32px; border-radius: 99px; background: #2D384B; position: relative; display: block')}>
                  <span style={css('position: absolute; left: 4px; top: 4px; width: 24px; height: 24px; border-radius: 50%; background: #EAF0FA')} />
                </span>
              </span>
            </div>
            <div style={css('display: flex; flex-direction: column; margin-top: 18px')}>
              {rules.map((r) => (
                <div key={r.title} style={css('display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px 16px; padding: 15px 0; border-top: 1px solid rgba(255,255,255,0.07)')}>
                  <div style={css('flex: 1 1 280px')}>
                    <div style={css('font-size: 15px; font-weight: 700')}>{r.title}</div>
                    <div style={css('font-size: 12.5px; color: #8E9BB2; margin-top: 3px')}>{r.note}</div>
                  </div>
                  <span style={css(`font-family: ${MONO}; font-size: 13px; background: rgba(255,255,255,0.08); padding: 7px 13px; border-radius: 10px`)}>{r.value}</span>
                </div>
              ))}
            </div>
            <div style={css('margin-top: 8px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,0.07)')}>
              <div style={css('font-size: 13px; color: #A3AEC2; font-weight: 700; margin-bottom: 12px')}>Pages NightQA never visits</div>
              <ListEditor field="blockedPaths" items={autonomy.blockedPaths} readOnly={readOnly} addLabel="Add a path" placeholder="/admin" />
            </div>
            <div style={css('margin-top: 22px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,0.07)')}>
              <div style={css('font-size: 13px; color: #A3AEC2; font-weight: 700; margin-bottom: 12px')}>Actions NightQA never takes</div>
              <ListEditor field="blockedActions" items={autonomy.blockedActions} readOnly={readOnly} addLabel="Add an action" placeholder="delete account" />
            </div>
          </section>

          <div style={css('flex: 1 1 380px; min-width: 0; display: flex; flex-direction: column; gap: 24px')}>
            <section style={card('padding: 26px 28px; display: flex; align-items: center; gap: 24px; flex-wrap: wrap')}>
              <div
                role="img"
                aria-label={rate === undefined ? 'No closed fix pull requests yet' : `${String(pct)} percent of closed fix pull requests were merged`}
                style={css(`position: relative; width: 140px; height: 140px; border-radius: 50%; flex: 0 0 auto; background: conic-gradient(${ACCENT} 0 ${String(pct)}%, rgba(255,255,255,0.1) ${String(pct)}% 100%); box-shadow: 0 0 60px -12px rgba(52,227,203,0.55)${rate === undefined ? '; opacity: 0.5' : ''}`)}
              >
                <div style={css('position: absolute; inset: 14px; border-radius: 50%; background: #0B1019; display: flex; flex-direction: column; align-items: center; justify-content: center')}>
                  <div style={css('font-size: 34px; font-weight: 800; letter-spacing: -1.2px')}>{rate === undefined ? '—' : `${String(pct)}%`}</div>
                  <div style={css('font-size: 11.5px; color: #A3AEC2')}>accepted</div>
                </div>
              </div>
              <div style={css('flex: 1 1 160px')}>
                <div style={css('font-size: 17px; font-weight: 800')}>Fix acceptance rate</div>
                <div style={css('font-size: 13px; color: #A3AEC2; margin-top: 6px; line-height: 1.5')}>
                  {rate === undefined ? 'No closed fix PRs yet. The rate appears once one is merged or closed.' : `${String(merged)} of ${String(closed.length)} closed fix PRs were merged by a person.`}
                </div>
              </div>
            </section>

            <section style={card('padding: 26px 28px')}>
              <div style={css('font-size: 17px; font-weight: 800; margin-bottom: 16px')}>Audit log</div>
              {events.length === 0 ? (
                <div style={css('font-size: 13.5px; color: #8E9BB2; border-top: 1px solid rgba(255,255,255,0.07); padding-top: 14px')}>Nothing recorded yet. Starting a run or changing a setting adds a line here.</div>
              ) : (
                <div style={css('display: flex; flex-direction: column')}>
                  {events.map((a, i) => (
                    <div key={`${a.at}-${String(i)}`} style={css('display: flex; gap: 14px; padding: 12px 0; border-top: 1px solid rgba(255,255,255,0.07); align-items: baseline')}>
                      <span style={css(`flex: 0 0 104px; font-family: ${MONO}; font-size: 12px; color: #8E9BB2`)}>{when(a.at)}</span>
                      <span style={css('font-size: 13.5px; line-height: 1.5; min-width: 0; overflow-wrap: anywhere')}>
                        <b>{a.who}</b> · {a.action}
                        {a.detail ? `: ${a.detail}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
        <div style={css('font-size: 12px; color: #6F7C94')}>Live data: settings and the activity log are read every time you open this page.</div>
      </main>
    </div>
  );
}
