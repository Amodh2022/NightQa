import Link from 'next/link';
import { connection } from 'next/server';
import { css } from '@/lib/dc';
import { authConfig } from '@/lib/auth/server';
import { recentAudit } from '@/lib/audit';
import { shortStamp } from '@/lib/format';
import { countExpired, getRetention } from '@/lib/retention';
import { vaultKeyMaterial } from '@/lib/vault';
import { RetentionForm } from './DataForms';
import { Section, note, rowStyle } from './shared';
import type { DashboardState } from './state';

const role = css('font-size: 12.5px; font-weight: 800; padding: 6px 14px; border-radius: 99px; background: rgba(255,255,255,0.08); color: #C7D0E0');
const avatar = css('width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #3A4560, #1B2233); border: 1px solid rgba(255,255,255,0.14); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800');

export function TeamSection() {
  const cfg = authConfig();
  const people = cfg.mode === 'github' ? [...[...cfg.users].map((u) => ({ name: u, role: 'Member' })), ...[...cfg.viewers].filter((v) => !cfg.users.has(v)).map((u) => ({ name: u, role: 'Viewer' }))] : [];
  return (
    <Section id="team" title="Team">
      <div style={css('display: flex; flex-direction: column; margin-top: 12px')}>
        {cfg.mode === 'off' ? <div style={{ ...rowStyle, color: '#A3AEC2', fontSize: 14 }}>Sign-in is switched off (local development). Everyone who opens the dashboard acts as a local member.</div> : null}
        {cfg.mode === 'unconfigured' ? <div style={{ ...rowStyle, color: '#A3AEC2', fontSize: 14 }}>Sign-in is not configured, so nobody can sign in yet.</div> : null}
        {cfg.mode === 'github' && cfg.org ? (
          <div style={rowStyle}>
            <div style={avatar}>{cfg.org.slice(0, 1).toUpperCase()}</div>
            <div style={css('flex: 1 1 200px')}>
              <div style={css('font-size: 15px; font-weight: 700')}>{cfg.org}</div>
              <div style={css('font-size: 12.5px; color: #8E9BB2; margin-top: 2px')}>Everyone in this GitHub organization can sign in and run things</div>
            </div>
            <span style={role}>Member</span>
          </div>
        ) : null}
        {people.map((p) => (
          <div key={p.name} style={rowStyle}>
            <div style={avatar}>{p.name.slice(0, 1).toUpperCase()}</div>
            <div style={css('flex: 1 1 200px')}>
              <div style={css('font-size: 15px; font-weight: 700')}>@{p.name}</div>
              <div style={css('font-size: 12.5px; color: #8E9BB2; margin-top: 2px')}>{p.role === 'Member' ? 'Can run things and change settings' : 'Read-only'}</div>
            </div>
            <span style={role}>{p.role}</span>
          </div>
        ))}
        {cfg.mode === 'github' && people.length === 0 && !cfg.org ? <div style={{ ...rowStyle, color: '#A3AEC2', fontSize: 14 }}>No one is listed.</div> : null}
      </div>
      <div style={note}>
        Read-only list. Access is managed with NIGHTQA_AUTH_USERS (members), NIGHTQA_AUTH_VIEWERS (viewers) and NIGHTQA_AUTH_ORG on the server. Roles are Member and Viewer. Every settings change is recorded in the activity log below.
      </div>
    </Section>
  );
}

const fact = css('padding: 16px 18px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.09); background: rgba(255,255,255,0.03)');

export async function SecuritySection({ s }: { s: DashboardState }) {
  await connection();
  const [retention, audit] = await Promise.all([getRetention(), recentAudit(30)]);
  const expired = await countExpired(retention.days);
  const provider = process.env.NIGHTQA_PROVIDER === 'nvidia' ? 'nvidia' : 'anthropic';
  const keyPresent = Boolean((provider === 'nvidia' ? process.env.NVIDIA_API_KEY : process.env.ANTHROPIC_API_KEY)?.trim());
  let vaultReady = true;
  try {
    vaultKeyMaterial();
  } catch {
    vaultReady = false;
  }
  const facts: [string, string][] = [
    ['AI provider', `${provider}${process.env.NIGHTQA_PROVIDER ? '' : ' (default, NIGHTQA_PROVIDER not set)'}`],
    ['AI model', process.env.NIGHTQA_MODEL_STRONG ?? 'Not set (NIGHTQA_MODEL_STRONG)'],
    ['AI key', keyPresent ? 'Present on the server (never shown)' : 'Missing on the server'],
    ['AI processing', 'Screenshots and page text are sent to the AI provider to choose actions.'],
    ['Secret storage', vaultReady ? 'Encrypted with AES-256-GCM. The key comes from the server environment.' : 'Not ready: set NIGHTQA_SECRET_KEY (16+ characters). Nothing is stored without it.'],
    ['GitHub access', s.secretNames.has('github:token') ? 'A token is saved. Keep it limited to Issues read and write on one repository.' : 'No token saved. Use Issues read and write on one repository only.'],
  ];
  return (
    <Section id="security" title="Security and data">
      <div style={css('display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin-top: 16px')}>
        {facts.map(([label, value]) => (
          <div key={label} style={fact}>
            <div style={css('font-size: 12.5px; color: #A3AEC2')}>{label}</div>
            <div style={css('font-size: 15px; font-weight: 700; margin-top: 5px; line-height: 1.4')}>{value}</div>
          </div>
        ))}
      </div>
      <RetentionForm days={retention.days} expiredCount={expired} readOnly={s.readOnly} />
      <div style={css('display: flex; gap: 10px; margin-top: 18px; flex-wrap: wrap')}>
        <Link href="/billing" style={css('min-height: 46px; box-sizing: border-box; padding: 0 18px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.18); display: inline-flex; align-items: center; font-size: 14px; font-weight: 700')}>Usage and billing</Link>
      </div>
      <div style={css('margin-top: 26px; font-size: 15px; font-weight: 800')}>Activity log</div>
      <div style={css('display: flex; flex-direction: column; margin-top: 8px')}>
        {audit.length === 0 ? <div style={{ ...rowStyle, color: '#A3AEC2', fontSize: 14 }}>Nothing recorded yet.</div> : null}
        {audit.map((e, i) => (
          <div key={`${e.at}-${String(i)}`} style={{ ...rowStyle, padding: '10px 0', fontSize: 13 }}>
            <span style={css("flex: 0 0 150px; color: #8E9BB2; font-family: 'JetBrains Mono', monospace; font-size: 12px")}>{shortStamp(new Date(e.at))}</span>
            <span style={css('flex: 0 0 110px; font-weight: 700')}>{e.who}</span>
            <span style={css("flex: 0 0 190px; font-family: 'JetBrains Mono', monospace; font-size: 12px")}>{e.action}</span>
            <span style={css('flex: 1 1 200px; color: #A3AEC2; min-width: 0')}>{e.detail ?? ''}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}
