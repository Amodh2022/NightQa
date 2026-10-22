import { accountsFromSecretNames, type AccountView } from '@/lib/accounts';
import { currentViewer, type Viewer } from '@/lib/auth/server';
import { getChecks, type ConnectionChecks } from '@/lib/connection-checks';
import { listFlows, type FlowInfo } from '@/lib/flows';
import { listRuns, type RunView } from '@/lib/results';
import { getSettings, type Settings } from '@/lib/settings';
import { computeSetup, type SetupState } from '@/lib/setup-state';
import { checkStagingUrl, type StagingCheck } from '@/lib/staging-check';
import { targetUrl } from '@/lib/paths';
import { listSecretNames } from '@/lib/vault';

export interface DashboardState {
  readonly viewer: Viewer | undefined;
  readonly readOnly: boolean;
  readonly settings: Settings;
  readonly secretNames: ReadonlySet<string>;
  readonly accounts: readonly AccountView[];
  readonly flows: readonly FlowInfo[];
  readonly runs: readonly RunView[];
  readonly checks: ConnectionChecks;
  readonly staging: StagingCheck;
  readonly connections: { readonly github: boolean; readonly slack: boolean; readonly email: boolean; readonly webhook: boolean };
  readonly setup: SetupState;
}

/** Everything Settings and Setup show, read from what is really saved. Holds names of secrets, never values. */
export async function loadState(): Promise<DashboardState> {
  const [viewer, settings, names, flows, runs, checks] = await Promise.all([currentViewer(), getSettings(), listSecretNames().catch((): string[] => []), listFlows(), listRuns(), getChecks()]);
  const secretNames = new Set(names);
  const accounts = accountsFromSecretNames(names, flows);
  const staging = checkStagingUrl(settings.app.targetUrl || targetUrl());
  const connections = {
    github: secretNames.has('github:token') && settings.github.repo !== '',
    slack: secretNames.has('notify:slack-webhook'),
    email: secretNames.has('notify:smtp-url') && secretNames.has('notify:smtp-from'),
    webhook: secretNames.has('notify:webhook-url'),
  };
  const setup = computeSetup({
    urlStatus: staging.status,
    urlSaved: settings.app.targetUrl !== '',
    accounts,
    repo: settings.github.repo,
    hasGithubToken: secretNames.has('github:token'),
    githubCheck: checks.github,
    flowCount: flows.length,
    finishedRuns: runs.filter((r) => r.status === 'finished').length,
    notifyConnected: [connections.slack, connections.email, connections.webhook].filter(Boolean).length,
  });
  return { viewer, readOnly: viewer?.role !== 'member', settings, secretNames, accounts, flows, runs, checks, staging, connections, setup };
}
