# ADR 0007: Dashboard settings, encrypted vault and autonomy levels

- Status: accepted
- Date: 2026-10-22

## Context

The dashboard screens for Settings, Autonomy, Profiles, Notifications and Setup showed design sample data. To make them real the
dashboard needs somewhere to keep settings and secrets, and the engine needs to receive them without trusting web requests.

## Decision

- **Settings** live in `data/settings.json` (zod-validated, atomic writes, owner-only permissions) and are the single source of truth.
  The target URL may be edited by members, but it is still checked by the engine's staging-only and SSRF rules at run time, and the
  private-network consent stays an environment setting an operator controls.
- **Secrets** (test accounts, GitHub token, Slack/webhook/SMTP) live in an AES-256-GCM vault (`data/vault.json`). The key comes from
  `NIGHTQA_SECRET_KEY` (or the sign-in session secret); without a key nothing is stored. Values never reach the browser; the launcher
  decrypts them only to build the engine process environment.
- **Engine input** is built by one pure module (`engine-args.ts`): budgets, reporting, blocked pages/actions and device profile become
  flags and environment variables. The web request can only choose a flow and a mode.
- **Autonomy levels.** L0 proves bugs and keeps them local, L1 opens issues, L2 also asks the team's coding agent for fixes (max 3 a night).
  **L3 (auto-merge) is not built**: nothing merges without a human (project rule). A "pause all" switch stops the launcher and scheduler.
- **Audit log** (`data/audit.jsonl`): names and short facts only; sign-in, sign-in failures, settings saves and run starts are recorded.
- **Sign-in rate limiting**: sliding-window limits on starting sign-in and on failed callbacks; forwarding headers are trusted only with
  `NIGHTQA_TRUST_PROXY=1`.

## Consequences

- A lost `NIGHTQA_SECRET_KEY` means re-entering secrets. That is deliberate.
- The data folder must be on a persistent volume in Docker.
- Rate limiting is per process (in memory); several dashboard replicas would each keep their own counters.
