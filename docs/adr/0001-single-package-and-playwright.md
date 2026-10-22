# ADR 0001: One package for the engine, and Playwright as the browser layer

- Status: accepted
- Date: 2026-10-22

## Context

NightQA is built by one person in small vertical slices. The MVP is a command-line engine; a hosted product
(API, queue, database, dashboard) comes only after a pilot proves the core loop. The agent needs to drive a real
browser, record video and traces, throttle the network, emulate small phone screens, and produce tests the customer
can keep and run without us.

## Decision

1. **A single package at the repo root** holds the engine (`src/`, `zoo/`, `eval/`). No monorepo tooling yet.
   Internal boundaries are folders (`core` pure, `io` adapters, `app` wiring) enforced by ports and dependency
   injection, not by package boundaries. The dashboard lives in `web/` as a separate Next.js app because it has its
   own toolchain; it shares no code with the engine yet.
2. **Playwright** is the only browser layer. It ships video, traces, screenshots, request interception (used for the
   staging-origin lock and request spacing), network throttling and device profiles, and its test runner is what the
   generated regression tests use. Customers own plain `.spec.ts` files and can run them with `npx playwright test`
   if NightQA disappears.

## Consequences

- Fast to build and refactor; one install, one CI job, one lockfile.
- Splitting into packages later is mechanical because `core` has no I/O and depends only on ports.
- Android (V2) needs a second driver behind the same `BrowserDriver` port (Maestro, per the PRD); the loop does not
  change.
- We accept Playwright's browser download size and Chromium-first behavior for the MVP.

## Alternatives considered

- Monorepo (pnpm workspaces) now: extra ceremony with no second consumer yet.
- Puppeteer / Selenium: weaker tracing and test runner, and no first-class generated-test story.
- Cypress: in-browser model makes origin locking and multi-tab flows harder.
