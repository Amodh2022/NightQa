import type { FixLedger } from '../../src/core/github/report.js';
import type {
  GitHubComment,
  GitHubIssue,
  GitHubPort,
  GitHubPull,
  LabelSpec,
} from '../../src/core/github/types.js';

export class FakeGitHub implements GitHubPort {
  issues: ({ -readonly [K in keyof GitHubIssue]: GitHubIssue[K] } & { labels: string[] })[] = [];
  comments = new Map<number, GitHubComment[]>();
  labels: string[] = [];
  listIssues(labels: readonly string[], state: 'open' | 'all') {
    return Promise.resolve(
      this.issues.filter(
        (i) => labels.every((l) => i.labels.includes(l)) && (state === 'all' || i.state === 'open'),
      ),
    );
  }
  createIssue(i: { title: string; body: string; labels: readonly string[] }) {
    const issue = {
      number: this.issues.length + 1,
      title: i.title,
      body: i.body,
      state: 'open' as const,
      url: `https://x/${String(this.issues.length + 1)}`,
      labels: [...i.labels],
    };
    this.issues.push(issue);
    return Promise.resolve(issue);
  }
  listComments(n: number) {
    return Promise.resolve(this.comments.get(n) ?? []);
  }
  addComment(n: number, body: string) {
    this.comments.set(n, [...(this.comments.get(n) ?? []), { body, createdAt: 'now' }]);
    return Promise.resolve();
  }
  ensureLabels(l: readonly LabelSpec[]) {
    this.labels = l.map((x) => x.name);
    return Promise.resolve();
  }
  pulls = new Map<number, GitHubPull[]>();
  linkedPulls(n: number) {
    return Promise.resolve(this.pulls.get(n) ?? []);
  }
}

export class MemLedger implements FixLedger {
  byDate = new Map<string, string[]>();
  count(d: string) {
    return Promise.resolve(this.byDate.get(d)?.length ?? 0);
  }
  record(d: string, id: string) {
    this.byDate.set(d, [...(this.byDate.get(d) ?? []), id]);
    return Promise.resolve();
  }
}
