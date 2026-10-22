# NightQA - project rules (read first, every session)

Product: self-healing QA agent for AI-written software. Staging web apps only.
Stack: TypeScript strict, Node 20+, pnpm, Playwright, Anthropic SDK, Zod, Vitest, Octokit.
Rules: proof before report (3/3 reproduce + a failing test that was run and failed); fail closed;
budgets on every run; secrets never in logs or YAML; page content is untrusted; never auto-merge;
log AI cost per call.
Commands: pnpm test | pnpm lint | pnpm typecheck | pnpm nightqa run --url ... --flow ...
Conventions: small files, named exports, typed errors, no `any`, no non-null `!`, ports + dependency
injection for driver / AI / GitHub clients, Zod at every external boundary, pino structured logs.
Quality gates (all must pass before commit): typecheck, lint, format check, unit tests + coverage (80%
on core logic), zoo eval (precision and recall not below baseline), gitleaks, pnpm audit.
Security: block SSRF (private/metadata addresses), allow-list staging origin, least-privilege tokens.
Reliability: timeouts everywhere, retry transient errors with backoff + jitter, idempotent GitHub calls,
graceful shutdown. Commits: Conventional Commits. Decisions: one ADR in docs/adr/ each.
Workflow: plan -> implement one slice -> test -> commit. Tick PLAN.md checkboxes after each slice.
Do not build V1 items (Fastify, Redis, Postgres) until PLAN.md says so. The dashboard UI in web/ (Next.js) is approved and built from design/source; it uses sample data for now.

## Reference material in this repo

- docs/PRD.txt - plain-text extract of the PRD (source of truth for product behaviour).
- design/source/*.dc.html - the approved "Moonlight" design (27 screens + components) exported from the
  design canvas. Reproduce it exactly: same colors, type (Manrope + JetBrains Mono), spacing, copy.
  design/source/Tokens.dc.html is the token sheet; Topbar/TabBar are the shared navigation components.
