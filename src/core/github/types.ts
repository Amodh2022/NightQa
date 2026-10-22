/** Ports: NightQA talks to GitHub only through this interface (Octokit lives in io/). */

export interface GitHubIssue {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly state: 'open' | 'closed';
  readonly url: string;
}

export interface GitHubComment {
  readonly body: string;
  readonly createdAt: string;
}

export type PullState = 'open' | 'merged' | 'closed';

export interface GitHubPull {
  readonly number: number;
  readonly url: string;
  readonly state: PullState;
}

export interface LabelSpec {
  readonly name: string;
  readonly color: string;
  readonly description: string;
}

export interface GitHubPort {
  /** Issues carrying all of these labels, newest first. Pull requests are excluded. */
  listIssues(labels: readonly string[], state: 'open' | 'all'): Promise<readonly GitHubIssue[]>;
  createIssue(input: {
    readonly title: string;
    readonly body: string;
    readonly labels: readonly string[];
  }): Promise<GitHubIssue>;
  listComments(issueNumber: number): Promise<readonly GitHubComment[]>;
  addComment(issueNumber: number, body: string): Promise<void>;
  /** Creates any label that does not exist yet. Idempotent. */
  ensureLabels(labels: readonly LabelSpec[]): Promise<void>;
  /** Pull requests that reference this issue. */
  linkedPulls(issueNumber: number): Promise<readonly GitHubPull[]>;
}
