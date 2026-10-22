import type { CSSProperties, ReactNode } from 'react';
import { css } from '@/lib/dc';
import { GithubForm } from './GithubForm';
import { NotifyField, RecipientsForm } from './NotifyForms';
import { ACCENT, BAD, OFF, OK, Section, WARN, note } from './shared';
import type { DashboardState } from './state';

const logo = (bg: string, fg: string): CSSProperties =>
  css(`width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 17px; font-weight: 800; color: ${fg}; background: ${bg}`);
const rowBox = css('display: flex; flex-direction: column; gap: 14px; padding: 16px 0; border-top: 1px solid rgba(255,255,255,0.07)');
const head = css('display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px');

function Row({ initial, bg, fg, name, text, chip, label, children }: { initial: string; bg: string; fg: string; name: string; text: string; chip: CSSProperties; label: string; children?: ReactNode }) {
  return (
    <div style={rowBox}>
      <div style={head}>
        <div style={logo(bg, fg)}>{initial}</div>
        <div style={css('flex: 1 1 280px; min-width: 0')}>
          <div style={css('font-size: 15px; font-weight: 700')}>{name}</div>
          <div style={css('font-size: 12.5px; color: #8E9BB2; margin-top: 3px; line-height: 1.45')}>{text}</div>
        </div>
        <span style={chip}>{label}</span>
      </div>
      {children}
    </div>
  );
}

export function ConnectionsSection({ s }: { s: DashboardState }) {
  const g = s.checks.github;
  const hasToken = s.secretNames.has('github:token');
  const repo = s.settings.github.repo;
  const tested = g?.repo === repo && g.ok;
  const failed = g?.repo === repo && !g.ok;
  const githubChip = tested ? OK : failed ? BAD : s.connections.github ? WARN : OFF;
  const githubLabel = tested ? 'Connected' : failed ? 'Test failed' : s.connections.github ? 'Saved, not tested' : 'Not connected';
  const githubText = g?.repo === repo ? `${g.message}` : repo ? `${repo} · token ${hasToken ? 'saved' : 'missing'}. Press Test connection to check it.` : 'Where NightQA files proven bugs as issues. Issues read and write only; code access stays off.';
  const n = (name: string): boolean => s.secretNames.has(name);
  return (
    <Section id="connections" title="Connections">
      <div style={css('display: flex; flex-direction: column; margin-top: 12px')}>
        <Row initial="G" bg="#EAF0FA" fg="#070A10" name="GitHub" text={githubText} chip={githubChip} label={githubLabel}>
          <GithubForm repo={repo} hasToken={hasToken} readOnly={s.readOnly} />
        </Row>
        <Row initial="S" bg="#4A154B" fg="#FFFFFF" name="Slack" text="Morning report and critical alerts to a Slack channel, through an incoming webhook." chip={s.connections.slack ? OK : OFF} label={s.connections.slack ? 'Connected' : 'Not connected'}>
          <NotifyField name="notify:slack-webhook" label="Slack webhook URL" placeholder="https://hooks.slack.com/services/..." saved={n('notify:slack-webhook')} readOnly={s.readOnly} />
        </Row>
        <Row
          initial="@" bg="rgba(255,255,255,0.1)" fg="#EAF0FA" name="Email"
          text={s.settings.notifications.email.to.length > 0 ? `Morning report to ${s.settings.notifications.email.to.join(', ')}.` : 'Morning report by email, through your SMTP server. Add recipients below.'}
          chip={s.connections.email ? OK : OFF} label={s.connections.email ? 'Connected' : 'Not connected'}
        >
          <NotifyField name="notify:smtp-url" label="SMTP URL" placeholder="smtps://user:password@smtp.example.com:465" saved={n('notify:smtp-url')} readOnly={s.readOnly} />
          <NotifyField name="notify:smtp-from" label="From address" placeholder="NightQA <reports@shopkart.example>" saved={n('notify:smtp-from')} readOnly={s.readOnly} />
          <RecipientsForm to={s.settings.notifications.email.to} readOnly={s.readOnly} />
        </Row>
        <Row initial="W" bg="rgba(106,166,255,0.2)" fg="#6AA6FF" name="Webhook" text="A generic JSON webhook for your own tools." chip={s.connections.webhook ? OK : OFF} label={s.connections.webhook ? 'Connected' : 'Not connected'}>
          <NotifyField name="notify:webhook-url" label="Webhook URL" placeholder="https://example.com/hooks/nightqa" saved={n('notify:webhook-url')} readOnly={s.readOnly} />
        </Row>
        <Row initial="W" bg="rgba(52,227,203,0.2)" fg={ACCENT} name="WhatsApp" text="No provider is built in yet." chip={OFF} label="Not available yet" />
        <Row initial="P" bg="rgba(139,124,255,0.2)" fg="#8B7CFF" name="Push notifications" text="Mobile push is not built yet." chip={OFF} label="Not available yet" />
      </div>
      <div style={note}>
        Connected means the details are saved in the encrypted vault. The engine does not send reports to Slack, email or a webhook yet, so saving an address does not deliver anything today.
      </div>
    </Section>
  );
}
