import { css } from '@/lib/dc';
import { isCompleteAccount } from '@/lib/accounts';
import { AccountForm } from './AccountForm';
import { AppForm } from './AppForm';
import { ActionButton } from './fields';
import { ACCENT, BAD, OK, OFF, Section, note, rowStyle, stagingChip, stagingLabel } from './shared';
import type { DashboardState } from './state';

export function AppSection({ s }: { s: DashboardState }) {
  return (
    <Section id="apps" title="Apps and environments" aside={<span style={stagingChip(s.staging.status)}>{stagingLabel(s.staging.status)}</span>}>
      <AppForm name={s.settings.app.name} targetUrl={s.settings.app.targetUrl} readOnly={s.readOnly} />
      <div style={note}>{s.staging.message}</div>
      <div style={note}>Staging only. A URL that looks like production needs your explicit confirmation to save, and the engine refuses it unless the operator overrides that. Web only for now.</div>
    </Section>
  );
}

export function AccountsSection({ s }: { s: DashboardState }) {
  return (
    <Section
      id="accounts"
      title="Test accounts"
      aside={<span style={css(`font-size: 12.5px; font-weight: 800; color: ${ACCENT}; background: rgba(52,227,203,0.13); padding: 5px 12px; border-radius: 99px`)}>Encrypted at rest · never in logs</span>}
    >
      <div style={css('display: flex; flex-direction: column; margin-top: 12px')}>
        {s.accounts.length === 0 ? <div style={{ ...rowStyle, color: '#A3AEC2', fontSize: 14 }}>No test accounts saved yet.</div> : null}
        {s.accounts.map((a) => (
          <div key={a.name} style={rowStyle}>
            <span style={css('width: 34px; height: 34px; border-radius: 10px; background: rgba(255,255,255,0.07); display: flex; align-items: center; justify-content: center')}>
              <span style={css('width: 14px; height: 10px; border: 2px solid #C7D0E0; border-radius: 3px; display: block; box-sizing: content-box')} />
            </span>
            <div style={css('flex: 1 1 200px')}>
              <div style={css("font-size: 15px; font-weight: 700; font-family: 'JetBrains Mono', monospace")}>{a.name}</div>
              <div style={css('font-size: 12.5px; color: #8E9BB2; margin-top: 2px')}>
                {a.usedBy.length > 0 ? `Used by ${a.usedBy.join(', ')}` : 'Not used by any flow yet'}
              </div>
            </div>
            <span style={isCompleteAccount(a) ? OK : BAD}>{isCompleteAccount(a) ? 'Saved' : 'Incomplete'}</span>
            {s.readOnly ? null : <ActionButton url="/api/settings/accounts" method="DELETE" body={{ name: a.name }} label="Remove" okText="Removed." danger confirmText={`Remove the test account "${a.name}"?`} />}
          </div>
        ))}
      </div>
      <div style={css('margin-top: 18px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,0.07)')}>
        <AccountForm readOnly={s.readOnly} />
      </div>
      <div style={note}>
        Flows refer to an account by name with <span style={css("font-family: 'JetBrains Mono', monospace")}>login: name</span>, so passwords never appear in flow files. Values are never shown again after saving.
        <span style={{ ...OFF, marginLeft: 8, display: 'inline-block' }}>Test OTP: not available</span> There is no OTP provider yet, so one-time codes cannot be stored.
      </div>
    </Section>
  );
}
