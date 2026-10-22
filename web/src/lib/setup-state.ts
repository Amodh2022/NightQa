import { isCompleteAccount, type AccountView } from './accounts';
import type { ConnectionChecks } from './connection-checks';
import type { StagingStatus } from './staging-check';

export type StepId = 'url' | 'account' | 'github' | 'flow' | 'run' | 'notify';

export interface SetupInput {
  readonly urlStatus: StagingStatus;
  /** True when a URL was saved in settings (not just the environment fallback). */
  readonly urlSaved: boolean;
  readonly accounts: readonly AccountView[];
  readonly repo: string;
  readonly hasGithubToken: boolean;
  readonly githubCheck: ConnectionChecks['github'];
  readonly flowCount: number;
  readonly finishedRuns: number;
  readonly notifyConnected: number;
}

export interface SetupStep {
  readonly id: StepId;
  readonly n: number;
  readonly label: string;
  readonly done: boolean;
  /** Short status line shown under the step name. */
  readonly note: string;
  /** Rough minutes this step takes when not done yet. An estimate, shown as one. */
  readonly minutes: number;
}

export interface SetupState {
  readonly steps: readonly SetupStep[];
  readonly doneCount: number;
  /** The first step that is not done, or undefined when everything is. */
  readonly current: SetupStep | undefined;
  readonly minutesLeft: number;
}

/** Computes the checklist from what is really saved. Nothing here is a default or a guess about state. */
export function computeSetup(i: SetupInput): SetupState {
  const urlOk = i.urlSaved && i.urlStatus !== 'blocked' && i.urlStatus !== 'empty';
  const complete = i.accounts.filter(isCompleteAccount).length;
  const githubOk = i.hasGithubToken && i.githubCheck?.ok === true && i.githubCheck.repo === i.repo && i.repo !== '';
  const raw: Omit<SetupStep, 'n'>[] = [
    { id: 'url', label: 'Add your staging URL', done: urlOk, minutes: 2, note: urlOk ? 'Saved' : 'Where NightQA tests' },
    { id: 'account', label: 'Add a test account', done: complete > 0, minutes: 3, note: complete > 0 ? `${String(complete)} saved` : 'So flows can log in' },
    { id: 'github', label: 'Connect GitHub', done: githubOk, minutes: 5, note: githubOk ? `Tested ${i.repo}` : i.hasGithubToken ? 'Saved, not tested yet' : 'For bug reports and fix PRs' },
    { id: 'flow', label: 'Write or import a flow', done: i.flowCount > 0, minutes: 10, note: i.flowCount > 0 ? `${String(i.flowCount)} in flows/` : 'Say what users do' },
    { id: 'run', label: 'Run now', done: i.finishedRuns > 0, minutes: 5, note: i.finishedRuns > 0 ? 'First run finished' : 'Read your first report' },
    { id: 'notify', label: 'Get the report by Slack or email', done: i.notifyConnected > 0, minutes: 3, note: i.notifyConnected > 0 ? `${String(i.notifyConnected)} saved` : 'Optional but recommended' },
  ];
  const steps = raw.map((s, idx) => ({ ...s, n: idx + 1 }));
  return {
    steps,
    doneCount: steps.filter((s) => s.done).length,
    current: steps.find((s) => !s.done),
    minutesLeft: steps.filter((s) => !s.done).reduce((a, s) => a + s.minutes, 0),
  };
}

/** The step to show: the one asked for with ?step=N, else the first not-done step, else undefined when all are done. */
export function pickStep(state: SetupState, param: string | undefined): SetupStep | undefined {
  const n = Number(param);
  const asked = Number.isInteger(n) ? state.steps.find((s) => s.n === n) : undefined;
  return asked ?? state.current;
}
