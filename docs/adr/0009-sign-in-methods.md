# ADR 0009: More than one way to sign in (GitHub, OpenID Connect, email + password)

- Status: accepted
- Date: 2026-10-23

## Context

ADR 0005 added GitHub sign-in only. Teams that self-host their identity provider (Keycloak, Authentik, Authelia, Zitadel,
Okta, Azure AD, Google) cannot use the dashboard, and small teams without GitHub accounts have no way in. The owner asked
for a proper login page with a self-hosted SSO option, and chose OpenID Connect and local email + password next to GitHub.

## Decision

- **Several providers, one session.** Each provider proves who the person is and which role they get; after that the
  existing signed session cookie, `routeAccess` and the member/viewer rules apply unchanged. The session also records
  which method was used.
- **Closed by default, per method.** A method is shown only when it is completely configured; a half-configured method is
  a startup problem (listed on the setup page), not a silently open door. With nothing configured the dashboard serves
  only the setup page, as before. `NIGHTQA_AUTH=off` remains the one explicit dev switch. Existing GitHub settings keep
  working without any change.
- **OpenID Connect, generic.** Authorization code flow with PKCE, `state` and `nonce`. Endpoints come from the issuer's
  discovery document, whose `issuer` must equal the configured one. The ID token is verified with the `jose` library
  (signature from the provider's JWKS, issuer, audience, expiry, nonce) rather than hand-written. An unverified email
  (`email_verified: false`) is refused. Who may sign in is an allow-list: exact emails, email domains, or provider groups
  (a configurable claim); groups can map to member or viewer. No rule means nobody. Plain `http://` issuers are refused
  unless they are localhost or `NIGHTQA_OIDC_ALLOW_HTTP=1`.
- **Email + password, only with Postgres.** Accounts live in a `users` table (ADR 0008). Passwords are hashed with scrypt
  (Node's built-in `crypto`, per-user salt, constant-time compare, parameters stored with the hash so they can be raised
  later). Unknown emails take the same time as wrong passwords, and the error message is the same. Five wrong passwords
  lock the account for 15 minutes; the per-client rate limiter from ADR 0007 still applies. The first member is created
  from `NIGHTQA_BOOTSTRAP_EMAIL` and `NIGHTQA_BOOTSTRAP_PASSWORD` when the table is empty (remove them afterwards). There is
  no self sign-up and no password reset by email yet.
- **Identity strings do not collide.** GitHub logins have no `@`; OIDC and password identities are the lower-cased email.
  `startedBy` and the audit log keep using that string.
- **Secrets** (client secrets, session secret, bootstrap password) live only in the environment, never in logs, YAML or
  the page. Errors shown on the login page are fixed phrases that reveal nothing about the identity provider's answer.

## Consequences

- SAML and LDAP are not supported. OIDC covers the common self-hosted providers; SAML can be added as another provider.
- Sessions are still stateless and cannot be revoked one by one. A disabled password account is checked at sign-in only.
- Without Postgres the password method is hidden; GitHub and SSO work with no database.
