# ADR 0003: The dashboard is a Next.js app in web/, ported 1:1 from the design

- Status: accepted
- Date: 2026-10-22

## Context

The brief defers the dashboard to V1, but the approved "Moonlight" design (web, mobile, landing) is ready and the
founder asked for every screen to match it exactly.

## Decision

`web/` is a Next.js + Tailwind app. `web/scripts/convert-design.mjs` converts `design/source/*.dc.html` into React
components and routes, carrying markup, inline styles and chart logic over unchanged. Tailwind's preflight is
disabled so nothing shifts from the design. Screens show the design's sample data until the engine's results are wired in.

## Consequences

- Pixel-faithful and re-runnable when the design changes. The generated screens use `@ts-nocheck`; replacing them with
  typed, hand-maintained components is tracked in PLAN.md.
- The engine and the dashboard are independent for now, so the engine's quality gates are not blocked by the UI.
