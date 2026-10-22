# ADR 0004: One container image for the dashboard, the engine and the demo shop

- Status: accepted
- Date: 2026-10-22

## Context

NightQA needs a real browser, the engine, and the dashboard that starts the engine as a child process. People should be
able to run all of it with one command and without installing Node, pnpm or Chromium.

## Decision

- **One image, three commands.** The dashboard launches the engine CLI as a child process, so the engine and Chromium must
  live in the same container as the dashboard. The same image also serves the CLI (`runner`) and the demo shop (`zoo`),
  which keeps versions in lockstep and the build simple. Compose runs them as separate services from that image.
- **Slim Node base, Chromium headless shell only.** `playwright install --with-deps --only-shell chromium` runs from the
  app's own `node_modules`, so the browser always matches the Playwright version we depend on. Microsoft's Playwright
  image was rejected: it carries Firefox and WebKit we never use (about 3 GB) and its tag has to be kept in step with the
  dependency by hand.
- **Multi-stage build, production dependencies only.** The engine and demo shop are compiled with `tsc` (`dist/`), the
  dashboard with `next build`; the runtime stage installs production dependencies only. The dashboard starts the compiled
  CLI (`NIGHTQA_ENGINE=dist`) instead of `tsx`.
- **Least privilege.** Runs as a non-root user (default uid 1000, overridable with `NIGHTQA_UID`/`NIGHTQA_GID` so bind
  mounts belong to the host user) with `cap_drop: ALL`. Chromium runs without its own sandbox inside the container
  (Playwright's default), so the container is the boundary. `ipc: host` and `init: true` keep Chromium stable.
  `no-new-privileges` is an opt-in override (`docker-compose.hardened.yml`): on at least one tested host (AppArmor) it
  stops every container from starting, so it cannot be the default.
- **Secrets stay out of the image.** `.env` is excluded by `.dockerignore` and passed with `env_file`. Evidence, saved
  tests and flows are bind mounts, so they survive the container and stay readable on the host.
- **The target is configuration, not input.** `NIGHTQA_TARGET_URL` and the private-network consent are set in the
  environment; the browser UI cannot change them.

## Consequences

- The image is large (it contains Chromium). A split into separate dashboard and runner images is possible later by
  moving the launcher behind a queue, which the V1 plan already calls for.
- Hosts whose user is not uid 1000 set `NIGHTQA_UID` and `NIGHTQA_GID` once in `.env`.
