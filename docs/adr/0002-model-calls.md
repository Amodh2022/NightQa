# ADR 0002: How we call the model

- Status: accepted
- Date: 2026-10-22

## Context

The brief asks for low temperature, validated tool calls and no hard-coded model names. Current Claude models reject
sampling parameters (`temperature`, `top_p`, `top_k`) and reject forced tool choice (`tool_choice` of `any` or `tool`).

## Decision

- Model names and per-token prices come from environment variables (`NIGHTQA_MODEL_STRONG`, `NIGHTQA_PRICE_STRONG_*`),
  validated once at startup. Cost per call is computed from them and logged.
- `tool_choice: auto` with parallel tool calls disabled. The prompt says "exactly one tool call per turn". Every
  call is validated with Zod; an invalid or missing call is rejected and counted, and three in a row end the run.
- No sampling parameters are sent. Determinism comes from low `effort` (default `low`), a short fresh prompt per turn
  (no hidden chat history) and strict validation. This replaces "low temperature" from the brief.
- A pass must quote text that is really on the page (`visible_text`). The loop re-checks it against the observation
  and rejects invented evidence. The same snippets become the replay assertions, so replays need no AI.

## Consequences

- Runs are not bit-for-bit repeatable; the reproducer (3 of 3 replays) and the eval gate absorb that.
- Switching models is a configuration change, not a code change.
