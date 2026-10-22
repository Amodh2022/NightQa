# ADR 0005: GitHub sign-in for the dashboard, closed by default

- Status: accepted
- Date: 2026-10-22

## Context

The first live dashboard had no authentication. It can start runs (spending AI quota) and shows videos and screenshots of the
staging app, and the Docker stack published its port on every network interface. The PRD plans sign-in with GitHub and roles
(owner, member, viewer).

## Decision

- **GitHub OAuth web flow** with `state` and PKCE, minimal scopes (`read:user`, plus `read:org` only when an org allow-list is set).
  The access token is used for two read-only calls and discarded.
- **Allow-list, not open sign-up.** `NIGHTQA_AUTH_USERS` (members), `NIGHTQA_AUTH_VIEWERS` (read-only) or `NIGHTQA_AUTH_ORG`. A
  valid GitHub account that is not on the list is refused.
- **Fail closed.** If any required setting is missing the dashboard serves only a page that lists what to set. The only way to run
  without sign-in is the explicit `NIGHTQA_AUTH=off`, documented for local development.
- **Stateless sessions.** An HMAC-SHA256 signed cookie (12 hours; `HttpOnly`, `SameSite=Lax`, `__Host-` prefix over HTTPS) so there is no
  database to run yet. Revoking a user means removing them from the list and rotating `NIGHTQA_SESSION_SECRET`.
- **One access function.** `routeAccess` decides every request in the proxy: public routes are `/login`, `/api/auth/*` and static
  assets; everything else needs a session; viewers cannot mutate. The run API re-checks the role.
- **Smaller blast radius by default.** Docker binds ports to `127.0.0.1`; sharing is an explicit `NIGHTQA_BIND=0.0.0.0`.
- Each run stores `startedBy` in `job.json`, the start of the activity log the PRD asks for.

## Consequences

- A first-time user sees a setup page, not data, until they create a GitHub OAuth app. That is deliberate.
- Sessions cannot be revoked individually before they expire. Fine for a small team; a database-backed session store
  belongs with the hosted product.
- Self-hosted GitHub Enterprise works through `NIGHTQA_GITHUB_URL` and `NIGHTQA_GITHUB_API_URL`.
