import Link from 'next/link';
import { RunNowMenu } from '@/components/RunNowMenu';
import { css } from '@/lib/dc';
import type { StepId } from '@/lib/setup-state';
import { AccountForm } from '../settings/AccountForm';
import { AppForm } from '../settings/AppForm';
import { GithubForm } from '../settings/GithubForm';
import { NotifyField } from '../settings/NotifyForms';
import type { DashboardState } from '../settings/state';

export const STEP_TITLE: Record<StepId, string> = {
  url: 'Add your staging URL',
  account: 'Add a test account',
  github: 'Connect GitHub',
  flow: 'Write or import a flow',
  run: 'Run now',
  notify: 'Get the report by Slack',
};

export const STEP_INTRO: Record<StepId, string> = {
  url: 'The staging site NightQA tests. Staging only: production-looking addresses are refused by the engine.',
  account: 'NightQA logs in as this account on staging. Use a test user, never a real customer. Flows refer to it by name, so passwords never appear in flow files.',
  github: 'Where NightQA files proven bugs as issues. Create a fine-grained token for one repository with Issues read and write, save it, then test it. The test calls GitHub for real.',
  flow: 'A flow says in plain language what a user does. Flows live in the flows/ folder of your repo.',
  run: 'Run one flow now and read your first report. Anything suspicious is replayed 3 times before it is reported.',
  notify: 'Optional. Save a Slack webhook so reports have somewhere to go. Email, webhooks and recipients are in Settings.',
};

const link = css('min-height: 50px; box-sizing: border-box; padding: 0 22px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.05); display: inline-flex; align-items: center; font-size: 15px; font-weight: 700');

/** The real form (or action) for one step. Every control here saves for real. */
export function StepBody({ id, s, compact = false }: { id: StepId; s: DashboardState; compact?: boolean }) {
  if (id === 'url') return <AppForm name={s.settings.app.name} targetUrl={s.settings.app.targetUrl} readOnly={s.readOnly} />;
  if (id === 'account') return <AccountForm readOnly={s.readOnly} large={!compact} />;
  if (id === 'github') return <GithubForm repo={s.settings.github.repo} hasToken={s.secretNames.has('github:token')} readOnly={s.readOnly} />;
  if (id === 'notify') return <NotifyField name="notify:slack-webhook" label="Slack webhook URL" placeholder="https://hooks.slack.com/services/..." saved={s.secretNames.has('notify:slack-webhook')} readOnly={s.readOnly} />;
  if (id === 'flow') {
    return (
      <div style={css('display: flex; flex-direction: column; gap: 14px')}>
        <div style={css('font-size: 14px; color: #C7D0E0')}>{s.flows.length === 0 ? 'There are no flows in flows/ yet.' : `${String(s.flows.length)} flow file(s) found in flows/. Add more any time.`}</div>
        <div style={css('display: flex; gap: 10px; flex-wrap: wrap')}>
          <Link href="/editor" style={link}>Write a flow</Link>
          <Link href="/import" style={link}>Import Excel or CSV</Link>
        </div>
      </div>
    );
  }
  return (
    <div style={css('display: flex; flex-direction: column; gap: 14px')}>
      {s.flows.length === 0 ? <div style={css('font-size: 14px; color: #FFC14D; font-weight: 700')}>Add a flow first: there is nothing to run yet.</div> : null}
      <div style={css('min-height: 260px')}>
        <RunNowMenu flows={s.flows.filter((f) => !f.error).map((f) => ({ file: f.file, name: f.name, hasSavedTest: f.hasSavedTest }))} readOnly={s.readOnly} />
      </div>
    </div>
  );
}
