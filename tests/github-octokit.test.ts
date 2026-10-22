import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GitHubError } from '../src/core/errors.js';
import { OctokitGitHub, parseRepo } from '../src/io/github-octokit.js';

const API = 'https://api.github.com/repos/acme/shop';
const calls: { method: string; url: string; body?: unknown; auth: string | null }[] = [];
const server = setupServer();
beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  calls.length = 0;
});
afterAll(() => {
  server.close();
});

const gh = () =>
  new OctokitGitHub({
    token: 'ghp_secret_token_value',
    repo: 'acme/shop',
    retry: { sleep: () => Promise.resolve(), retries: 2 },
  });
const issue = (n: number, extra: Record<string, unknown> = {}) => ({
  number: n,
  title: `t${String(n)}`,
  body: 'b',
  state: 'open',
  html_url: `https://github.com/acme/shop/issues/${String(n)}`,
  ...extra,
});
const track = async (request: Request) => {
  calls.push({
    method: request.method,
    url: request.url,
    auth: request.headers.get('authorization'),
    ...(request.method === 'POST' ? { body: await request.json() } : {}),
  });
};

describe('OctokitGitHub (contract)', () => {
  it('parses repositories', () => {
    expect(parseRepo('acme/shop')).toEqual({ owner: 'acme', name: 'shop' });
    expect(parseRepo('https://github.com/acme/shop.git')).toEqual({ owner: 'acme', name: 'shop' });
    expect(() => parseRepo('nonsense')).toThrow(GitHubError);
  });

  it('lists labelled issues and drops pull requests', async () => {
    server.use(
      http.get(`${API}/issues`, async ({ request }) => {
        await track(request);
        return HttpResponse.json([issue(1), issue(2, { pull_request: {} })]);
      }),
    );
    const out = await gh().listIssues(['nightqa'], 'all');
    expect(out.map((i) => i.number)).toEqual([1]);
    expect(calls[0]?.url).toContain('labels=nightqa');
    expect(calls[0]?.auth).toBe('token ghp_secret_token_value');
  });

  it('creates an issue with labels', async () => {
    server.use(
      http.post(`${API}/issues`, async ({ request }) => {
        await track(request);
        return HttpResponse.json(issue(7), { status: 201 });
      }),
    );
    const created = await gh().createIssue({ title: 'T', body: 'B', labels: ['nightqa'] });
    expect(created.number).toBe(7);
    expect(calls[0]?.body).toEqual({ title: 'T', body: 'B', labels: ['nightqa'] });
  });

  it('retries a transient 503 and then succeeds, but gives up on a 404 without leaking the token', async () => {
    let n = 0;
    server.use(
      http.post(`${API}/issues/3/comments`, () =>
        ++n < 3 ? new HttpResponse(null, { status: 503 }) : HttpResponse.json({}, { status: 201 }),
      ),
      http.post(`${API}/issues/4/comments`, () =>
        HttpResponse.json({ message: 'Not Found' }, { status: 404 }),
      ),
    );
    await gh().addComment(3, 'hi');
    expect(n).toBe(3);
    const err = await gh()
      .addComment(4, 'hi')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GitHubError);
    expect((err as GitHubError).status).toBe(404);
    expect((err as GitHubError).message).not.toContain('ghp_secret_token_value');
  });

  it('creates only the labels that are missing', async () => {
    server.use(
      http.get(`${API}/labels`, () => HttpResponse.json([{ name: 'nightqa' }])),
      http.post(`${API}/labels`, async ({ request }) => {
        await track(request);
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    await gh().ensureLabels([
      { name: 'nightqa', color: '5b3df5', description: 'd' },
      { name: 'severity: high', color: 'd93f0b', description: 'd' },
    ]);
    expect(calls.map((c) => (c.body as { name: string }).name)).toEqual(['severity: high']);
  });

  it('finds the pull requests that reference an issue, with their state', async () => {
    const xref = (n: number, state: string, merged: string | null) => ({
      event: 'cross-referenced',
      source: {
        issue: {
          number: n,
          html_url: `https://github.com/acme/shop/pull/${String(n)}`,
          state,
          pull_request: { merged_at: merged },
        },
      },
    });
    server.use(
      http.get(`${API}/issues/1/timeline`, () =>
        HttpResponse.json([
          xref(10, 'open', null),
          xref(11, 'closed', '2026-10-22T00:00:00Z'),
          xref(12, 'closed', null),
          { event: 'labeled' },
          {
            event: 'cross-referenced',
            source: { issue: { number: 13, html_url: 'u', state: 'open' } },
          },
        ]),
      ),
    );
    const pulls = await gh().linkedPulls(1);
    expect(pulls.map((p) => [p.number, p.state])).toEqual([
      [10, 'open'],
      [11, 'merged'],
      [12, 'closed'],
    ]);
  });
});
