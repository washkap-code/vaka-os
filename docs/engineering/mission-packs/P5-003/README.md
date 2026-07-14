# P5-003 — Weighted-average Inventory Valuation Feeding COGS

**Status:** Approved by the product owner for implementation
**Programme:** 5 — Inventory and warehousing
**Type:** Finance-critical inventory subledger, issue costing and Inventory-control reconciliation
**Depends on:** P2-001 journal controls; P4-002 base-currency receipt evidence; P5-002 append-only stock movements

## Outcome

When a tenant issues stock for a sale or controlled consumption, VAKA derives
the issue cost from the weighted-average value of the append-only stock history
for that exact product and warehouse. The issue and its balanced Dr Cost of
Goods Sold / Cr Inventory journal commit atomically through the existing
journal service. A tenant-scoped reconciliation compares the current Inventory
control-account balance with the inventory valuation subledger and identifies
quantity or value exceptions without presenting the output as audited
financial statements.

This mission is finance-critical. Technical completion does not approve the
valuation policy for general availability. A qualified Zimbabwean accountant
must review the accounting policy, legacy-data conversion, rounding, foreign-
currency treatment, journals and reconciliation evidence before GA.

## Current behaviour

- `stock_movements` is the append-only stock authority and `stock_levels` is an
  atomically maintained quantity cache. Negative tracked stock is refused.
- Approved goods receipts snapshot their PO exchange rate and post base-
  currency Dr Inventory / Cr GRNI through `postJournal` in the same transaction
  as the stock receipt.
- Invoice issue currently snapshots `products.cost_price` onto the sale
  movement and uses that editable product field for COGS. It does not derive
  COGS from the receipt history and can therefore diverge from weighted-average
  stock value.
- Opening stock and manual adjustments post Inventory effects but do not
  maintain a dedicated valuation read model or immutable per-movement
  allocation evidence.
- Reports expose the Inventory ledger balance but do not reconcile it to a
  product/warehouse valuation subledger.

## Valuation policy

1. Quantity uses exact thousandths. Monetary value uses signed integer cents
   in the tenant base currency. Binary floating-point arithmetic is forbidden
   in valuation decisions.
2. Each product/warehouse has one derived valuation layer containing exact
   quantity on hand and total base-currency cost. It is a rebuildable cache;
   append-only stock movements and immutable movement valuation evidence remain
   the source trail.
3. A positive movement adds its authoritative base-currency total cost to the
   layer. Purchase receipts use the same original line total and exchange-rate
   snapshot as their Inventory/GRNI journal, avoiding a second FX calculation.
   Opening stock and positive adjustments use their governed base-currency
   cost input.
4. A negative movement allocates:

   `round-half-up(layer cost before × issue quantity / layer quantity before)`.

   When the issue exhausts the layer, it allocates the complete remaining cost
   so no residual cent remains at zero quantity.
5. The movement evidence snapshots quantity before/after, cost before, allocated
   movement cost and cost after. History is inserted once and never edited.
6. The mutable Product cost field may remain useful for entry suggestions but
   is never COGS authority after this mission.
7. Invoice void/restock adds back the original immutable issue allocation, not
   a newly calculated Product cost. Its existing reversing journal remains the
   financial correction; posted history is not edited.
8. A manual stock reduction uses the same weighted-average allocation for its
   governed adjustment journal. A positive adjustment adds the explicitly
   snapshotted base cost. Transfers remain out of scope until a controlled
   transfer workflow can carry one immutable cost between warehouse layers.

## Target transaction boundary

1. Lock the invoice lifecycle row before issue and serialize every affected
   product/warehouse in a consistent order.
2. Under the existing stock-level row lock, ensure the valuation layer exists,
   verify its exact quantity agrees with `stock_levels`, and refuse any negative
   stock or valuation result.
3. Append the stock movement, insert its immutable valuation evidence and
   update `stock_levels` plus the valuation layer in the same transaction.
4. Aggregate issue allocations in base-currency integer cents.
5. Post one balanced invoice COGS journal through `postJournal`: Dr COGS / Cr
   Inventory. Operational code never inserts journal headers or lines directly.
6. Record bounded audit evidence linking the invoice, stock movement valuation
   identifiers, allocation and journal identifier.
7. Commit the invoice number, issue lifecycle, revenue/VAT journal, COGS
   journal, stock movement, valuation evidence, layer and audit atomically.
8. Only after commit, emit typed `inventory.valued` facts whose payload contains
   identifiers only: movement, valuation and journal. Subscriber failure cannot
   cause a duplicate financial write.

## Idempotency and concurrency

- Existing stock idempotency keys retain tenant-scoped fingerprint checks.
  Replays return the original movement and valuation evidence rather than
  changing quantity, cost, journal, audit or event state.
- Invoice issue locks the tenant-owned draft before allocating a number or
  moving stock. Concurrent requests can produce only one successful issue.
- Product/warehouse locks are acquired in a stable order for multi-line
  invoices. A concurrent receipt, issue or adjustment observes the previously
  committed exact layer or waits; it cannot oversell or allocate from a stale
  average.
- Any missing/duplicate valuation evidence, layer/stock quantity mismatch,
  invalid cost, missing system account, journal failure or negative result
  fails closed and rolls back the whole linked operation.

## Reconciliation read model

`GET /reports/inventory-valuation` requires `reports.read` and derives:

- Inventory control-account balance from posted journal lines;
- total valuation from current tenant-owned product/warehouse layers;
- exact difference in base-currency cents;
- `RECONCILED` only when the value difference is zero, every stock-level row has
  a valuation layer and every exact cached quantity agrees;
- line evidence for Product, SKU, warehouse, stock quantity, valued quantity,
  weighted-average display cost, total valuation and exception status.

The report is current-position evidence, not an audited, statutory or filing-
ready statement. The UI must display the base currency, reconciliation status,
explicit non-audited label and Zimbabwean-accountant sign-off gate without
using colour as the sole meaning.

## Permissions, audit and tenant isolation

- Stock writes retain `inventory.write`; invoice issue and COGS posting retain
  `accounting.post`; reconciliation reads require `reports.read`.
- Tenant identity always comes from verified authenticated context. Product,
  warehouse, movement, valuation layer, evidence, accounts, journals, audits
  and report queries are tenant scoped server-side.
- Cross-tenant Product, warehouse, invoice or valuation identifiers fail safely
  without exposing existence or changing financial state.
- Every financially material issue/adjustment records the movement allocation,
  journal identifier and controlling source in mandatory audit evidence.
- No secret, address, bank, tax-identity or free-text note is included in the
  identifier-only post-commit valuation event.

## Existing-data conversion

- Migration `0029` is additive. It creates the valuation layer and immutable
  movement-evidence tables, indexes and checks. It does not alter or delete
  stock or journal history.
- The reviewed production SQL replays legacy stock movements chronologically
  per tenant/product/warehouse using the same exact weighted-average rule. It
  verifies rebuilt quantity against `stock_levels` and aborts on negative or
  inconsistent legacy quantity instead of fabricating a balance.
- Historical positive movements use their stored base-cost snapshot. Where
  pre-P5-003 receipt rounding differs from the Inventory journal, the
  reconciliation exposes the exception for controlled accountant review; the
  migration never rewrites posted journals.
- Application code can safely initialise a missing layer from canonical
  movement history under lock, but it must never hide a reconciliation
  difference.

## Failure, rollback and correction behaviour

- Oversell, missing cost evidence, invalid quantity, quantity/cache mismatch,
  overflow, journal rejection, audit failure or lifecycle conflict rolls back
  stock, valuation, journals, numbering and invoice state together.
- Subscriber delivery occurs after commit and is non-authoritative. Downstream
  consumers re-read tenant-owned canonical records by identifier.
- Posted stock movements, valuation evidence and journal lines are never
  changed or deleted. Corrections use offsetting stock movements and reversal/
  correcting journals through approved services.
- A reconciliation exception is reported, not auto-posted. AI cannot resolve,
  adjust or post it.

## Localisation, mobile and accessibility

- New report copy lives in the typed English catalogue and is structured for
  future English, ChiShona and isiNdebele translation. Professional/native
  review remains required before translated finance terminology is enabled.
- Currency, quantities and dates remain locale-neutral exact API values and are
  formatted only at presentation boundaries.
- The report reflows at 320, 640 and desktop widths, has labelled tab/table
  navigation, visible loading/error/empty states, keyboard access and textual
  status in addition to any colour.

## Scope

- Additive valuation-layer and immutable movement-valuation schema/migration.
- Exact quantity/money valuation arithmetic and historical replay.
- Integration into every existing stock movement path required to keep the
  layer consistent: goods receipt, opening stock/import, adjustment, invoice
  sale issue and invoice void/restock.
- Weighted-average invoice COGS through the existing journal service.
- Stable lock ordering, tenant idempotency, mandatory audit and post-commit
  identifier-only domain event.
- Inventory-control reconciliation service, authorised endpoint and explicitly
  gated responsive report UI.
- Strict database-backed finance, tenant, rollback, rounding, FX, concurrency,
  journal, event and reconciliation tests.
- Completion evidence, exact production DDL, changelog and roadmap update.

## Out of scope

- FIFO/LIFO/specific identification, landed cost, manufacturing/WIP, batches,
  lots, expiry/serial costing, standard-cost variances or multi-entity stock.
- A new Product, SKU, warehouse, movement, invoice, account or journal master.
- Negative stock, retroactive rate changes, editing posted movements/journals,
  automatic reconciliation adjustments or AI posting.
- Transfer workflow, returns/RMA, supplier credit notes, stocktake approval,
  period close and historical as-at valuation snapshots.
- Claiming audited accounts, Zimbabwe tax compliance or GA accounting-policy
  approval before qualified sign-off.

## Acceptance criteria

- Mission pack is committed before implementation.
- Weighted-average calculations use exact quantity units and base-currency
  integer cents with deterministic half-up rounding and full-layer exhaustion.
- Receipts at different costs and partial issues produce the expected layer,
  immutable movement allocations and balanced Dr COGS / Cr Inventory journal.
- FX receipts reuse the posted receipt base-cost calculation and retain original
  currency/rate evidence in the receipt journal; posted history is unchanged.
- Every movement path keeps `stock_levels` and the valuation layer atomically
  quantity-aligned; negative stock and negative valuation are impossible.
- Same-key replays and simultaneous issues are safe; only committed movements
  can influence later averages.
- Journal, audit, lifecycle, numbering or valuation failure rolls back every
  linked effect. Failed attempts emit no event.
- Successful issue emits one typed identifier-only valuation fact per movement
  after commit and records bounded finance audit evidence.
- Reconciliation ties the Inventory control account to valuation exactly or
  explains missing/quantity/value exceptions without auto-correction.
- Tenant/RBAC, legacy backfill, multiple receipt costs, partial/exhausting
  issues, negative guard, rounding, FX, rollback, concurrency, void/restock and
  COGS/Inventory journal correctness tests pass.
- The UI clearly says technical preview, not audited, and requires qualified
  Zimbabwean accountant sign-off before GA.
- Exact additive production SQL appears in `COMPLETION.md`; no production
  `drizzle-kit push`, `db:push` or shared-Supabase DDL is run.
- Full guarded DB suite, server/web typechecks, web production build and
  `git diff --check` pass before merge.

## Rollback

Revert the new report UI/route, event extension and valuation integration only
through reviewed code rollback. Additive valuation tables and immutable
evidence may remain dormant. Never drop or rewrite production stock movements,
journals, audits or posted invoices. Any COGS or Inventory correction after use
requires a controlled reversing/correcting journal and offsetting stock event,
plus reconciliation and accountant review.

## Release boundary

After technical verification, describe P5-003 only as a weighted-average
inventory valuation and reconciliation **technical preview**. GA, audited-
financial-statement language and reliance for statutory/tax decisions remain
blocked until a qualified Zimbabwean accountant signs off the policy,
conversion results, tests and reconciliation operation.
