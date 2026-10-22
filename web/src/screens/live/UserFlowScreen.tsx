import Link from 'next/link';
import { css, route } from '@/lib/dc';
import { COLORS } from '@/lib/format';
import { FONT } from './ui';

/**
 * The explanatory "User flow" diagram. It is static on purpose: it describes how the product is used, so it
 * carries no figures. Links open the real screens.
 */
const { accent: ACCENT, coral: CORAL, blue: BLUE, amber: AMBER, violet: VIOLET } = COLORS;

interface Stop {
  readonly name: string;
  readonly note: string;
  readonly href: string;
  readonly color: string;
}

const HEADS = ['Get started', 'Read the report', 'Understand the bug', 'Review the fix', 'Merge and learn'] as const;

const WEB: readonly Stop[] = [
  { name: 'Setup', note: 'Start free from the landing page and connect your staging app.', href: 'Setup.dc.html', color: BLUE },
  { name: 'Overview', note: 'The night in one view: what was found and what needs you.', href: 'Main.dc.html', color: ACCENT },
  { name: 'Bugs and Run', note: 'Open a bug, watch the replay, see the evidence.', href: 'Bugs.dc.html', color: CORAL },
  { name: 'Bug and fix PR', note: 'Failing test, risk gauge and verification report.', href: 'Bug.dc.html', color: AMBER },
  { name: 'Autonomy', note: 'Merged fixes become nightly tests. Unlock auto-merge when trusted.', href: 'Autonomy.dc.html', color: VIOLET },
];

const MOBILE: readonly Stop[] = [
  { name: 'Setup', note: 'The same setup steps from your phone.', href: 'MSetup.dc.html', color: BLUE },
  { name: 'Morning report', note: 'Night timeline and the one fix waiting for you.', href: 'MHome.dc.html', color: ACCENT },
  { name: 'Bugs and Run', note: 'Bug list, then the replay of what broke.', href: 'MBugs.dc.html', color: CORAL },
  { name: 'Review a fix PR', note: 'Verification report and one-tap approve.', href: 'MBug.dc.html', color: AMBER },
  { name: 'Alerts', note: 'Critical alerts and “PR merged, test added”.', href: 'MAlerts.dc.html', color: VIOLET },
];

const LANES: readonly { readonly name: string; readonly mobile: boolean; readonly stops: readonly Stop[] }[] = [
  { name: 'Web', mobile: false, stops: WEB },
  { name: 'Mobile', mobile: true, stops: MOBILE },
];

const ANYTIME: readonly (readonly [string, string])[] = [
  ['Landing page', 'Landing.dc.html'],
  ['Flows and editor', 'Flows.dc.html'],
  ['Import from Excel', 'Import.dc.html'],
  ['Exploration', 'Explore.dc.html'],
  ['Profiles', 'Profiles.dc.html'],
  ['Settings', 'Settings.dc.html'],
  ['Usage and billing', 'Billing.dc.html'],
  ['Notifications', 'Reports.dc.html'],
];

const ARROW_BOX = 'flex: 0 0 56px; display: flex; align-items: center; justify-content: center';
const LINE = `width: 30px; height: 2px; background: ${ACCENT}; box-shadow: 0 0 10px rgba(52,227,203,0.6)`;
const HEAD = `width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-left: 9px solid ${ACCENT}`;

function Thumb({ color, mobile }: { color: string; mobile: boolean }) {
  const box = mobile
    ? `flex: 0 0 58px; height: 108px; border-radius: 14px; padding: 9px 8px; gap: 7px`
    : `flex: 0 0 108px; height: 78px; border-radius: 12px; padding: 10px; gap: 8px`;
  const dot = mobile ? 14 : 18;
  return (
    <div aria-hidden="true" style={css(`${box}; border: 1.5px solid ${color}; background: #0B1019; box-sizing: border-box; display: flex; flex-direction: column; position: relative`)}>
      <span style={css('height: 7px; border-radius: 4px; width: 70%; background: rgba(255,255,255,0.28)')} />
      <span style={css('height: 7px; border-radius: 4px; width: 45%; background: rgba(255,255,255,0.14)')} />
      <span style={css(`position: absolute; right: 9px; bottom: 9px; width: ${String(dot)}px; height: ${String(dot)}px; border-radius: 50%; background: ${color}; box-shadow: 0 0 14px ${color}`)} />
    </div>
  );
}

export default function UserFlowScreen() {
  return (
    <div style={css(`width: 1800px; min-height: 1180px; box-sizing: border-box; padding: 56px 64px; font-family: ${FONT}; color: #EAF0FA; background: radial-gradient(1000px 520px at 15% -100px, rgba(52,227,203,0.17), transparent 62%), radial-gradient(900px 520px at 95% 100%, rgba(139,124,255,0.14), transparent 62%), #070A10; display: flex; flex-direction: column; gap: 30px`)}>
      <header style={css('display: flex; justify-content: space-between; align-items: flex-end; gap: 24px')}>
        <div>
          <div style={css(`font-size: 12.5px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 700; color: ${ACCENT}`)}>User flow</div>
          <h1 style={css('margin: 8px 0 0; font-size: 46px; line-height: 1.05; font-weight: 800; letter-spacing: -1.8px')}>From signup to a merged fix</h1>
        </div>
        <div style={css('font-size: 15px; color: #A3AEC2; max-width: 460px; line-height: 1.5; text-align: right')}>Web and mobile follow the same five steps. Click any screen to open it.</div>
      </header>

      <ol aria-label="The five steps" style={css('list-style: none; margin: 0; padding: 0; display: flex; align-items: center')}>
        <li aria-hidden="true" style={css('flex: 0 0 120px')} />
        {HEADS.map((label, i) => (
          <li key={label} style={css(`flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; margin-right: 56px`)}>
            <span style={css(`width: 32px; height: 32px; border-radius: 50%; background: ${ACCENT}; color: #03211D; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800; box-shadow: 0 0 22px rgba(52,227,203,0.6)`)}>{i + 1}</span>
            <span style={css('font-size: 16px; font-weight: 800; letter-spacing: -0.3px')}>{label}</span>
          </li>
        ))}
      </ol>

      <section style={css('display: flex; flex-direction: column; gap: 22px')}>
        {LANES.map((lane) => (
          <div key={lane.name} style={css('display: flex; align-items: stretch')}>
            <div style={css('flex: 0 0 120px; display: flex; align-items: center')}>
              <span style={css('font-size: 13px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: #EAF0FA; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.14); padding: 9px 16px; border-radius: 99px')}>{lane.name}</span>
            </div>
            {lane.stops.map((s, i) => {
              const last = i === lane.stops.length - 1;
              return (
                <div key={s.name} style={css('display: contents')}>
                  <Link
                    href={route(s.href)}
                    style={css(`flex: 1; min-width: 0; display: flex; gap: 16px; align-items: center; padding: 18px 20px; border-radius: 22px; border: 1px solid ${s.color}55; background: linear-gradient(180deg, ${s.color}18, rgba(255,255,255,0.012)); box-shadow: 0 0 50px -22px ${s.color}99, inset 0 1px 0 rgba(255,255,255,0.08)`)}
                  >
                    <Thumb color={s.color} mobile={lane.mobile} />
                    <div style={css('min-width: 0')}>
                      <div style={css('font-size: 17px; font-weight: 800; letter-spacing: -0.3px')}>{s.name}</div>
                      <div style={css('font-size: 12.5px; color: #B4BFD2; margin-top: 5px; line-height: 1.45')}>{s.note}</div>
                    </div>
                  </Link>
                  <div aria-hidden="true" style={css(last ? 'flex: 0 0 56px' : ARROW_BOX)}>
                    {last ? null : (
                      <>
                        <span style={css(LINE)} />
                        <span style={css(HEAD)} />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </section>

      <div style={css('display: flex; align-items: center')}>
        <div style={css('flex: 0 0 120px')} />
        <div style={css('flex: 1; display: flex; align-items: center; gap: 14px; padding-left: 8px')}>
          <span style={css('font-size: 13px; color: #8E9BB2')}>Every night the loop repeats</span>
          <span aria-hidden="true" style={css(`flex: 1; height: 2px; background: linear-gradient(90deg, rgba(255,255,255,0.05), ${ACCENT}); box-shadow: 0 0 12px rgba(52,227,203,0.5)`)} />
          <span style={css(`font-size: 12.5px; font-weight: 800; color: ${ACCENT}`)}>Back to step 2</span>
        </div>
      </div>

      <section style={css('padding: 20px 24px; border-radius: 22px; border: 1px solid rgba(255,255,255,0.09); background: rgba(255,255,255,0.03)')}>
        <div style={css('font-size: 13px; font-weight: 800; color: #A3AEC2; margin-bottom: 12px')}>Anytime, from the top bar or settings</div>
        <div style={css('display: flex; flex-wrap: wrap; gap: 10px')}>
          {ANYTIME.map(([label, href]) => (
            <Link key={label} href={route(href)} style={css('min-height: 44px; box-sizing: border-box; padding: 0 18px; display: inline-flex; align-items: center; border-radius: 99px; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.05); font-size: 13.5px; font-weight: 700')}>
              {label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
