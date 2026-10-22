import Link from 'next/link';
import { connection } from 'next/server';
import { currentViewer } from '@/lib/auth/server';
import { css } from '@/lib/dc';
import { COLORS } from '@/lib/format';
import { listFlows } from '@/lib/flows';
import { buildMatrix, type CellKind, type ProfileId } from '@/lib/profile-matrix';
import { networkLabel, screenLabel } from '@/lib/profile-info';
import { listRuns } from '@/lib/results';
import { getSettings } from '@/lib/settings';
import { ProfilesEditor } from '@/components/ProfilesEditor';
import Topbar from './Topbar';
import { MONO, card, eyebrow, h1, main } from './live/ui';

const ACCENT = COLORS.accent;
const bg =
  "min-height: 100vh; font-family: 'Manrope', system-ui, sans-serif; color: #EAF0FA; background: radial-gradient(1000px 520px at 12% -120px, rgba(106,166,255,0.14), transparent 62%), radial-gradient(760px 520px at 94% 18%, rgba(52,227,203,0.10), transparent 62%), #070A10";

/** Cell look per outcome: label, background, text, border (from the design's matrix). */
const META: Record<CellKind | 'none', [string, string, string, string]> = {
  pass: ['Pass', 'rgba(52,227,203,0.16)', ACCENT, 'rgba(52,227,203,0.35)'],
  bug: ['Bug', 'rgba(255,107,91,0.2)', '#FF8A7B', '#FF6B5B'],
  flaky: ['Flaky', 'rgba(139,124,255,0.22)', '#B9A6FF', 'rgba(139,124,255,0.6)'],
  setup: ['Setup', 'rgba(139,124,255,0.22)', '#B9A6FF', 'rgba(139,124,255,0.6)'],
  stuck: ['Stuck', 'rgba(142,155,178,0.2)', '#B4BFD2', 'rgba(142,155,178,0.5)'],
  changed: ['Changed', 'rgba(106,166,255,0.18)', '#8DB8FF', 'rgba(106,166,255,0.5)'],
  none: ['Not run', 'transparent', '#6F7C94', 'rgba(255,255,255,0.18)'],
};

const LEGEND: (CellKind | 'none')[] = ['pass', 'bug', 'flaky', 'setup', 'stuck', 'changed', 'none'];

/** Network and screen profiles: choose the defaults and overrides, and see the latest runs by flow and profile. */
export default async function ProfilesScreen() {
  await connection();
  const [settings, flows, runs, viewer] = await Promise.all([getSettings(), listFlows(), listRuns(), currentViewer()]);
  const readOnly = viewer?.role !== 'member';
  const usable = flows.filter((f) => !f.error);
  const configured: ProfileId[] = [{ network: settings.profiles.network, screen: settings.profiles.screen }, ...Object.values(settings.profiles.perFlow)];
  const matrix = buildMatrix(runs, usable.map((f) => f.name), configured);
  const careless = settings.exploration.enabled && settings.exploration.personas.includes('careless-typer');

  return (
    <div style={css(bg)}>
      <Topbar active="Profiles" accent={ACCENT} />
      <main style={main()}>
        <header>
          <div style={eyebrow(ACCENT)}>Network and screen profiles</div>
          <h1 style={h1}>Test the way your users really live</h1>
          <div style={css('font-size: 15.5px; color: #A3AEC2; margin-top: 8px; max-width: 700px; line-height: 1.5')}>
            Bugs hide on slow networks and small screens. Any flow can run under any profile with one setting. The next run uses what you save here.
          </div>
        </header>

        <ProfilesEditor
          initial={settings.profiles}
          flows={usable.map((f) => ({ file: f.file, name: f.name }))}
          readOnly={readOnly}
        />

        <section style={card('padding: 28px 30px')}>
          <div style={css('display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 20px')}>
            <div>
              <div style={css('font-size: 20px; font-weight: 800; letter-spacing: -0.5px')}>Latest run, flow by profile</div>
              <div style={css('font-size: 13.5px; color: #A3AEC2; margin-top: 4px')}>
                Spot bugs that only appear under real-world conditions. Runs from before profiles existed count as the default profile.
              </div>
            </div>
            <div style={css('display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 12.5px; color: #A3AEC2')}>
              {LEGEND.map((k) => (
                <span key={k} style={css('display: inline-flex; align-items: center; gap: 7px')}>
                  <span style={css(`width: 12px; height: 12px; border-radius: 4px; box-sizing: border-box; background: ${META[k][1]}; border: 1px ${k === 'none' ? 'dashed' : 'solid'} ${META[k][3]}`)} />
                  {META[k][0]}
                </span>
              ))}
            </div>
          </div>
          {matrix.rows.length === 0 ? (
            <div style={css('font-size: 14px; color: #8E9BB2')}>No flows yet. Add a flow in flows/ and run it.</div>
          ) : (
            <div style={css('overflow-x: auto')}>
              <div style={css(`min-width: 640px; display: grid; grid-template-columns: 1.5fr repeat(${String(matrix.columns.length)}, minmax(0, 1fr)); gap: 8px`)}>
                <div />
                {matrix.columns.map((c) => (
                  <div key={`${c.network}|${c.screen}`} style={css('font-size: 12.5px; font-weight: 800; color: #C7D0E0; padding: 0 4px 6px; line-height: 1.35')}>
                    {screenLabel(c.screen)}
                    <div style={css('color: #8E9BB2; font-weight: 600; margin-top: 2px')}>{networkLabel(c.network)}</div>
                  </div>
                ))}
                {matrix.rows.flatMap((r) => [
                  <div key={`${r.flow}-name`} style={css('display: flex; align-items: center; font-size: 14px; font-weight: 700; padding-right: 8px; overflow-wrap: anywhere')}>
                    {r.flow}
                  </div>,
                  ...r.cells.map((cell, i) => {
                    const m = META[cell?.kind ?? 'none'];
                    const style = css(
                      `height: 46px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 12.5px; font-weight: 800; box-sizing: border-box; color: ${m[2]}; background: ${m[1]}; border: 1px ${cell ? 'solid' : 'dashed'} ${m[3]}${cell?.kind === 'bug' ? '; box-shadow: 0 0 22px -6px rgba(255,107,91,0.7)' : ''}`,
                    );
                    return cell ? (
                      <Link key={`${r.flow}-${String(i)}`} href={`/runs/${cell.runId}`} style={style}>
                        {m[0]}
                      </Link>
                    ) : (
                      <div key={`${r.flow}-${String(i)}`} style={style}>
                        {m[0]}
                      </div>
                    );
                  }),
                ])}
              </div>
            </div>
          )}
        </section>

        <section style={card('padding: 26px 30px; display: flex; flex-wrap: wrap; align-items: center; gap: 18px 36px')}>
          <div style={css('flex: 1 1 360px')}>
            <div style={css('font-size: 20px; font-weight: 800; letter-spacing: -0.5px')}>Indian formats for the careless typer</div>
            <div style={css('font-size: 13.5px; color: #A3AEC2; margin-top: 6px; line-height: 1.5')}>
              This is not a separate setting. It is part of the Careless typer persona in Exploration, which is meant to type odd input like the examples here into your forms to catch validation bugs.
            </div>
          </div>
          <div style={css('flex: 2 1 480px; display: flex; flex-wrap: wrap; align-items: center; gap: 10px')}>
            {['+91 98765 43210', 'PIN 560001', 'GSTIN 29ABCDE1234F1Z5', '₹1,499.00', '22/10/2026'].map((label) => (
              <span key={label} style={css(`font-family: ${MONO}; font-size: 13px; padding: 10px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04)`)}>
                {label}
              </span>
            ))}
            <Link href="/explore" style={css(`min-height: 44px; display: inline-flex; align-items: center; font-size: 13.5px; font-weight: 800; color: ${ACCENT}`)}>
              {careless ? 'Careless typer is on in Exploration' : 'Careless typer is off. Turn it on in Exploration'}
            </Link>
          </div>
        </section>
        <div style={css('font-size: 12px; color: #6F7C94')}>Live data: settings and run results are read every time you open this page.</div>
      </main>
    </div>
  );
}
