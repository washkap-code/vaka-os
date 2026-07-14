# P9-010 — Refresh-token rotation and replay containment

**Status:** Implementation complete; local security and regression gates passed; remote release pending
**Priority:** P0 security and sign-in reliability  
**Depends on:** P9-008 account security and server sessions; P9-009 explicit tenant ownership  
**Authority:** VAKA Constitution; User Session & Activity Specification; Security Principles

## Outcome

Keep an authenticated web user signed in through short-lived access-token
expiry without weakening revocation, tenant isolation or MFA assurance. Every
successful renewal rotates a server-held refresh credential. Reuse of a
superseded credential ends the affected session and records security evidence.

Success means:

- an active session can renew without entering a password again;
- raw refresh credentials are never stored in PostgreSQL or browser-readable
  storage;
- each refresh credential is single-use;
- refresh replay revokes the affected session and cannot mint an access token;
- password reset, MFA changes, user disablement, owner/admin revocation and
  sign-out still invalidate renewal immediately;
- access tokens remain compatible during the staged migration; and
- tenant and platform audit trails record renewal and replay outcomes without
  credential material.

## User and business problem

**User:** authenticated tenant and governed platform workforce users on the web
application.

**Problem:** the current one-hour access token expires without a safe renewal
path. Users are forced back through sign-in, while a stolen bearer token remains
the only session credential until expiry or explicit revocation.

**Measurable result:** a verified renewal test crosses access-token expiry
without password entry; rotation, replay, expiry, revocation and cross-session
negative tests pass; the existing authentication and tenant suites remain green.

## Scope

1. Add nullable, hashed refresh-token state to `user_sessions` for a compatible
   migration of existing sessions.
2. Issue a high-entropy opaque refresh credential when a new authenticated
   session is created.
3. Deliver it only in a `Secure` (production), `HttpOnly`, `SameSite=Strict`,
   path-restricted cookie.
4. Add a public, rate-limited renewal endpoint which accepts only that cookie.
5. Lock the session row during renewal, rotate both access and refresh
   credentials atomically, and preserve the original absolute session limit.
6. Retain the immediately previous refresh hash only for replay detection.
7. On replay, revoke the session, record a redacted event and refuse renewal.
8. Add one client-side, single-flight renewal attempt after an authentication
   failure, then retry the original request once.
9. Clear the refresh cookie on sign-out and failed renewal.
10. Add schema readiness checks, migration evidence, tests and operational
    documentation.

## Deliberate exclusions

- OAuth, OIDC, SAML, API keys, native-device secure storage and offline sync.
- Cross-device session transfer or trusted-device scoring.
- Mandatory MFA or new step-up policy.
- A distributed edge rate limiter; the existing deployment-layer requirement
  remains.
- Moving access tokens out of browser storage. This mission is the compatible
  rotation step; a later cookie/session transport mission must include a full
  CSRF design and staged cutover.

## Security and data rules

- Derive the user, tenant, platform role and assurance level from the locked
  server-side session and active user record. Never accept them from the client.
- Hash refresh credentials with domain-separated server secret material.
- Never log, audit, return in JSON, persist, or expose a raw refresh credential
  to application JavaScript.
- Keep refresh state nullable until all older deployments have crossed the
  migration safely. Existing access tokens continue to work until their normal
  expiry or revocation, but cannot renew without a refresh credential.
- A refresh hash may identify only one session. The session/user tenant pairing
  must remain unchanged.
- Renewal is denied for revoked, idle-expired, absolute-expired, disabled-user
  or MFA-inconsistent sessions.
- Replay revocation is fail-closed and scoped to the affected session; it does
  not silently revoke unrelated devices.
- Rotation and its security event are atomic. No access token is returned if
  persistence fails.
- Audit metadata may include session ID, client type and reason, but no token,
  cookie, IP address, MFA secret or password material.

## Permissions and audit

Renewal requires possession of the valid current refresh credential for the
existing server session; it grants no new permissions. Every new access token
re-resolves active identity state through the normal authentication middleware.

Record:

- `security.session_refreshed` for a tenant user;
- `security.session_refresh_replay` for tenant replay containment;
- equivalent `platform_admin.*` events for platform workforce sessions.

Routine invalid/expired anonymous refresh attempts are not persisted, avoiding
an unauthenticated audit-amplification path. Operational rate-limit evidence
remains in deployment telemetry.

## Mobile, accessibility and localisation

The web client renews in the background and preserves the current view. If
renewal fails, it returns to the existing accessible sign-in experience. No new
visual component or untranslated user-facing copy is introduced. Native clients
will require a later secure-storage transport rather than copying the web cookie.

## Failure behaviour

- Missing, malformed, expired or unknown cookie: generic `401`, clear cookie.
- Replayed previous credential: revoke session, generic `401`, clear cookie.
- Revoked/disabled/MFA-inconsistent session: generic `401`, clear cookie.
- Database failure: no credential rotation and no new access token.
- Client renewal failure: clear the access token, do not loop, and surface the
  existing sign-in state.

## Verification

- schema migration on legacy-style and fresh databases;
- migration idempotency and runtime schema readiness;
- current-token rotation and previous-token replay containment;
- concurrent/single-flight browser renewal behaviour;
- revoked, expired, disabled, cross-session and cross-tenant negative cases;
- MFA assurance preservation;
- tenant and platform audit redaction;
- complete server tests and typecheck;
- web typecheck, accessibility, design-token and production-build gates;
- dependency audit and secret/diff integrity scans.

## Release gates

Production requires reviewed migration preflight, backup/restore evidence,
remote checks, staged renewal/replay validation, deployment verification and a
live smoke test. This mission must not be described as active until those gates
pass.

## Rollback

Revert the endpoint and client renewal logic first. Retain nullable refresh
columns and security events during rollback so evidence is not destroyed and
older access-token sessions continue normally. Revoke affected sessions if a
credential incident prompted rollback.
