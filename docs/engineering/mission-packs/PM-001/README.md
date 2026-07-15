# PM-001 — Migration Hub: staged migrations engine

**Programme:** PM — Migration Hub (Master Build Plan Part II)
**Status:** DONE (2026-07-15) — Cowork lane
**Feature flag:** `migration.hub` (default OFF)
**Migration:** `0042_migration_hub.sql` (additive, idempotent; shared with PM-002)

## What this delivers

Generalises the existing self-service import framework (`import_batches` /
`import_rows` stay the row-staging authority) into project-grouped
migrations: **stage → validate → commit → reconcile → rollback/discard**.

- `migration_projects` — one per source system move; carries the accountant
  sign-off (PM-002) and OPEN/CLOSED lifecycle.
- `migration_steps` — STAGED / COMMITTED / ROLLED_BACK / DISCARDED; wraps an
  import batch or an accounting step; records journal + reversal ids.
- Step kinds wired in PM-001: `contacts`, `products`, `opening_stock` —
  delegating to the existing, already-audited importers unchanged.

## Semantics that matter

- **Stage never touches live records.** Commit claims the batch
  (PREVIEW→PROCESSING guard — no double commits).
- **Rollback only where a safe inverse exists:** contacts/products are
  guarded hard deletes (refused with 409 if records are referenced);
  opening stock is explicitly NOT auto-rollbackable in v1 (stock movements
  + valuation layers need a dedicated reversal — correct via adjustments).
- **Discard** retires a STAGED step and cancels its batch so it can never
  be committed later (bad file, wrong data).
- Close is blocked while any step is STAGED. Everything is audited.

## Routes (dark behind `migration.hub`)

`GET/POST /migration/projects`, `GET /migration/projects/:id`,
`POST .../steps/:kind/preview` (imports.create),
`POST .../steps/:stepId/commit` + `/discard` (imports.approve),
`POST .../steps/:stepId/rollback`, `/sign-off`, `/close` (tenant OWNER).

## Verification (scratch Postgres, 2026-07-15)

migration-hub 12/12; regression critical + contact-imports 13/13, finance
journal-balancing/immutability/tenant-isolation + product-imports 8/8,
feature-flags + opening-stock-imports 9/9; typecheck clean. See PM-002 pack
for the accounting-step proofs.
