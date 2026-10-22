# ADR 0006: Proof gates, then GitHub issues and a fix request

- Status: accepted
- Date: 2026-10-22

## Context

The PRD promises "proven bugs with ready-to-review fixes, not a list of maybes": no bug reaches GitHub unless it reproduced
on every replay and a failing test was run and failed. The agent run alone cannot give that: a single AI judgement is one
sample, and a generated test that was never run proves nothing.

## Decision

- **Replayable proof.** A failed expectation records what a no-AI replay can re-check: wrong text that is visible, expected text
  that is absent, controls that are disabled. No proof, no confirmation (fail closed). Signal bugs (JS error, 5xx, dead link,
  blank page, spinner) are matched by kind and page.
- **Reproducer.** 3 replays in fresh browsers. 3/3 confirmed, 0 discarded, otherwise flaky (a "needs a look" list, never GitHub).
  The recipe is shortened with delta debugging under a trial budget; the short recipe must itself pass 3/3, else the full one is kept.
  Absence-only proofs are not shortened because they also hold before any action.
- **Failing test writer.** A plain Playwright spec asserts the correct behaviour. It is RUN by the real Playwright runner and kept
  only if it failed at the bug check (the failure message carries a bug marker), so a test that fails on a broken locator is rejected.
- **GitHub.** One issue per stable bug id, found by a marker on the first line. Open duplicate: a "seen again" comment, once per run.
  Closed duplicate: a new issue linking the old one (a regression). Fix request: `@claude` comment, High and Critical only, at most
  3 a night, counted in a ledger before the comment is posted so a failure never exceeds the limit. Manual and off modes exist.
- **Untrusted text.** Page-derived text is neutralized in issues (mentions broken, fences and tables escaped).
- **Port.** GitHub is a `GitHubPort`; Octokit is an adapter with timeouts, retry with backoff and jitter, and Zod validation.

## Consequences

- Fewer reports, all proven. A real bug can be held back as `test_not_proven` when the agent could not give replayable proof.
- Each bug costs several extra browser launches (3 replays plus up to 12 shortening trials, plus the test run); `NIGHTQA_MAX_BUGS_PER_RUN` bounds it.
- The nightly ledger is a local file. Running NightQA from several machines against one repo needs a shared ledger (V1).
