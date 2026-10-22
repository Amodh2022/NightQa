import { connection } from 'next/server';
import { css } from '@/lib/dc';
import { eyebrow, h1, main } from './live/ui';
import { AccountsSection, AppSection } from './settings/AppAccountsSections';
import { ConnectionsSection } from './settings/ConnectionsSection';
import { ScheduleSection } from './settings/ScheduleSection';
import { SecuritySection, TeamSection } from './settings/TeamSecuritySections';
import { loadState } from './settings/state';
import Topbar from './Topbar';

const ACCENT = '#34E3CB';
const SECTIONS = [
  ['Apps and environments', '#apps'],
  ['Test accounts', '#accounts'],
  ['Schedule and limits', '#schedule'],
  ['Connections', '#connections'],
  ['Team', '#team'],
  ['Security and data', '#security'],
] as const;

/** Settings, live: every field reads from and saves to the real settings file and the encrypted vault. */
export default async function Settings() {
  await connection();
  const s = await loadState();
  return (
    <div style={css("min-height: 100vh; font-family: 'Manrope', system-ui, sans-serif; color: #EAF0FA; background: radial-gradient(1000px 520px at 85% -120px, rgba(52,227,203,0.12), transparent 62%), radial-gradient(760px 520px at 2% 20%, rgba(106,166,255,0.10), transparent 62%), #070A10")}>
      <Topbar active="Settings" accent={ACCENT} />
      <main style={main()}>
        <header>
          <div style={eyebrow(ACCENT)}>Settings · {s.settings.app.name}</div>
          <h1 style={h1}>Settings</h1>
          {s.readOnly ? <div style={css('margin-top: 10px; font-size: 14px; color: #FFC14D; font-weight: 700')}>Your account is view-only. You can see everything but not change it.</div> : null}
        </header>
        <div style={css('display: flex; flex-wrap: wrap; gap: 32px; align-items: flex-start')}>
          <nav aria-label="Sections" style={css('flex: 0 0 240px; display: flex; flex-direction: column; gap: 4px')}>
            {SECTIONS.map(([label, href]) => (
              <a key={href} href={href} style={css('display: flex; align-items: center; min-height: 44px; box-sizing: border-box; padding: 0 14px; border-radius: 12px; font-size: 14px; font-weight: 600; color: #A3AEC2')}>
                {label}
              </a>
            ))}
          </nav>
          <div style={css('flex: 1 1 640px; min-width: 0; display: flex; flex-direction: column; gap: 22px')}>
            <AppSection s={s} />
            <AccountsSection s={s} />
            <ScheduleSection s={s} />
            <ConnectionsSection s={s} />
            <TeamSection />
            <SecuritySection s={s} />
          </div>
        </div>
      </main>
    </div>
  );
}
