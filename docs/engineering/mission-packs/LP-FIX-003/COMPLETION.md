# LP-FIX-003 — Completion report

**Mission:** Holding-page URL validation

**Branch:** `fix/holding-page-url-validation`

**Date:** 2026-07-16

**Status:** Implementation and focused verification complete; the hosted full-suite gate must pass before merge because local host saturation prevented a clean aggregate run.

## 1. Files created

- `docs/engineering/mission-packs/LP-FIX-003/COMPLETION.md`

No migration, package or database file was created. Migration `0046` remains
free.

## 2. Files modified

- `server/src/routes.ts`
- `server/tests/settings.test.ts`
- `docs/engineering/SESSION-HANDOFF.md` in the final session commit

## 3. Behaviour changes

- HTTPS URL refinement now uses one exception-safe predicate. Malformed input
  returns `false` from the predicate instead of allowing `new URL(...)` to
  throw through Zod and the Express error handler.
- An empty holding-offer URL still maps to `null` and means no offer link.
- Malformed and non-HTTPS holding-offer URLs now produce the existing HTTP 400
  validation response. Valid HTTPS URLs remain accepted.
- The same unsafe pattern in branding `logoUrl` validation was found by the
  required audit and routed through the same safe predicate.
- Repository audit found no remaining `new URL(...)` construction inside a
  Zod refine or transform callback under `server/src` or `web/src`.
- No authentication, tenant, settings persistence, schema or production-data
  behaviour changed beyond converting these malformed URL failures from 500
  to 400.

## 4. Tests executed

All database work used newly initialized disposable local PostgreSQL only.

- Fresh migration replay `0000` through `0045`: passed transactionally with
  zero structural drift on every verification database.
- Focused settings regression: 1 file / 5 tests passed. This covers empty
  string accepted, malformed URL rejected with 400, HTTP URL rejected with
  400, HTTPS URL accepted, and malformed branding URL rejected with 400.
- Server typecheck: passed.
- Web typecheck: passed.
- Web production build: passed; the existing large-chunk advisory remains.
- Unsafe-pattern audit and `git diff --check`: passed.

The full server command was run without changing its 15-second test timeout.
The first aggregate attempt passed 95/96 files and 454/455 tests; the only
failure was an unchanged tenant-isolation request reporting `socket hang up`.
That entire file then passed 13/13 unchanged against a fresh database. A later
aggregate attempt encountered unrelated setup/test timeouts while local load
averages exceeded 20; the affected payroll, migration-hub and upgrade-interest
files then passed 35/35 together at unchanged limits. A final attempt was
stopped after the saturated host caused consecutive timeouts in unchanged
privileged-step-up tests. No test, timeout or application behaviour was
weakened, but there is no clean single-command local aggregate result.

## 5. Verification status

The production defect and audited companion pattern are fixed with focused,
database-backed regression evidence. Both typechecks and the web build pass.
The mission is not eligible to merge until the hosted quality workflow runs
the complete server suite green on its controlled runner; local aggregate
timing was not reliable enough to substitute for that gate.

No production or shared database, credential, deployment or customer record
was accessed.

## 6. Risks

- Hosted CI must confirm a clean 96-file aggregate server run before merge.
- Zod may report both its URL-format issue and the HTTPS-refinement issue for a
  malformed non-empty value. This is safe and remains an HTTP 400; no internal
  exception text is exposed.
- The web build retains its pre-existing bundle-size advisory; this mission did
  not modify web code.

## 7. Recommended next mission

Push this branch and inspect the hosted quality gate. Merge only after the full
server suite, both typechecks and web build are green, then repeat the original
production request with empty, malformed, HTTP and HTTPS values to confirm the
deployed endpoint returns the documented 200/400 outcomes.
