import type { BugRecord } from '../core/bugs/record.js';
import type { GitHubPort, GitHubPull } from '../core/github/types.js';
import { listBugRecords, saveBugRecord } from '../io/bug-store.js';

/** Merged beats open beats closed; among equals the newest pull request wins. */
export function pickPull(pulls: readonly GitHubPull[]): GitHubPull | undefined {
  const rank = { merged: 2, open: 1, closed: 0 } as const;
  return [...pulls].sort((a, b) => rank[b.state] - rank[a.state] || b.number - a.number)[0];
}

/**
 * Refreshes filed bugs from GitHub: is the issue still open, and is there a fix pull request (open, merged or
 * closed)? This is how NightQA measures the merged fix rate. Only bugs that already have an issue are touched.
 */
export async function syncBugs(
  resultsDir: string,
  github: GitHubPort,
  secrets: readonly string[],
  now: () => Date = () => new Date(),
): Promise<{ checked: number; updated: number }> {
  const records = (await listBugRecords(resultsDir)).filter((r) => r.issue);
  if (records.length === 0) return { checked: 0, updated: 0 };
  const issues = new Map((await github.listIssues(['nightqa'], 'all')).map((i) => [i.number, i]));
  let updated = 0;
  for (const rec of records) {
    if (!rec.issue) continue;
    const live = issues.get(rec.issue.number);
    const pull = pickPull(await github.linkedPulls(rec.issue.number));
    const next: BugRecord = {
      ...rec,
      issue: { ...rec.issue, state: live?.state ?? rec.issue.state },
      ...(pull ? { pull: { number: pull.number, url: pull.url, state: pull.state } } : {}),
    };
    if (
      JSON.stringify(next.issue) === JSON.stringify(rec.issue) &&
      JSON.stringify(next.pull) === JSON.stringify(rec.pull)
    )
      continue;
    await saveBugRecord(resultsDir, { ...next, updatedAt: now().toISOString() }, secrets);
    updated++;
  }
  return { checked: records.length, updated };
}
