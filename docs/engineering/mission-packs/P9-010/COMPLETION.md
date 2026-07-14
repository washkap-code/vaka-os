# P9-010 Completion Report

**Date:** 2026-07-14  
**Status:** Implementation complete; legacy migration, fresh schema, security
and full local regression gates passed; remote review and production release
pending

## Delivered

- Added compatible refresh state and assurance level to `user_sessions`, with
  unique partial indexes and an `aal1`/`aal2` database constraint.
- Added idempotent migration `0025` and runtime-schema readiness coverage.
- New sessions receive a 256-bit opaque refresh credential; PostgreSQL stores
  only a domain-separated HMAC digest.
- API responses deliver the raw credential only through a production-secure,
  HttpOnly, SameSite-Strict, auth-path cookie and never in JSON.
- Renewal locks one session row, rotates access and refresh credentials
  atomically, advances idle expiry without crossing absolute expiry, and
  preserves MFA assurance.
- Reuse of the immediately previous refresh credential revokes only the
  affected session and records redacted tenant or platform security evidence.
- Sign-out clears the cookie; existing password-reset, MFA-change, user-disable
  and explicit session-revocation paths continue to deny renewal.
- The web client performs one shared renewal for concurrent authentication
  failures, retries each request once and clears access state on failure.
- Added a separate rate limit for the public renewal endpoint.

## Verification evidence

- Legacy populated database: migration `0025` applied successfully.
- Migration idempotency: second application succeeded with existing-column and
  existing-index notices only.
- Fresh database: guarded schema creation, finance integrity controls and seed
  completed successfully.
- Runtime schema readiness: passed.
- Focused auth/ownership/session suite: 4 files and 12 tests passed.
- Expanded refresh protocol suite: 5 tests passed for production cookie policy,
  cookie secrecy, rotation,
  replay, independent devices, sign-out, MFA assurance, platform audit, hash
  redaction and idle expiry.
- Complete server suite on a clean database: 69 files and 235 tests passed.
- Server and web TypeScript checks passed.
- Web renewal tests: 3 passed, including concurrent single-flight behaviour,
  failed-renewal cleanup and no renewal on credential endpoint failures.
- Accessibility negative scanner, 236-token design-system conformance, 11 shell
  tests, 3 invoice-PDF tests and Vite production build passed.
- Migration/app behaviour introduced no journal, tax, currency, stock, invoice,
  numbering, billing or financial-report changes.

## Security review

- Raw refresh credentials do not enter JSON, local storage, database rows,
  audit events or test output.
- Server context controls user, tenant, platform role, session and assurance;
  clients cannot select or elevate them during renewal.
- Row locking makes each credential single-use; replay containment commits
  before the generic unauthorized response is returned.
- Rotation replaces the access-token hash, immediately invalidating the old
  access token while preserving unrelated device sessions.
- Unknown/expired anonymous refresh attempts are not persisted, preventing an
  unauthenticated audit-amplification path.
- Production still requires HTTPS, stable secret configuration, edge/shared
  abuse controls and monitored security events.

## Remaining limits

Access tokens remain in the existing browser-readable compatibility storage;
moving them to a cookie/session-only transport requires a separate staged CSRF
design. Trusted-device policy, risk scoring, risk-based step-up, global incident
revocation, retention/archival and complete authentication-failure coverage are
not claimed by this mission.

## Release evidence

P9-010 is stacked on safely published P9-009 through P6-008 branches. Remote
review, production backup/preflight, ordered migrations `0024` then `0025`, CI,
staged replay testing, deployment verification and live smoke evidence remain
mandatory. This build is not live until every gate passes.
