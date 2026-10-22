# Security

## Reporting a vulnerability

Email the maintainer (see the repository owner's profile) with details and steps to reproduce. Please do not open a
public issue for security problems. Expect an acknowledgement within 3 working days.

## What NightQA protects

- **Staging only.** Production-looking URLs are refused unless `--allow-production` is given explicitly.
- **SSRF.** Loopback and private-network targets are refused unless `--allow-private-network` is given. Cloud metadata
  addresses (169.254.0.0/16, `metadata.google.internal`, `fd00:ec2::254`) are always refused, including IPv4-mapped IPv6
  and decimal/hex IP forms. The browser can only reach the staging origin; other requests are aborted.
- **Secrets.** Test credentials come from environment variables (or an encrypted store in the hosted product), never
  from flow YAML (a `password`/`token`/`secret` key is rejected). The model only ever sees the placeholders
  `{{account.username}}` and `{{account.password}}`; real values are substituted at typing time and scrubbed from
  prompts, logs, results and generated tests. Generated tests read credentials from `process.env`.
- **Untrusted page content.** Page text is data. It is fenced in the prompt, and the model can only call eight
  validated tools. Text on a page cannot change instructions, tools, permissions or budgets.
- **No writes to customer code, no merges.** Fixes come from the customer's own coding agent; a human merges.
- **Budgets.** Steps, seconds and AI cost are capped per flow. Exceeding any cap ends the run as `agent_stuck`.
- **Gentle on staging.** Request spacing, and a run stops as `needs_setup` after repeated 5xx responses.

## The dashboard

- **Sign-in is required and fails closed.** GitHub OAuth (with `state` and PKCE) and an allow-list of logins or an organization.
  If sign-in is not fully configured the dashboard serves only a setup page, never the data. `NIGHTQA_AUTH=off` exists for
  local development and must not be used on a shared host.
- **Roles.** Members can start runs; viewers are read-only. Enforced in the proxy and again in the API.
- **Sessions.** HMAC-signed, 12 hours, `HttpOnly`, `SameSite=Lax`, `__Host-` prefix over HTTPS; the GitHub token is used for two
  read-only calls and discarded. Sign-out clears the cookie.
- **Everything is behind the session**, including the evidence files, which can show whatever your staging app shows.
- **The dashboard cannot change what is tested.** The target URL and the private-network consent come from its environment, not
  from requests; POSTs are same-origin only.
- **Network exposure.** Docker publishes ports on `127.0.0.1` by default. Put TLS in front (a reverse proxy) before exposing it,
  and set `NIGHTQA_PUBLIC_URL` to the https address so cookies are marked `Secure`.
- Not built yet: login rate limiting beyond what GitHub provides, an audit log beyond "started by" on each run, and per-flow permissions.

## Operating guidance

- Use least-privilege tokens: GitHub issues and PR status only; Anthropic key scoped to this project.
- Keep `.env` out of git (it is ignored). CI runs gitleaks on every PR and `pnpm audit` on every build.
- Staging should hold test data, not real customer records (India's DPDP Act may apply otherwise).
- Evidence (video, screenshots, logs) can contain whatever your staging app shows. Keep `results/` out of git and
  delete it when no longer needed.
- Install with `pnpm install --frozen-lockfile`; the lockfile is committed. Dependabot and CodeQL are enabled.

## Known limits

- Redaction removes known secret values; it cannot recognise a secret it was never told about. Screenshots are not
  scrubbed pixel by pixel, so use throwaway test accounts.
- DNS rebinding is covered by the origin lock (requests are matched by origin, not resolved address), but the check
  is name-based: do not point a staging hostname at an internal address.
