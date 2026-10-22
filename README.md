# NightQA

A self-healing QA agent for AI-written software. It tests your **staging** web app like a real user, proves each
bug before reporting it, and replays passing flows every night with **no AI calls**.

> Status: Task 1 (the engine CLI) is built, and the dashboard in `web/` is live for runs, bugs and flows. The reproducer,
> failing-test writer and GitHub issue/PR steps are next (see [PLAN.md](PLAN.md)).

## How it works

1. You write a flow in plain language (YAML).
2. `nightqa run` opens a real browser (Playwright). Claude picks one action at a time and checks each expectation
   from what it can actually see. Every pass must quote text that is really on the page.
3. The run ends in one verdict: `pass`, `bug`, `app_changed`, `needs_setup` or `agent_stuck`. Video, trace,
   screenshots and JSON land in `./results/<run-id>/`. The cost of the run is printed.
4. A passing run is saved as a plain Playwright test you own. Later nights replay it with `nightqa replay`: fast,
   free, repeatable.

## Quickstart

Requires Node 20+ and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm exec playwright install chromium
cp .env.example .env        # add your key, model name and prices

pnpm zoo                    # terminal 1: the demo shop with 10 seeded bugs (http://127.0.0.1:4010)
pnpm nightqa run --url http://127.0.0.1:4010 --flow flows/checkout.yaml --allow-private-network
```

After a pass, NightQA saves `tests/nightqa/checkout-with-card.spec.ts` (plain Playwright) and a recording:

```bash
pnpm nightqa replay --url http://127.0.0.1:4010 --test tests/nightqa --allow-private-network   # 0 AI calls, $0
NIGHTQA_BASE_URL=http://127.0.0.1:4010 npx playwright test tests/nightqa                      # no NightQA needed
```

Run the shop with a clean baseline (`ZOO_BUGS=none pnpm zoo`) or specific bugs (`ZOO_BUGS=B01,B04`). The answer key is
[zoo/BUGS.md](zoo/BUGS.md).

## Dashboard

```bash
cd web && npm install && npm run dev      # http://localhost:3000
```

It reads the engine's `results/` folder and the `flows/` folder, so what you see is real:

- **Overview, Runs, Run detail, Bugs, Flows** show your actual runs: verdicts, cost, the recorded video, screenshots, the agent's reasoning and the findings.
- **Run now** (and the buttons on each flow) start the engine in the background: "Run with AI", or "Replay, no AI" for flows that already have a saved test. A running run updates itself on the page.
- The app under test comes from `web/.env.local` (`NIGHTQA_TARGET_URL`, and `NIGHTQA_ALLOW_PRIVATE_NETWORK=1` for a local app). Copy `web/.env.local.example`. The target is never taken from the browser, so the dashboard cannot be used to point NightQA at another host.

Not connected yet: the other screens (Explore, Profiles, Settings, Billing, Setup, the flow editor, Excel import, notifications and the mobile and landing pages) are the approved design with sample data. Reproduction counts and GitHub issues need the reproducer and GitHub steps.

## Flow files

```yaml
flow: Checkout with card # required
start: /products # required
login: test-buyer # optional: a saved account name, never a password
tags: [payments, critical]
steps:
  - step: Open the Blue T-shirt, choose size M and add it to the cart
  - step: Open the cart
    expect: cart shows 1 item, the item is size M, and the total is $49.00
```

At least one `expect` per flow. Vague expectations ("looks fine") warn and show a better example. Errors name the line.
Secrets live in the environment: `NIGHTQA_ACCOUNT_TEST_BUYER_USERNAME` / `_PASSWORD`.

## Safety rules (enforced in code)

- **Staging only.** Production-looking URLs are refused unless `--allow-production` is passed.
- **SSRF blocked.** Loopback and private addresses need `--allow-private-network`; cloud metadata (169.254.169.254)
  is always blocked. The browser may only talk to the staging origin.
- **Secrets never leak.** Not into YAML, logs, prompts, results or generated tests.
- **Fail closed.** When unsure: `agent_stuck`. Budgets (40 steps, 300 s, $0.50 per flow) end a run as `agent_stuck`.
- **Page text is untrusted data.** It is fenced in the prompt and can never change tools, budgets or permissions.

## Commands

| Command                                | What it does                                               |
| -------------------------------------- | ---------------------------------------------------------- |
| `pnpm nightqa run --url … --flow …`    | Run one flow with the AI; save a passing run as a test     |
| `pnpm nightqa replay --url … --test …` | Replay saved tests with no AI                              |
| `pnpm zoo`                             | Start the bug zoo demo shop                                |
| `pnpm test` / `pnpm test:coverage`     | Unit and integration tests (real browser against the zoo)  |
| `pnpm typecheck` / `pnpm lint`         | Strict TypeScript and ESLint (type-checked, zero warnings) |
| `pnpm eval:pipeline`                   | Keyless eval of the engine on the zoo (the CI gate)        |
| `pnpm eval`                            | Eval with the real model (precision and recall on the zoo) |

Exit codes: `0` pass, `1` bug found, `2` usage or config error, `3` needs_setup / agent_stuck.

## Repository layout

- `src/core` pure logic: flow schema, agent loop, verdicts, URL policy, recording, spec generator
- `src/io` Playwright driver, Anthropic adapter, logger, results writer
- `src/app` wiring: `executeRun`, `executeReplay`
- `zoo/` the demo shop, its answer key and a scripted stand-in for the model
- `eval/` the precision/recall harness and committed baselines
- `web/` the Next.js dashboard (approved "Moonlight" design in `design/source`; Overview, Runs, Run detail, Bugs and Flows are live, the rest are generated from the design)
- `docs/` PRD text, ADRs

More: [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), [docs/adr](docs/adr).
