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
