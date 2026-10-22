## What and why

<!-- One or two sentences. Link the PLAN.md item or issue. -->

## Checklist

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test:coverage` are green
- [ ] `pnpm eval:pipeline` is green (precision and recall not below the committed baseline)
- [ ] No secrets in code, logs, YAML, fixtures or screenshots
- [ ] Staging-only and SSRF rules still hold (no new way to reach production or private addresses)
- [ ] Docs updated (README / ARCHITECTURE.md / an ADR for a major decision)
- [ ] Commits follow Conventional Commits
