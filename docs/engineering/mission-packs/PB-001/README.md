# PB-001 — Black Book registry (versioned, governed platform content)

**Programme:** PB — Black Book (Master Build Plan Part II)
**Status:** DONE (2026-07-15) — built and verified in the Cowork lane
**Depends on:** FLAG-002 (feature flags) — satisfied
**Feature flag:** `blackbook.directory` (default OFF for every tenant)
**Migration:** `0040_blackbook_registry.sql` (additive, idempotent)

## What this delivers

The platform registry for Black Book content, importing the human-reviewed
seed package under `knowledge-system/10-country-packs/<country>/black-book/`.
Registry data is **global platform content, not tenant data** — the tables
deliberately carry no `tenant_id`.

- `blackbook_entries` — current state, unique per `(country_code, entry_key)`,
  with category/status/kebab-case checks and `current_version`.
- `blackbook_entry_versions` — immutable history; one row per accepted change,
  linked to the run that introduced it.
- `blackbook_import_runs` — one row per successful import: dataset revision,
  actor, and created/updated/unchanged counts.

## Content governance

- The **only write path** is `POST /platform/blackbook/import` —
  `platform.settings.manage` + step-up proof, audited to
  `platform_audit_logs` (`platform_blackbook.imported`).
- Imports are **all-or-nothing**: any validation failure rejects the whole
  batch and rolls back — a failed import leaves the registry unchanged
  (schema.md contract, final paragraph).
- The import validator implements schema.md "PB-001 import validation"
  checks 1–8 and 10 (unknown-field rejection via per-category whitelists,
  global ID uniqueness, reference resolution incl. authority-category rules,
  HTTPS source rules, ISO dates, cadence/renewal enums, licence array
  contract). Check 9 (deadline substantiation) is the human content-review
  gate — see the PB-002 review pack.
- `GET /platform/blackbook/import-runs` (`platform.operations.read`) lists
  run history.

## Tenant surface (dark)

- `GET /blackbook/entries?category=&q=&country=` and
  `GET /blackbook/entries/:key` behind `requireFeature("blackbook.directory")`
  — fail closed with FEATURE_DISABLED until enabled per tenant.
- Reads are open to any authenticated tenant member (reference data; no new
  tenant permissions, so no role backfill in 0040).
- Every detail response carries `sources`, `lastReviewed` and a notice that
  the content is a directory, not professional advice (schema.md Purpose).

## Files

- `server/drizzle/0040_blackbook_registry.sql`
- `server/src/db/schema.ts` (3 tables appended)
- `server/src/blackbook.ts` (validator, import, reads)
- `server/src/routes.ts` (2 tenant + 2 platform routes)
- `server/tests/blackbook.test.ts` (27 tests)

## Verification (scratch Postgres, 2026-07-15)

- blackbook 27/27 — includes: every validation rejection class; create →
  unchanged → versioned update; atomic failure leaves registry unchanged;
  fail-closed tenant reads; step-up-protected audited platform import; and a
  **real-dataset test importing the PB-000/PB-000B seed (113 records, zero
  validation errors)**.
- Regression: feature-flags + task-automation 14/14, critical 12/12,
  finance tenant-isolation/journal-balancing/journal-immutability 7/7,
  auth-resolution + platform-runtime 12/12.
- Server typecheck clean. No web changes (PB-003 delivers the UI).

## To pilot

1. Apply `0040_blackbook_registry.sql` to production (idempotent) BEFORE
   pushing the code.
2. As platform staff (with step-up), POST the seed dataset to
   `/platform/blackbook/import` with the dataset revision (e.g. commit hash).
3. Enable `blackbook.directory` for pilot tenants via the platform features
   endpoint.

## Follow-ups

- PB-002: content certification (review pack issued 2026-07-15) + registry
  flip of reviewed entries once corrections land as a new dataset revision.
- PB-003: directory UI + universal search integration.
- Entry retirement is intentionally not part of imports (absent records are
  left untouched); a governed retire action arrives with content ops
  (PB-006) if needed.
