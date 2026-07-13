# P1-006 — Completion Report

**Implementation:** Complete for the approved bounded adapter scope
**Technical verification:** Complete
**Availability:** Internal API adapter; no global-search UI
**Operational gate:** Durable delivery and scale evidence remain open
**Completed on:** 2026-07-13

## Delivered

- Kernel-composed `SEARCH_SERVICE` using the existing P1-001 search contract.
- One tenant-owned, rebuildable `search_documents` index; no duplicate
  Customer, Company, Invoice or Product master table.
- Minimal Customer, Invoice and Product result documents with sensitive
  contact/tax/cost/note/ledger fields excluded.
- Lazy, atomic tenant reconciliation from canonical tables for pre-existing
  records and process-restart repair.
- P1-005 subscribers that re-read canonical records after committed customer,
  product, invoice, payment, stock and import facts.
- New minimal `customer.changed`, `product.changed` and `invoice.changed`
  events for write paths not covered by the existing catalogue.
- Strictly validated authenticated `GET /search` with deterministic ranking,
  entity filters, bounded limits, opaque query-bound cursors and private/no-store
  responses.
- Provider-level tenant and permission enforcement: `crm.read` for Customer,
  `accounting.read` for Invoice and `inventory.read` for Product.

## Verification evidence

- Guarded local test database preparation, migration application and
  reference-data seed: passed against `vaka_test`.
- Focused search/event/import/runtime suite with final code: 5 files / 12 tests
  passed.
- Full server database-backed suite with final code: 57 files / 185 tests
  passed, 0 failures, 0 skipped.
- Server typecheck: passed.
- Web typecheck: passed.
- Web production build: passed.
- `git diff --check`: passed.

## Migration and production boundary

- Added `server/drizzle/0016_search_documents.sql` with only the derived search
  table, tenant/entity uniqueness, bounded type/permission checks and lookup
  indexes.
- The migration was applied only to the isolated local test database through
  guarded preparation.
- No `db:push`, migration, or schema mutation was run against the shared
  production Supabase project. Production application requires separately
  authorised, reviewed additive SQL.

## Open operations and product gates

1. P1-005 delivery remains process-local and best-effort. Guaranteed index
   freshness requires an outbox, retry/replay, dead-letter handling and
   operating evidence.
2. Canonical deletion endpoints/events are not present; future deletion work
   must remove derived documents after commit and prove retention behaviour.
3. Keyword matching and offset cursors are deterministic but not yet proven at
   enterprise scale. Performance/load evidence and pagination under concurrent
   writes remain open.
4. Fuzzy, semantic/vector, attachment and cross-tenant search are not provided.
5. The global user-facing search control is deferred until P1-008 metadata can
   provide governed object labels, navigation and future AI-context boundaries.

## Rollback

Revert the route, composition, event producers/subscribers, adapter, tests and
documentation. The rebuildable index table may remain dormant; it is not a
canonical or retention source. Do not drop it from production without a
separately reviewed additive database change.
