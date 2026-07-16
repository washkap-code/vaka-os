# LP-FIX-002 — Completion report

**Mission:** Health endpoints Vercel routing

**Branch:** `fix/health-endpoints-vercel-routing`

**Date:** 2026-07-16

**Status:** Complete locally; ready for pull-request review and production smoke verification after deployment.

## 1. Files created

- `docs/engineering/mission-packs/LP-FIX-002/COMPLETION.md`

No migration, package or database file was created. Migration `0046` remains
free.

## 2. Files modified

- `server/src/app.ts`
- `server/tests/observability.test.ts`
- `server/tests/tenant-isolation-endpoint-manifest.ts`
- `server/tests/tenant-isolation-regression.test.ts`
- `vercel.json`
- `docs/engineering/OBSERVABILITY-OPERATIONS.md`
- `docs/engineering/SESSION-HANDOFF.md` in the final session commit

## 3. Behaviour changes

- The existing LP-005 liveness and readiness handlers are each defined once
  and registered at both their public root path and the `/api/v1/` path Vercel
  delivers to the serverless function.
- All four Express registrations remain before rate limiting and the
  authenticated API router. They therefore require no credentials and cannot
  be swallowed by the API authentication fallback.
- `vercel.json` explicitly rewrites `/healthz` and `/readyz` to `/api` before
  the single-page-application fallback. The production uptime-monitor targets
  are now `https://vakaos.com/healthz` and
  `https://vakaos.com/readyz`.
- Response behaviour is unchanged: liveness returns version and integer
  process uptime without dependency checks; readiness returns redacted
  per-check detail and HTTP 503 when any critical check fails.
- The endpoint-isolation inventory classifies both API-prefixed aliases as
  public contracts, increasing the documented public/shared exception count
  from 19 to 21.
- No authentication semantics, application feature, schema, production data or
  migration changed.

## 4. Tests executed

All database work used newly initialized disposable local PostgreSQL only.

- Focused LP-005 observability regression: 1 file / 11 tests passed, including
  both Vercel-delivered API-prefixed paths and rewrite ordering.
- Fresh migration replay: `0000` through `0045` applied transactionally with
  zero structural drift; seed completed.
- Final full server suite at the repository's unchanged 15-second timeout:
  96/96 files and 456/456 tests passed.
- Server typecheck: passed.
- Web typecheck: passed.
- Web production build: passed; the pre-existing large-chunk advisory remains.
- `vercel.json` JSON parse and `git diff --check`: passed.

The first full run identified the expected endpoint-inventory mismatch and
also timed out one unchanged privileged-step-up test and one unchanged
inventory-valuation test under local load. Both unchanged tests passed in a
targeted rerun at the same 15-second timeout; after reconciling the two public
aliases and exception count, the complete suite passed unchanged. Two earlier
focused invocations did not exercise assertions because the isolated worktree
initially lacked dependencies and then the sandbox refused Supertest's local
listener; the same focused command passed outside that restriction.

## 5. Verification status

LP-FIX-002 is verified locally. Automated coverage now proves the response
contracts through the exact API-prefixed paths delivered to Express and proves
that both public root rewrites precede the SPA fallback. No production request,
deployment, credential, shared database or customer data was accessed.

The final production proof remains a post-deployment smoke request to both root
URLs: liveness must return HTTP 200, while readiness must return HTTP 200 when
all critical dependencies are ready or the specified redacted HTTP 503 when
they are not.

## 6. Risks

- The routing fix does not take effect until the branch is reviewed, merged and
  deployed by Vercel.
- A production `/readyz` 503 can be correct. Operators must inspect only the
  redacted check statuses and repair database, migration or SMTP readiness
  rather than weakening the probe.
- The readiness schema marker still targets migration 0045. The next schema
  mission remains responsible for advancing that marker.
- The web build retains its existing bundle-size advisory; this mission did
  not change web code or bundle contents.

## 7. Recommended next mission

Push the branch, merge it only after all hosted gates pass, then verify
`https://vakaos.com/healthz` and `https://vakaos.com/readyz` from an external
network and configure the uptime monitor against those root URLs. Resume the
pilot-readiness sequence only after that production smoke evidence is green.
