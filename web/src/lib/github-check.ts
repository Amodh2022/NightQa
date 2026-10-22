export interface GithubCheckResult {
  readonly ok: boolean;
  /** Safe to show and to store: never contains the token. */
  readonly message: string;
}

export const REPO_RE = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Asks GitHub for the repository with the saved token (`GET /repos/{repo}`) and reports what really came back.
 * Runs on the server only. The token is sent as a header and never appears in the returned message.
 */
export async function testGithub(repo: string, token: string, apiUrl: string, fetcher: Fetch = fetch): Promise<GithubCheckResult> {
  if (!REPO_RE.test(repo)) return { ok: false, message: 'The repository must look like owner/name.' };
  try {
    const res = await fetcher(`${apiUrl.replace(/\/$/, '')}/repos/${repo}`, {
      headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28', 'user-agent': 'nightqa-dashboard' },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const j = (await res.json().catch(() => ({}))) as { full_name?: unknown; private?: unknown; has_issues?: unknown };
      const name = typeof j.full_name === 'string' ? j.full_name : repo;
      if (j.has_issues === false) return { ok: false, message: `Reached ${name}, but Issues are switched off for it, so NightQA cannot file bugs there.` };
      return { ok: true, message: `Reached ${name} (${j.private === true ? 'private' : 'public'}). The token can read it.` };
    }
    if (res.status === 401) return { ok: false, message: 'GitHub rejected the token (401). It may be wrong, expired or revoked.' };
    if (res.status === 403) return { ok: false, message: 'GitHub refused the request (403). The token may lack access or you may be rate limited.' };
    if (res.status === 404) return { ok: false, message: 'GitHub says the repository was not found (404). Check the name, and that the token can see that repository.' };
    return { ok: false, message: `GitHub answered with status ${String(res.status)}.` };
  } catch {
    return { ok: false, message: 'Could not reach GitHub (network error or timeout).' };
  }
}
