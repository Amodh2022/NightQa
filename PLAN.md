# NightQA - PLAN

Status legend: [ ] todo, [x] done. One vertical slice at a time; commit after each.

## Task 1 - `nightqa run --url <staging> --flow flows/checkout.yaml` works end to end (MVP engine)

- [x] (a) Project setup: strict TypeScript, ESLint, Prettier, Vitest
- [x] (b) Zod flow schema + YAML loader with friendly errors
- [x] (c) Bug zoo demo shop in ./zoo with 10 seeded bugs + BUGS.md answer key
- [x] (d) Playwright web driver: observe, click, type, navigate, scroll, wait
- [x] (e) Agent loop with budgets (40 steps / 300 s / $0.50) and cost logging
- [x] (f) Verdicts; video, trace, screenshots and JSON in ./results/<run-id>/
- [ ] (g) Save passing run as Playwright test; replay with zero AI calls
- [x] (h) Quality foundation: GitHub Actions CI, Husky + lint-staged, README, ARCHITECTURE.md,
      .env.example, SECURITY.md, ADR 0001 (single package, why Playwright)

Definition of done: zoo flow gives the right verdict, passing run replays with 0 AI calls, cost per run
printed, every section-9 quality gate green in CI.

## Week 2-3 MVP (from PRD)

- [ ] Reproducer (3x replay, flaky/discarded, shortest recipe, severity)
- [ ] Failing test writer (must run and fail for the bug's reason)
- [ ] GitHub issues with evidence + duplicate check; fix-PR trigger (@claude, max 3/night, High+Critical)

## V1 dashboard - screens from the approved design (web/, Next.js; user approved)

Design source: design/source/. Screens to reproduce exactly:
Web (1440): Overview, Runs, Run detail, Bugs board, Bug and fix PR, Flows, Flow editor, Import from Excel,
Exploration personas, Network and screen profiles, Autonomy and policy, Settings/connections/team,
Usage and billing, Setup in 6 steps, Notifications (email/Slack/WhatsApp/push), Landing page.
V2 preview: Android run and India pack.
Mobile (390): Morning report, Bugs, Review a fix PR, Run replay, Alerts, Setup in 6 steps.
Components: Top navigation, Mobile tab bar. Also: Tokens sheet, User flow diagram.

- [x] Design tokens + shared components (Topbar, TabBar): web/scripts/convert-design.mjs converts design/source/_.dc.html to web/src/screens/_.tsx 1:1
- [x] Web screens (16) + landing page, all routes live; gallery at /screens
- [x] Mobile screens (6) under /m/*
- [x] Live slice: Overview, Runs, Run detail, Bugs and Flows read real results; Run now and per-flow Run/Replay buttons start the engine
- [ ] Live next: Settings (app URL, accounts, budgets, provider), flow editor and Excel import, Bug detail with GitHub issue and fix PR, notifications
- [ ] Replace generated `@ts-nocheck` screens with typed, hand-maintained components

- [x] Docker: single multi-stage image (dashboard, engine CLI, demo shop), docker-compose with health checks, CI smoke test, GHCR publish on tags (ADR 0004)

- [x] Dashboard sign-in: GitHub OAuth, allow-list, member/viewer roles, fail-closed, `startedBy` on runs (ADR 0005)
- [ ] Sign-in: verify against a real GitHub OAuth app (only tested against a fake GitHub so far); login rate limiting; audit log

## Open decisions

- Dashboard lives in web/ (Next.js + Tailwind) beside the future CLI engine; user approved this.
  Tailwind preflight is disabled so the design renders exactly as drawn.
