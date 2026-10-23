# ADR 0008: Postgres for run and bug metadata, evidence stays on disk

- Status: accepted
- Date: 2026-10-23

## Context

Everything NightQA remembers is a file: the engine writes `results/<run-id>/*` and the dashboard reads those files back,
and the dashboard keeps its own state in `data/*.json`. That was right for the MVP, but it has limits we now hit:

- Lists (`listRuns`, `listBugs`) read every run folder. They get slower with every night of history.
- Several files are read, changed and rewritten with no lock (coverage, the fix ledger). Two writers can lose updates.
- Run status is guessed from a process id and file times, which breaks once the engine and the dashboard are not in the
  same container.
- Projects (one app URL each), history across projects and the live run stream all want queryable, shared state.

The project rules said "no Postgres until PLAN.md says so". The owner chose Postgres explicitly, so PLAN.md now has a
"V1 storage" section and this ADR records how.

## Decision

- **Postgres holds metadata**: projects, runs, run events, bugs, coverage, the fix ledger, the audit log. It is the
  source of truth when `DATABASE_URL` is set.
- **Evidence stays on disk** in `results/<run-id>/`: video, screenshots, traces, generated specs, replay output. These
  are large binary files; the database stores their relative paths only. Evidence is still served through the existing
  path-traversal-safe route.
- **Ports and adapters.** Storage sits behind small interfaces (as `FixLedger` already does). The current file code
  becomes the file adapter and stays the default when `DATABASE_URL` is not set, so tests, the zero-config CLI and the
  existing setup keep working. Postgres adapters are chosen by configuration.
- **Plain SQL migrations, no ORM.** Numbered files in `db/migrations/`, applied in order by `nightqa db migrate`, each in
  a transaction, with a checksum recorded so an edited migration is caught. An advisory lock stops two processes
  migrating at once. Fewer dependencies (`pg` only), and Zod validates every row at the boundary.
- **Fail closed.** If `DATABASE_URL` is set but the database cannot be reached, the command stops with a clear message; it
  never silently falls back to files and splits history across two stores.
- **Reliability.** Connect, query and idle timeouts; transient errors (connection reset, server restarting) retried with
  backoff and jitter via the existing `retryTransient`; writes are idempotent (upserts keyed by run and bug id).
- **Secrets.** `DATABASE_URL` lives in `.env` / the environment only. It is never logged: errors and logs show the URL
  with the password removed. The vault of encrypted account passwords keeps its current format for now.
- **Docker.** A `postgres` service with a health check and a named volume, not published to the host. The app and the
  runner receive `DATABASE_URL`.
- **Runs get an explicit status and a heartbeat** instead of a process-id check.

## Consequences

- One more service to run and back up. The compose file makes it one command; `pg_dump` of one database is the backup.
- Existing history is not lost: `nightqa db import` (a later slice) copies `results/*` and `data/*.json` into Postgres,
  and can be run again safely.
- Tests that touch Postgres need a database. They run in CI against a service container and are skipped locally unless
  `NIGHTQA_TEST_DATABASE_URL` is set; the file adapter and the shared contract tests keep running everywhere.
- Rolling back means unsetting `DATABASE_URL`; the file adapter still reads the files, which stay in place.
