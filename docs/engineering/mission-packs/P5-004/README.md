# P5-004 — Reorder Rules and Low-stock Alerts

**Status:** Technically verified; durable delivery and notification-centre UI gated
**Programme:** 5 — Inventory and warehousing
**Type:** Product reorder-rule workflow, stock-event subscriber and in-app notification adoption
**Depends on:** P1-004 notification service; P1-005 event bus; append-only stock ledger

## Outcome

An authorised inventory user can set a product-level reorder threshold and VAKA
records one in-app low-stock alert for each transition from healthy stock to at
or below that threshold. A product re-arms only after its total stock rises
above the threshold, preventing repeated alerts for every movement while stock
remains low.

P5-004 consumes the existing Product, `reorderLevel`, warehouse stock balances,
P1-005 event bus and P1-004 notification service. It does not create another
Product/SKU master, mutate stock history or transmit email/SMS/WhatsApp.

## Current behaviour

- Canonical `products.reorder_level` already stores an integer product-level
  threshold and product create/import paths can populate it.
- `stock_levels` maintains exact three-decimal warehouse balances atomically
  beside append-only `stock_movements`; dashboard/read models can list low
  products but do not alert.
- There is no product update path for enabling/disabling a reorder rule and no
  persisted breach/re-arm state.
- P1-005 publishes `stock.moved` for all current movement paths and additionally
  publishes `stock.adjusted` for manual adjustments. Delivery is in-process,
  best-effort and post-commit.
- P1-004 persists in-app notifications with tenant-scoped deduplication and
  notification audit evidence. The authenticated notification-centre UI is a
  separate P6 mission.

## Rule semantics

1. `reorderLevel = 0` disables automatic alerts. This preserves a safe default
   for existing products and avoids silently notifying tenants after rollout.
2. A positive threshold is enabled only when the product is active and
   `trackStock = true`.
3. Stock is evaluated across all tenant-owned warehouses for that product:
   `onHand = SUM(stock_levels.quantity_on_hand)`.
4. `LOW` means exact total on-hand is less than or equal to the integer
   threshold. Comparison occurs in PostgreSQL numeric arithmetic—never binary
   floating point.
5. A healthy-to-low transition increments a per-product breach sequence and
   creates one pending notification generation.
6. Additional movement/adjustment events while still low do not create a new
   generation. The duplicate `stock.moved` + `stock.adjusted` facts emitted by
   manual adjustment remain idempotent.
7. A low-to-healthy transition re-arms the product. A later healthy-to-low
   transition creates the next generation.
8. Disabling the rule, untracking or deactivating a product returns alert state
   to healthy and clears pending delivery without changing stock history.

## Target behaviour

1. Add a derived `low_stock_alert_states` table keyed by tenant + product with
   state, last observed exact quantity, threshold snapshot, breach sequence,
   pending flag, transition/notified/update timestamps.
2. The table is operational alert state, not inventory authority. Stock truth
   remains the append-only ledger plus atomically maintained stock levels.
3. Add `PATCH /products/:id/reorder-rule` behind `inventory.write`, with strict
   zod input `{ reorderLevel: integer 0..1,000,000 }` and verified tenant scope.
4. Audit the prior and new threshold atomically as
   `inventory.reorder_rule_changed`, then emit `product.changed` after commit so
   the rule is evaluated against current stock immediately.
5. Extend the bounded `product.changed` label with `updated`; existing search
   consumes the same canonical re-read and remains current.
6. Subscribe to `stock.moved`, `stock.adjusted` and `product.changed` through
   P1-005. Every handler ignores payload quantity as authority and re-reads the
   tenant-owned Product and aggregate stock balance.
7. Serialize transition decisions per tenant/product and persist a pending
   generation before notification delivery. Concurrent subscribers must not
   produce duplicate breach sequences.
8. Resolve active tenant users whose verified role grants `inventory.write`.
   Send one persisted `IN_APP` request per eligible recipient through the
   kernel `NOTIFICATION_SERVICE`, using template `inventory.low_stock`, locale
   `en-ZW`, bounded string variables and a deterministic per-recipient breach
   dedupe key.
9. Mark a generation delivered only after every currently eligible recipient
   is accepted/deduplicated. With no recipient or a delivery failure, leave it
   pending so the next relevant event can retry the same generation.
10. Add a responsive, permission-aware reorder-rule control to Products. It
    explains that zero disables alerts and does not claim an external message
    was sent.

## Notification contract

| Field | Value |
|---|---|
| channel | `IN_APP` |
| template | `inventory.low_stock` |
| recipient | active tenant user ID with `inventory.write` |
| locale | `en-ZW` until user locale preferences exist |
| variables | product ID, SKU, name, exact on-hand string, threshold string |
| dedupe | tenant + product + breach sequence + recipient |

Recipient data is persisted only through P1-004 and is absent from subscriber
logs/audit metadata. SMS and WhatsApp placeholders are not used. Email is not
attempted because provider configuration and user alert preferences are not yet
governed.

## User and measurable business result

- **User:** Owner, admin or stock controller with `inventory.write`.
- **Problem:** Low stock is visible only when a user opens a dashboard and can
  generate repeated noise without breach/re-arm state.
- **Result:** Users configure a threshold and receive one in-app record per real
  threshold breach, re-armed by replenishment.
- **Measure:** Transition/concurrency/idempotency tests produce exactly one
  notification per eligible recipient and breach; cross-tenant and users
  without inventory permission receive nothing.

## Permissions, audit and tenant isolation

- Rule writes require `inventory.write`; reads retain existing
  `inventory.read`. UI visibility is not the security boundary.
- Tenant/product identity comes from the verified JWT and route ID. Every
  Product, balance, state, role, user and notification operation is tenant
  scoped.
- Cross-tenant product IDs return safe not-found and cannot create state or
  notifications.
- Rule changes are audited in the same transaction as the canonical product
  update. Stock movements retain their existing mandatory stock/financial
  audits; each notification is audited by P1-004.
- Alert processing never writes `stock_movements`, `stock_levels`, journals or
  financial history.

## Failure, retry and concurrency behaviour

- Event subscriber errors remain isolated and do not roll back a committed
  stock movement or rule change.
- Transition state is row-locked and updated transactionally before delivery.
  Deterministic notification IDs/dedupe keys make retry safe.
- Accepted recipients dedupe on retry. Pending remains until all current
  eligible recipients are accepted or deduplicated.
- With no eligible recipient, pending remains and no notification is falsely
  marked delivered.
- P1-005 has no durable queue, timer or replay. A pending generation retries on
  the next relevant stock/product event only. Guaranteed alert latency and
  background retry require a future outbox/job mission.

## Localisation, mobile and accessibility

- New UI and template labels use stable catalogue/template keys with English
  fallback. Shona/Ndebele inventory terminology requires native review before
  enablement.
- Quantities use locale-aware display at the presentation boundary while exact
  decimal strings remain authoritative in APIs/notifications.
- The rule dialog stacks on narrow screens, is keyboard operable, has labelled
  controls, visible focus, loading/error states and does not depend on colour.
- A notification-centre UI, read/unread state, push notification and deep links
  are explicitly outside this mission.

## Scope

- Additive alert-state migration and Drizzle schema.
- Reorder-rule update API, audit and `product.changed` extension.
- Exact transition evaluator, eligible-recipient resolver and kernel
  notification delivery coordinator.
- P1-005 subscriber composition for stock and rule changes.
- Responsive product rule control and structured English fallback copy.
- Focused database tests for transition/re-arm, duplicate stock facts,
  concurrency, retry/no-recipient, tenant/RBAC, exact quantity and rollback.
- Platform/event/inventory docs, programme status, mission index, changelog and
  completion evidence.

## Out of scope

- Duplicate Product/SKU, stock or warehouse tables; editing/deleting stock
  movements; automatic purchase orders; supplier selection; lead time, safety
  stock, forecast/seasonality, per-warehouse or multi-echelon rules.
- External email/SMS/WhatsApp/push transmission, user preferences, quiet hours,
  escalation, notification centre/read state or mobile-native delivery.
- Durable event outbox/replay/dead-letter jobs, scheduled retry, alert latency
  SLO or monitoring dashboard.
- AI demand forecasting or autonomous procurement.

## Acceptance criteria

- Mission pack is committed before implementation.
- Rule writes are zod-validated, tenant scoped, RBAC enforced and atomically
  audited; a rollback emits/evaluates nothing.
- Zero disables; positive threshold compares exact aggregate quantity.
- Stock moved/adjusted subscribers re-read canonical tenant-owned state.
- Healthy→low alerts once; remaining low does not repeat; healthy re-arms; the
  next breach alerts once with a new deterministic generation.
- Duplicate/manual adjustment events and concurrent evaluation do not duplicate
  notifications.
- Only active `inventory.write` users in the same tenant are recipients.
- No recipient/failure remains pending and retry is deduplicated.
- P1-004 creates notification audit evidence; no recipient appears in logs.
- Migration is additive and applied only to local/CI test databases.
- Responsive UI and catalogue-backed copy are present without external-delivery
  claims.
- Full guarded DB suite, server/web typechecks and web production build pass.

## Rollback

Revert the rule route/UI, subscriber registration, evaluator, tests and
documentation. Existing `reorder_level` values remain canonical Product data.
The derived alert-state table and persisted notification/audit evidence may
remain dormant; do not delete them in production rollback without separately
reviewed additive retention/migration work. Stock and financial history are
unchanged.

## Release boundary

After technical verification, describe P5-004 as persisted in-app low-stock
alert generation. Do not claim push, email, SMS, WhatsApp, guaranteed real-time
delivery or automatic replenishment until their separate provider, preference,
operations and procurement gates pass.
