# LP-003 — CORS and Configuration Hardening

**Status:** Complete and merged through PR #90 (`d883d403`)
**Branch:** `hardening/cors-config-lp003`
**Completed:** 2026-07-16
**Migration:** None; migration number 0046 remains free

## 1. Files created

- `docs/engineering/mission-packs/LP-003/COMPLETION.md`

## 2. Files modified

- `.github/workflows/quality.yml`
- `docs/02-security-compliance.md`
- `server/.env.example`
- `server/src/app.ts`
- `server/src/auth.ts`
- `server/src/config.ts`
- `server/src/index.ts`
- `server/src/security.ts`
- `server/tests/config.test.ts`
- `server/tests/refresh-token-rotation.test.ts`
- `server/tests/security.test.ts`

## 3. Behaviour changes and acceptance evidence

| LP-003 criterion | Result and implementation evidence | Test evidence |
| --- | --- | --- |
| Explicit CORS allow-list; production rejects empty or `*`; credentials only for allowed origins; preflight | Implemented in `server/src/config.ts` (`allowedOrigins`) and `server/src/security.ts` (`corsMiddleware`). Production rejects missing, wildcard, malformed, path-bearing and non-allowlisted origins. Every environment is same-origin by default, and only a trusted configured origin can receive `Access-Control-Allow-Origin` or `Access-Control-Allow-Credentials: true`. | `server/tests/security.test.ts`: **rejects missing, wildcard, malformed and path-bearing production origins**; **allows credentials outside production only for configured origins**; **only allows allowlisted origins in production**; **refuses to initialise in production without an explicit allowlist**; **short-circuits allowlisted production preflight requests with credentials**. |
| One config module validates all required runtime environment before app import; malformed/missing production config is fatal and aggregated | Implemented by `runtimeConfig` in `server/src/config.ts`. `server/src/index.ts` loads an optional local `.env`, validates the complete contract, then dynamically imports the app. `NODE_ENV` itself is mandatory and closed to four recognised modes. | `server/tests/config.test.ts`: **requires an explicit recognised runtime mode**; **fails the production process before importing the app when required configuration is missing**; **fails production boot validation on wildcard CORS**; **validates the complete production environment in one module**. |
| Zero runtime secret fallbacks/default passwords; report suspected leaks | Removed embedded database/JWT defaults and JWT reuse by capture, MFA and Paynow encryption. Database URLs reject placeholder passwords; every dedicated secret is required and production length-checked. Targeted source scan found only documented placeholders and explicitly labelled CI/test fixtures. No suspected real leaked credential was found. | `server/tests/config.test.ts`: **has no embedded database or secret fallback in any environment**; **rejects weak or placeholder production JWT secrets**; **requires dedicated capture and MFA encryption without JWT fallback**; Paynow encryption assertion in **keeps Paynow disabled by default and requires complete production merchant controls**. |
| Secure, HttpOnly and SameSite cookies in production | `refreshCookieOptions` in `server/src/auth.ts` is fixed to HttpOnly, SameSite Strict and the refresh-only path; `secure` is unconditionally true for production and has no override. | `server/tests/refresh-token-rotation.test.ts`: **delivers the refresh credential only as a hardened, path-restricted cookie**, including direct production option assertions. |
| HSTS, nosniff, framing protection and baseline CSP | `securityHeaders` in `server/src/security.ts` emits HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and CSP with `default-src 'none'` and `frame-ancestors 'none'`, plus the pre-existing COOP/CORP, referrer and permissions policies. | `server/tests/security.test.ts`: **applies the strict header set**. |
| Rate limiting on authentication and password reset | The existing in-process limiter is preserved. Its route policy is now a single exported catalogue mounted by `server/src/app.ts`, covering login, refresh, step-up, signup, both password-reset endpoints and MFA. | `server/tests/security.test.ts`: **limits per key within the window and reports Retry-After**; **tracks keys independently (tenant/IP isolation)**; **covers every authentication and password-reset surface**. |
| Sanitised production errors | The Express error handler returns a fixed `INTERNAL` response for unexpected failures; stack, message and internal paths remain server-side only. | `server/tests/security.test.ts`: **never exposes internal messages, paths or stack traces**. |
| Complete, commented environment example | `server/.env.example` now documents every runtime, CORS, encryption, public-origin, SMTP and conditional Paynow value, plus the seed-only administrator password. | Covered by configuration acceptance tests and CI typecheck; placeholder values are deliberately rejected if used at runtime. |

No infrastructure dependency, rate-limit service, schema change or migration was added.

### Production environment contract

Required for every production server boot:

- `NODE_ENV=production`
- `DATABASE_URL`
- `JWT_SECRET` (minimum 64 bytes)
- `ALLOWED_ORIGINS` (one or more exact comma-separated HTTP(S) origins; no wildcard)
- `CAPTURE_ENCRYPTION_KEY` (minimum 32 bytes)
- `MFA_ENCRYPTION_KEY` (minimum 32 bytes)
- `PAYNOW_ENCRYPTION_KEY` (minimum 32 bytes)
- `PAYNOW_ENABLED` (`true` or `false`, explicitly)
- `PUBLIC_APP_URL` or the Vercel-managed `VERCEL_PROJECT_PRODUCTION_URL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_AUTH_USER`
- `SMTP_AUTH_PASSWORD` (minimum 16 bytes)
- `SMTP_FROM_ADDRESS`
- `SMTP_FROM_NAME`
- `SMTP_REPLY_TO`
- `SMTP_TLS` (`implicit` or `starttls` in production)

Conditional or optional values:

- `PAYNOW_INTEGRATION_ID`, `PAYNOW_INTEGRATION_KEY` and `PAYNOW_CURRENCY` are
  required when `PAYNOW_ENABLED=true`.
- `SMTP_ENABLED` is documented as `true`; production always selects SMTP and
  rejects an explicit `false`.
- `PORT` is optional and defaults to `4000` after validation.
- `PLATFORM_ADMIN_PASSWORD` is required only when the seed command runs and is
  not part of normal server boot.

## 4. Tests executed

- Focused configuration and security suite: 2 files / 28 tests passed.
- Dedicated tenant-isolation regression: 13/13 passed.
- Broad server run on a freshly migrated database: 91 files / 434 tests passed.
  Three unrelated files encountered local database/socket contention after a
  15m41s degraded run; all three were rerun unchanged on a new fresh database
  and passed 3 files / 13 tests at their original timeouts.
- Restore-drill evidence: 3/3 passed, run after the main files because it
  intentionally rotates the shared seeded principal password.
- Aggregate server coverage across the fresh runs: all 95 files / 443 tests
  passed without weakening or modifying an existing assertion.
- Server typecheck: passed.
- Web typecheck: passed.
- Web production build: passed; the existing large-chunk warning remains.
- Fresh migration replay 0000 through 0045: passed transactionally with zero
  structural drift and zero manual steps.
- Runtime-schema readiness check: passed with gated features disabled.
- `git diff --check`: passed.

## 5. Verification status

- Every acceptance criterion now has both implementation and named-test
  evidence in the table above.
- The LP-004 SMTP contract remains registered in the same central config
  module and all LP-004 email tests remain part of the passing server suite.
- No migration file changed and 0046 was not reserved.
- No production environment, shared database, secret store or runtime was
  accessed or changed.
- GitHub's full unmodified suite, tenant-isolation, security, CodeQL and preview
  gates passed. PR #90 merged to `main` at `d883d403`.

## 6. Risks and human decisions

1. Before deploying the hardened server, operators must confirm that all
   required production values above exist. In particular, preserve the current
   `CAPTURE_ENCRYPTION_KEY`; replacing it would make existing encrypted capture
   evidence unreadable. Missing configuration now fails safely at boot.
2. `ALLOWED_ORIGINS` must include every legitimate browser application origin,
   including any separate production admin origin. It must not include paths.
3. The limiter is intentionally per-process for the pilot. Multi-instance
   deployments still require an edge/WAF or shared limiter later; no Redis or
   queue was introduced here.
4. The CSP is deliberately API-restrictive. If this Express service later
   serves HTML, that separate surface will need a purpose-built CSP rather than
   weakening the API policy globally.
5. No suspected leaked credential was found. CI/test values are explicitly
   labelled non-production fixtures, and `.env.example` contains rejected
   placeholders only.

## 7. Recommended next mission

After this branch passes all PR gates and merges, proceed to **LP-005 — Health
Endpoints, Structured Logging and Monitoring Hooks** on `ops/health-logging`.
Extend LP-004's existing `email.*` structured event convention rather than
adding a second logging format.
