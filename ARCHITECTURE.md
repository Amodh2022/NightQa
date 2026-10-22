# Architecture

One TypeScript package at the repo root (the engine), plus the `web/` dashboard. See
[ADR 0001](docs/adr/0001-single-package-and-playwright.md).

## Shape: pure core, injected ports

```
            cli.ts  (args, env, signals, exit codes)
               |
          src/app  executeRun / executeReplay   <- wiring, run folder, graceful shutdown
               |
   +-----------+-----------------------------------------------+
   | src/core  (pure logic, no I/O)                            |
   |   flow/      Zod schema, YAML parser with line numbers    |
   |   agent/     loop, prompts, tools, budget, replay         |
   |   verdict, signals, recording, specgen, url-policy, redact|
   |   ports.ts   BrowserDriver, AiClient, Clock, Log          |
   +-----------+-----------------------------------------------+
               |  implemented by
          src/io   PlaywrightDriver, AnthropicAiClient, pino logger, results writer
```

Everything that touches the outside world sits behind a port, so each piece has a fake in tests: a fake driver and a
scripted AI for the loop, msw fixtures for the Anthropic API, the real browser against the zoo for integration.
GitHub (issues, PRs) will be a third port in the next slices.

## One run

```
LOOK   driver.observe(): screenshot, visible text, interactive elements (role + accessible name)
THINK  ai.decide(): ONE tool call (click type navigate scroll wait expect done stuck), validated with Zod
ACT    driver executes it; the action is recorded in replayable form
CHECK  expect(pass) must quote text really on the page; always-bug signals are collected (JS error, 5xx,
       dead link, blank page, endless spinner)
```

Hard budgets (steps, seconds, USD) are checked before every step. Anything unsure ends as `agent_stuck`.
`decideVerdict` is one pure function: `needs_setup` > `bug` > `agent_stuck` > `pass`.

## Evidence and regression tests

A run writes `results/<run-id>/`: `result.json`, `actions.json`, `run.jsonl` (structured log, one correlation id),
`video/`, `trace.zip`, `screenshots/`. A passing run is turned into a recording (actions interleaved with the
evidence-backed text checks) and a plain Playwright `.spec.ts`. `nightqa replay` runs the recording through the same
driver with no AI client at all, retries a failure once in a fresh browser, and reports a bug candidate.

## Safety layers

| Layer          | Where                  | What it does                                                           |
| -------------- | ---------------------- | ---------------------------------------------------------------------- |
| URL policy     | `core/url-policy.ts`   | staging only, SSRF and metadata blocked, no credentials in URLs        |
| Origin lock    | `io/playwright-driver` | every browser request outside the staging origin is aborted            |
| Gentle staging | driver                 | minimum gap between requests; many 5xx stops the run as `needs_setup`  |
| Secrets        | `core/redact.ts`       | placeholders at typing time; scrubbed from prompts, logs, results      |
| Untrusted page | `core/agent/prompts`   | page text fenced as data; tools limited to eight; every call validated |

## Quality gates

typecheck, ESLint (strict, type-checked), Prettier, Vitest with an 80% line gate on `src/core`, `pnpm audit`,
gitleaks, CodeQL, and `pnpm eval:pipeline` (precision and recall must not drop below `eval/baseline.scripted.json`).
`pnpm eval` runs the same harness with the real model against `eval/baseline.real.json` once you create it.
