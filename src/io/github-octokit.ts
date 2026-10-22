import { Octokit } from '@octokit/rest';
import { z } from 'zod';
import { GitHubError } from '../core/errors.js';
import type {
  GitHubComment,
  GitHubIssue,
  GitHubPort,
  GitHubPull,
  LabelSpec,
} from '../core/github/types.js';
import { retryTransient, withTimeout, type RetryOptions } from '../core/retry.js';

export interface OctokitGitHubOptions {
  readonly token: string;
  readonly repo: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly retry?: RetryOptions;
}

const issueSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  body: z.string().nullable().optional(),
  state: z.enum(['open', 'closed']),
  html_url: z.string(),
  pull_request: z.unknown().optional(),
});
const commentSchema = z.object({ body: z.string().optional(), created_at: z.string() });
const labelSchema = z.object({ name: z.string() });
const timelineSchema = z.object({
  event: z.string(),
  source: z
    .object({
      issue: z
        .object({
          number: z.number().int(),
          html_url: z.string(),
          state: z.enum(['open', 'closed']),
          pull_request: z.object({ merged_at: z.string().nullable().optional() }).optional(),
        })
        .optional(),
    })
    .optional(),
});

const MAX_PAGES = 5;

/** Parses "owner/name" (or a github.com URL) into its two parts. */
export function parseRepo(repo: string): { owner: string; name: string } {
  const m =
    /^(?:https?:\/\/github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(
      repo.trim(),
    );
  if (!m?.[1] || !m[2])
    throw new GitHubError(`"${repo}" is not a GitHub repository (use owner/name)`);
  return { owner: m[1], name: m[2] };
}

/**
 * GitHub through Octokit. Every call has a timeout and retries transient failures (429, 5xx, network)
 * with backoff and jitter; responses are validated with Zod before use. Needs only the Issues: write
 * permission (a fine-grained token scoped to one repository).
 */
export class OctokitGitHub implements GitHubPort {
  private readonly kit: Octokit;
  private readonly owner: string;
  private readonly name: string;
  private readonly timeoutMs: number;
  private readonly retry: RetryOptions;

  constructor(opts: OctokitGitHubOptions) {
    const { owner, name } = parseRepo(opts.repo);
    this.owner = owner;
    this.name = name;
    this.timeoutMs = opts.timeoutMs ?? 20_000;
    this.retry = opts.retry ?? {};
    this.kit = new Octokit({
      auth: opts.token,
      userAgent: 'nightqa',
      ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}),
    });
  }

  private call<T>(what: string, fn: () => Promise<T>): Promise<T> {
    return retryTransient(() => withTimeout(fn(), this.timeoutMs, what), this.retry).catch(
      (e: unknown) => {
        const status = (e as { status?: unknown } | null)?.status;
        const reason = e instanceof Error ? e.message.split('\n')[0] : String(e);
        throw new GitHubError(
          `GitHub: ${what} failed${typeof status === 'number' ? ` (${String(status)})` : ''}: ${reason ?? 'error'}`,
          typeof status === 'number' ? status : undefined,
        );
      },
    );
  }

  private toIssue(i: z.infer<typeof issueSchema>): GitHubIssue {
    return {
      number: i.number,
      title: i.title,
      body: i.body ?? '',
      state: i.state,
      url: i.html_url,
    };
  }

  async listIssues(
    labels: readonly string[],
    state: 'open' | 'all',
  ): Promise<readonly GitHubIssue[]> {
    const raw = await this.call('list issues', () =>
      this.kit
        .paginate(
          this.kit.rest.issues.listForRepo,
          { owner: this.owner, repo: this.name, labels: labels.join(','), state, per_page: 100 },
          (r) => r.data,
        )
        .then((all) => all.slice(0, MAX_PAGES * 100)),
    );
    return raw.flatMap((r) => {
      const p = issueSchema.safeParse(r);
      return p.success && p.data.pull_request === undefined ? [this.toIssue(p.data)] : [];
    });
  }

  async createIssue(input: {
    title: string;
    body: string;
    labels: readonly string[];
  }): Promise<GitHubIssue> {
    const r = await this.call('create issue', () =>
      this.kit.rest.issues.create({
        owner: this.owner,
        repo: this.name,
        title: input.title,
        body: input.body,
        labels: [...input.labels],
      }),
    );
    return this.toIssue(issueSchema.parse(r.data));
  }

  async listComments(issueNumber: number): Promise<readonly GitHubComment[]> {
    const raw = await this.call('list comments', () =>
      this.kit.paginate(
        this.kit.rest.issues.listComments,
        { owner: this.owner, repo: this.name, issue_number: issueNumber, per_page: 100 },
        (r) => r.data,
      ),
    );
    return raw.map((c) => {
      const p = commentSchema.parse(c);
      return { body: p.body ?? '', createdAt: p.created_at };
    });
  }

  async addComment(issueNumber: number, body: string): Promise<void> {
    await this.call('add comment', () =>
      this.kit.rest.issues.createComment({
        owner: this.owner,
        repo: this.name,
        issue_number: issueNumber,
        body,
      }),
    );
  }

  async ensureLabels(labels: readonly LabelSpec[]): Promise<void> {
    const have = new Set(
      (
        await this.call('list labels', () =>
          this.kit.paginate(
            this.kit.rest.issues.listLabelsForRepo,
            { owner: this.owner, repo: this.name, per_page: 100 },
            (r) => r.data,
          ),
        )
      ).map((l) => labelSchema.parse(l).name.toLowerCase()),
    );
    for (const l of labels) {
      if (have.has(l.name.toLowerCase())) continue;
      try {
        await this.call('create label', () =>
          this.kit.rest.issues.createLabel({
            owner: this.owner,
            repo: this.name,
            name: l.name,
            color: l.color,
            description: l.description,
          }),
        );
      } catch (e) {
        if (!(e instanceof GitHubError && e.status === 422)) throw e; // 422: created meanwhile
      }
    }
  }

  async linkedPulls(issueNumber: number): Promise<readonly GitHubPull[]> {
    const raw = await this.call('read issue timeline', () =>
      this.kit.paginate(
        this.kit.rest.issues.listEventsForTimeline,
        { owner: this.owner, repo: this.name, issue_number: issueNumber, per_page: 100 },
        (r) => r.data,
      ),
    );
    const out = new Map<number, GitHubPull>();
    for (const e of raw) {
      const t = timelineSchema.safeParse(e);
      const src =
        t.success && t.data.event === 'cross-referenced' ? t.data.source?.issue : undefined;
      if (!src?.pull_request) continue;
      out.set(src.number, {
        number: src.number,
        url: src.html_url,
        state: src.pull_request.merged_at ? 'merged' : src.state === 'open' ? 'open' : 'closed',
      });
    }
    return [...out.values()];
  }
}
