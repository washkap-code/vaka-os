# P5-004 — Completion Report

**Implementation:** Complete for product-level rules and persisted in-app alerts
**Technical verification:** Complete
**Availability:** Authenticated inventory rule control and internal in-app records
**External delivery:** Not enabled
**Completed on:** 2026-07-13

## Delivered

- Existing canonical `products.reorder_level` now has an authenticated update
  workflow: strict zod input, verified tenant scope, `inventory.write`, atomic
  prior/new-value audit and post-commit `product.changed` evaluation.
- Zero explicitly disables alerts. Positive thresholds apply only to active,
  stock-tracked products and compare against exact aggregate three-decimal
  warehouse balances in PostgreSQL.
- Additive `low_stock_alert_states` operational projection with serialized
  healthy/low transitions, threshold and exact balance snapshots, breach
  sequence, pending delivery, transition/notified timestamps and constraints.
- P1-005 subscribers for `stock.moved`, `stock.adjusted` and `product.changed`.
  Payload quantities are never authority; every evaluation re-reads the
  tenant-owned Product and canonical stock balance.
- Healthy-to-low alerts once; duplicate/remaining-low facts do not repeat;
  stock above threshold re-arms; a later breach increments the generation.
- Active tenant users whose role contains `inventory.write` receive one
  deterministic `inventory.low_stock` `IN_APP` request per breach through the
  kernel `NOTIFICATION_SERVICE`. P1-004 supplies persistence, dedupe and audit.
- No-recipient/provider failures remain pending. Retry uses the same generation
  and recipient key; previously accepted recipients deduplicate.
- Responsive Product rule control with permission-aware actions, exact rule
  status, zero-disable explanation, bounded input, error/loading state,
  keyboard/Escape support and structured English fallback copy.

## Verification evidence

- Guarded local test database preparation and reference-data seed: passed
  against `vaka_test` immediately before full-suite verification.
- Focused alert/event/notification/runtime suite: 4 files / 16 tests passed.
- Full server database-backed suite: 60 files / 198 tests passed, 0 failures,
  0 skipped.
- Server typecheck: passed.
- Web typecheck: passed.
- Web production build: passed.
- `git diff --check`: passed.

Focused evidence covers exact 5.001→5.000 comparison, inclusive threshold,
duplicate adjustment facts, healthy/low/re-arm generations, concurrent
evaluation, active inventory-role recipients, tenant/RBAC denial, atomic rule
audit, P1-004 notification audit, no-recipient/provider-failure retry and
rollback without event/state effects.

The local host was under exceptional unrelated CPU/memory pressure, causing
the repository's 5-second per-test default to time out in scattered existing
tests without assertion failures. The successful local full-suite rerun used a
temporary 30-second per-test allowance; no repository timeout was changed. The
standard-timeout GitHub quality gate is the merge control.

## Migration and production boundary

- Added `server/drizzle/0018_low_stock_alert_state.sql` and matching Drizzle
  schema. It creates only derived operational alert state and additive indexes/
  constraints; no Product, SKU, warehouse or stock master is duplicated.
- Migration 0018 was applied only to guarded local `vaka_test` through
  `test:db:prepare`.
- No `db:push`, migration or schema mutation was run against the shared
  production Supabase project. GENFIN tables and data were not touched.

## Open product and operational gates

1. P1-005 remains process-local and best-effort. Pending delivery retries only
   on a later stock/product event; guaranteed latency needs a durable outbox,
   replay/dead-letter handling, scheduled retry and monitoring.
2. Alerts are persisted in-app records. There is no notification-centre/read
   state, native push, email, SMS or WhatsApp transmission in this mission.
3. Rules are tenant-wide product thresholds over aggregate warehouses. Safety
   stock, lead time, forecast/seasonality, per-warehouse/multi-echelon rules and
   supplier-aware replenishment remain planned.
4. No automatic purchase order or autonomous/AI procurement action is enabled.
5. `en-ZW` is the fallback until governed user locale preferences exist. Shona
   and Ndebele inventory terminology still requires native review.
6. Scale/query-plan evidence, alert-latency SLOs, support runbooks and hosted
   operational observation remain release gates.

## Rollback

Revert the rule route/UI, event extension/subscriber, evaluator/composition,
tests and documentation. Existing reorder-level values remain canonical Product
data. The derived state table and persisted notification/audit evidence may
remain dormant; do not delete them in production rollback without separately
reviewed additive retention/migration work. Stock movements, balances, journals
and financial history remain unchanged.
