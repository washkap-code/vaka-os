# P5-003 — Completion Report

**Implementation:** Complete
**Local static verification:** Complete
**Database-backed verification:** Complete — hosted isolated-PostgreSQL quality gate passed
**Availability:** Technical preview only
**Professional gate:** Qualified Zimbabwean accountant sign-off required before GA
**Completed on:** 2026-07-14

## Delivered

- Added one rebuildable weighted-average valuation layer per canonical tenant,
  Product and Warehouse. Exact quantity uses thousandths; total value uses
  integer base-currency cents.
- Added append-only `stock_movement_valuations` evidence for quantity before/
  after, cost before, movement allocation, cost after and valuation method.
  The existing financial-history mutation guard now protects this evidence.
- Reworked the canonical inventory service so every current receipt, opening,
  adjustment, sale issue and invoice-void return keeps `stock_levels`, the
  append-only movement, immutable valuation evidence and the layer atomic.
- Positive purchase movements use the same base-currency line total as the
  receipt's Inventory/GRNI journal. This avoids recomputing FX from a rounded
  base unit price.
- Partial issues allocate half-up from `cost before × issue quantity ÷ quantity
  before`. A full issue consumes every remaining cent, preventing residual
  value at zero quantity.
- Invoice issue now locks the tenant-owned draft, resolves all stock lines, sorts
  locks consistently, values each issue from its warehouse layer and posts one
  balanced Dr COGS / Cr Inventory journal through the existing `postJournal`
  service. `products.cost_price` is no longer sale-COGS authority.
- Invoice void restores the original immutable issue allocation while the
  existing journal reversal corrects the posted financial history. No posted
  movement, valuation or journal is edited.
- Successful issues write bounded `inventory.issue_valued` audit evidence and
  publish one typed identifier-only `inventory.valued` event per movement only
  after commit. Rollbacks publish nothing.
- Added `GET /reports/inventory-valuation` behind `reports.read`. It compares
  the Inventory control-account balance to total valuation, exposes missing
  layers/stock rows and exact quantity mismatches, and never auto-posts a
  correction.
- Added a responsive Reports tab with loading, error/retry, empty and evidence
  states. Text—not colour alone—communicates status. The UI explicitly says the
  result is not audited and requires qualified Zimbabwean accountant approval.
- Added strict database tests for multiple receipt costs, partial issue,
  immutable evidence, COGS/Inventory journal lines, identifier-only event,
  reconciliation, FX total rounding, full-layer exhaustion, deterministic
  cent allocation, idempotent replay, oversell, journal rollback, concurrent
  issues, void/restock, tenant isolation and RBAC denial.

## Files changed

- `server/src/db/schema.ts`
- `server/drizzle/0029_weighted_average_inventory_valuation.sql`
- `server/drizzle/0007_financial_integrity_controls.sql`
- `server/scripts/apply-finance-integrity-controls.ts`
- `server/src/inventory.ts`
- `server/src/invoicing.ts`
- `server/src/procurement.ts`
- `server/src/reports.ts`
- `server/src/routes.ts`
- `server/src/platform/events/registry.ts`
- `server/tests/finance/inventory-valuation.test.ts`
- `web/src/App.tsx`
- `web/src/locales/app.en.ts`
- `docs/03-technical/EVENT-CATALOGUE.md`
- `docs/06-master-programme-blueprint/books/08-finance-and-accounting/README.md`
- `docs/engineering/mission-packs/README.md`
- `knowledge-system/13-roadmaps/MASTER-BUILD-PLAN.md`
- `CHANGELOG.md`
- `docs/engineering/mission-packs/P5-003/README.md`
- `docs/engineering/mission-packs/P5-003/COMPLETION.md`

## Verification evidence

Passed locally:

- Server TypeScript typecheck: passed.
- Web TypeScript typecheck: passed.
- Web production build: passed (the existing bundle-size advisory remains a
  non-failing warning).
- Design-token conformance: passed.
- Accessibility conformance: passed.
- `git diff --check`: passed at the implementation checkpoint and after the
  final verification fixes.

Passed in GitHub's isolated PostgreSQL 16 quality environment:

- Quality workflow run `29355188297`, job `87160930383`: passed in 3m38s.
- `npm run test:db:prepare`: passed, including guarded test-database validation,
  schema creation, finance/procurement integrity controls and reference seeding.
- Full serial PostgreSQL and foundation test suite: passed.
- Server and web TypeScript typechecks: passed.
- Design-token, accessibility, product-entry, invoice-workspace and homepage
  regression contracts: passed.
- Web production build: passed.
- Intentionally gated AI evaluation evidence generation/upload: passed.

The local workspace still has no explicit safe PostgreSQL test URL, so no local
database fallback, remote database or production database was used.

## Accounting event and controls

- **Event:** sale/consumption stock issue.
- **Journal:** Dr Cost of Goods Sold / Cr Inventory, exact base-currency cents.
- **Owner:** authenticated tenant; future legal-entity isolation remains open.
- **Currency:** inbound purchase value reuses the PO/receipt original-currency
  amount and posting-rate snapshot; COGS is allocated from stored base value.
- **Tax:** no new tax calculation; invoice tax remains governed separately.
- **Audit:** `inventory.issue_valued` links source, movements, valuations, exact
  total cost and journal identifier.
- **Correction:** offsetting movement plus reversal/correcting journal only.
- **Explanation:** immutable movement evidence and current reconciliation.
- **AI:** read-only explanation may be designed later; AI cannot post or adjust.
- **Permission:** `accounting.post` for invoice issue; `inventory.write` for
  adjustments/opening; `reports.read` for reconciliation.

## Production migration

Production shares one Supabase project with GENFIN. The SQL below is the exact
additive P5-003 DDL/backfill from
`server/drizzle/0029_weighted_average_inventory_valuation.sql`. Apply it only
through the separately approved hand-apply process, after migrations 0026–0028,
with a backup, staging rehearsal, reviewed query/runtime evidence and change
window. **Never run `drizzle-kit push` or `db:push` against production.** No
production command was run during this mission.

```sql
-- P5-003: additive weighted-average valuation cache and immutable movement evidence.
-- Production must hand-apply this reviewed SQL; never run drizzle push there.
SET lock_timeout = '5s';
SET statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS "inventory_valuation_layers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "product_id" uuid NOT NULL REFERENCES "products"("id"),
  "warehouse_id" uuid NOT NULL REFERENCES "warehouses"("id"),
  "quantity_on_hand" numeric(12, 3) DEFAULT 0 NOT NULL,
  "total_cost_cents" bigint DEFAULT 0 NOT NULL,
  "version" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_valuation_layer_quantity_check" CHECK ("quantity_on_hand" >= 0),
  CONSTRAINT "inventory_valuation_layer_cost_check" CHECK ("total_cost_cents" >= 0),
  CONSTRAINT "inventory_valuation_layer_zero_check" CHECK ("quantity_on_hand" <> 0 OR "total_cost_cents" = 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "inventory_valuation_layer_tenant_product_wh"
  ON "inventory_valuation_layers" ("tenant_id", "product_id", "warehouse_id");
CREATE INDEX IF NOT EXISTS "inventory_valuation_layer_tenant_product"
  ON "inventory_valuation_layers" ("tenant_id", "product_id");

CREATE TABLE IF NOT EXISTS "stock_movement_valuations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "stock_movement_id" uuid NOT NULL REFERENCES "stock_movements"("id"),
  "product_id" uuid NOT NULL REFERENCES "products"("id"),
  "warehouse_id" uuid NOT NULL REFERENCES "warehouses"("id"),
  "quantity_before" numeric(12, 3) NOT NULL,
  "quantity_after" numeric(12, 3) NOT NULL,
  "cost_before_cents" bigint NOT NULL,
  "movement_cost_cents" bigint NOT NULL,
  "cost_after_cents" bigint NOT NULL,
  "valuation_method" text DEFAULT 'WEIGHTED_AVERAGE' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "stock_movement_valuation_quantity_check" CHECK ("quantity_before" >= 0 AND "quantity_after" >= 0),
  CONSTRAINT "stock_movement_valuation_cost_check" CHECK ("cost_before_cents" >= 0 AND "movement_cost_cents" >= 0 AND "cost_after_cents" >= 0),
  CONSTRAINT "stock_movement_valuation_method_check" CHECK ("valuation_method" = 'WEIGHTED_AVERAGE'),
  CONSTRAINT "stock_movement_valuation_zero_check" CHECK ("quantity_after" <> 0 OR "cost_after_cents" = 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "stock_movement_valuation_movement"
  ON "stock_movement_valuations" ("stock_movement_id");
CREATE INDEX IF NOT EXISTS "stock_movement_valuation_tenant_product_wh"
  ON "stock_movement_valuations" ("tenant_id", "product_id", "warehouse_id", "created_at");

DROP TRIGGER IF EXISTS "stock_movement_valuations_append_only" ON "stock_movement_valuations";
CREATE TRIGGER "stock_movement_valuations_append_only"
BEFORE UPDATE OR DELETE ON "stock_movement_valuations"
FOR EACH ROW EXECUTE FUNCTION "prevent_financial_history_mutation"();

-- Rebuild current value and immutable allocation evidence from the canonical
-- append-only stock ledger. Positive history uses its stored base-cost snapshot;
-- negative history is replayed under the new weighted-average policy.
DO $$
DECLARE
  movement record;
  layer record;
  delta_units bigint;
  issue_units bigint;
  quantity_before_units bigint;
  quantity_after_units bigint;
  movement_cost bigint;
  cost_after bigint;
BEGIN
  FOR movement IN
    SELECT sm.*
    FROM stock_movements sm
    ORDER BY sm.tenant_id, sm.product_id, sm.warehouse_id, sm.created_at, sm.id
  LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM stock_movement_valuations existing_evidence
      WHERE existing_evidence.stock_movement_id = movement.id
    );
    INSERT INTO inventory_valuation_layers
      (tenant_id, product_id, warehouse_id, quantity_on_hand, total_cost_cents, version)
    VALUES (movement.tenant_id, movement.product_id, movement.warehouse_id, 0, 0, 0)
    ON CONFLICT (tenant_id, product_id, warehouse_id) DO NOTHING;

    SELECT * INTO STRICT layer
    FROM inventory_valuation_layers
    WHERE tenant_id = movement.tenant_id
      AND product_id = movement.product_id
      AND warehouse_id = movement.warehouse_id
    FOR UPDATE;

    delta_units := round(movement.quantity_delta * 1000)::bigint;
    quantity_before_units := round(layer.quantity_on_hand * 1000)::bigint;
    quantity_after_units := quantity_before_units + delta_units;
    IF delta_units = 0 THEN
      RAISE EXCEPTION 'Zero stock movement % cannot be valued', movement.id;
    END IF;
    IF quantity_after_units < 0 THEN
      RAISE EXCEPTION 'Stock movement % creates negative historical quantity', movement.id;
    END IF;

    IF delta_units > 0 THEN
      IF movement.unit_cost IS NULL THEN
        RAISE EXCEPTION 'Positive stock movement % has no base-cost snapshot', movement.id;
      END IF;
      movement_cost := round(movement.unit_cost * 100 * delta_units / 1000)::bigint;
      cost_after := layer.total_cost_cents + movement_cost;
    ELSE
      issue_units := -delta_units;
      IF quantity_before_units <= 0 OR issue_units > quantity_before_units THEN
        RAISE EXCEPTION 'Stock movement % cannot be allocated from historical quantity', movement.id;
      END IF;
      IF issue_units = quantity_before_units THEN
        movement_cost := layer.total_cost_cents;
      ELSE
        movement_cost := round(layer.total_cost_cents::numeric * issue_units / quantity_before_units)::bigint;
      END IF;
      cost_after := layer.total_cost_cents - movement_cost;
    END IF;

    IF movement_cost < 0 OR cost_after < 0 OR cost_after > 99999999999999 THEN
      RAISE EXCEPTION 'Stock movement % creates invalid historical valuation', movement.id;
    END IF;
    IF quantity_after_units = 0 AND cost_after <> 0 THEN
      RAISE EXCEPTION 'Stock movement % leaves residual value at zero quantity', movement.id;
    END IF;

    INSERT INTO stock_movement_valuations (
      tenant_id, stock_movement_id, product_id, warehouse_id,
      quantity_before, quantity_after, cost_before_cents,
      movement_cost_cents, cost_after_cents
    ) VALUES (
      movement.tenant_id, movement.id, movement.product_id, movement.warehouse_id,
      quantity_before_units::numeric / 1000, quantity_after_units::numeric / 1000,
      layer.total_cost_cents, movement_cost, cost_after
    ) ON CONFLICT (stock_movement_id) DO NOTHING;

    UPDATE inventory_valuation_layers
    SET quantity_on_hand = quantity_after_units::numeric / 1000,
        total_cost_cents = cost_after,
        version = version + 1,
        updated_at = now()
    WHERE id = layer.id;
  END LOOP;
END $$;

-- Represent zero stock levels even when no movement exists. A non-zero level
-- without canonical history is rejected by the final invariant check.
INSERT INTO inventory_valuation_layers
  (tenant_id, product_id, warehouse_id, quantity_on_hand, total_cost_cents, version)
SELECT p.tenant_id, sl.product_id, sl.warehouse_id, 0, 0, 0
FROM stock_levels sl
JOIN products p ON p.id = sl.product_id
JOIN warehouses w ON w.id = sl.warehouse_id AND w.tenant_id = p.tenant_id
WHERE sl.quantity_on_hand = 0
ON CONFLICT (tenant_id, product_id, warehouse_id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM stock_levels sl
    JOIN products p ON p.id = sl.product_id
    LEFT JOIN inventory_valuation_layers ivl
      ON ivl.tenant_id = p.tenant_id
     AND ivl.product_id = sl.product_id
     AND ivl.warehouse_id = sl.warehouse_id
    WHERE ivl.id IS NULL OR ivl.quantity_on_hand <> sl.quantity_on_hand
  ) THEN
    RAISE EXCEPTION 'Weighted-average backfill does not reconcile to stock_levels quantity';
  END IF;
END $$;
```

The runtime/local-test integrity installer also adds the following idempotent
guard when the table exists. Production receives the same trigger in 0029 above.

```sql
DO $$
BEGIN
  IF to_regclass('public.stock_movement_valuations') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS "stock_movement_valuations_append_only" ON "public"."stock_movement_valuations";
    CREATE TRIGGER "stock_movement_valuations_append_only"
    BEFORE UPDATE OR DELETE ON "public"."stock_movement_valuations"
    FOR EACH ROW EXECUTE FUNCTION "public"."prevent_financial_history_mutation"();
  END IF;
END $$;
```

## Rollback

- Revert the report UI/route, valuation event extension and inventory/invoice
  integration only through reviewed code rollback.
- Leave additive valuation tables and immutable evidence in place; do not drop
  or rewrite them during an operational rollback.
- Never alter posted stock movements, journal entries/lines, audit evidence,
  invoice numbers or posted invoice state.
- Any financial correction after use requires an offsetting stock movement and
  approved reversing/correcting journal, followed by reconciliation and
  qualified accountant review.

## Risks and open gates

1. Full DB-backed verification is pending the hosted isolated-PostgreSQL gate;
   merge is blocked until it passes.
2. Qualified Zimbabwean accountant approval is mandatory before GA. The UI and
   documents must not call this audited financial output.
3. Legacy positive movements contain two-decimal base unit-cost snapshots. A
   pre-P5-003 FX line-total/unit-rounding difference is preserved as a reported
   Inventory reconciliation exception; posted history is never rewritten.
4. The backfill takes ordered row locks and scans all stock history. Production
   runtime/query plan, representative staging rehearsal and a controlled change
   window are required before hand-application.
5. Reconciliation is a current-position read model, not a historical as-at
   valuation or period-close control.
6. Domain events remain process-local and best-effort. Durable outbox/replay is
   a separate platform mission.

## Next mission

After P5-003 passes hosted verification and merges, deliver the separately
requested tenant-managed, tier-limited warehouse/store settings and improved
brand-colour controls as a focused mission. Then continue P2-004: effective-
dated exchange-rate register with source/date/time and original-currency report
traceability without retro-altering posted history.
