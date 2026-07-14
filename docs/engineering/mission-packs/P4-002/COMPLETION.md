# P4-002 — Completion Report

**Implementation:** Complete for the controlled procurement lifecycle scope
**Technical verification:** Local static/UI gates complete; hosted isolated-PostgreSQL gate pending
**Availability:** Authenticated tenant Procurement workspace and APIs
**Production migration:** Pending separately authorised hand-application
**Completed on:** 2026-07-14

## Delivered

- Added a tenant-scoped, numbered purchase-requisition workflow with purpose,
  needed-by date, exact product/warehouse quantities, optional planning costs
  and independent approve/reject decisions. A requester cannot decide their own
  requisition.
- Added numbered RFQs derived only from approved requisitions. Invitations
  reference the existing canonical contact with `is_vendor = true`; no
  supplier, product, warehouse or company identity was duplicated.
- Added supplier award with complete quoted line costs. Award atomically creates
  one linked `DRAFT` purchase order using the existing purchase-order tables.
- Added independent PO approval with a retained reason. Approval assigns the
  immutable sequential PO number and moves the order to `ORDERED`; the PO
  creator and original requester cannot approve it.
- Added idempotent partial/final goods receipts with PO locking, cumulative
  over-receipt protection and immutable receipt numbers. Every receipt appends
  stock movements through the inventory service, emits `stock.moved`, audits
  atomically and moves the PO to `RECEIVED` only when all lines are complete.
- Receipt accounting posts Dr Inventory / Cr Goods Received Not Invoiced in
  tenant base currency from the PO exchange-rate snapshot. It does not post
  Accounts Payable or input VAT. Foreign-currency stock-cost snapshots are
  converted to base currency.
- Added separated procurement read/request/write/approve/receive permissions,
  system roles, tenant-scoped bounded approval notifications and catalogue-safe
  notification display.
- Replaced the purchase-order-only page with a responsive Procurement workspace
  for requisitions, RFQs, purchase orders and goods receipts. All actions are
  permission-aware, labelled, keyboard-operable and reflow at 320/640 widths.
- Preserved existing `ORDERED` PO receipt compatibility through explicit
  migration evidence rather than weakening approval rules for new records.

## Files changed

- Mission and governance: `docs/engineering/mission-packs/P4-002/`, event
  catalogue and `CHANGELOG.md`.
- Database/preparation: `server/src/db/schema.ts`,
  `server/drizzle/0027_controlled_procurement_lifecycle.sql` and the guarded
  procurement integrity-control runner.
- Server behavior: procurement lifecycle and notifier services, routes,
  permission/default-role catalogue, accounting chart, inventory compatibility,
  platform event registry/runtime.
- Web behavior: lazy-loaded Procurement workspace, navigation, typed English
  catalogue, approval notification copy, responsive styles and accessibility
  contracts.
- Verification: P4-002 lifecycle/concurrency/RBAC/tenant/finance integration
  tests plus updated critical and finance invariants.

## Verification evidence

- Conflict-copy scan: passed; no files ending ` 2.md`, `.gitattributes 2`
  or matching `* 2.*` were present.
- Server typecheck: passed.
- Web typecheck: passed.
- Web production build: passed; the Procurement workspace is code-split and no
  chunk-size warning remains.
- Shell/navigation tests: 16 passed, 0 failed.
- Design-token conformance: passed (236 governed tokens).
- Accessibility conformance and negative self-test: passed, including all seven
  procurement dialogs and the procurement tablist.
- `git diff --check`: passed.
- Guarded `test:db:prepare` and the full DB-backed server suite require the
  isolated PostgreSQL runner and are pending on the hosted PR gate; no local
  PostgreSQL service or test `DATABASE_URL` is available.
- No production database command was run.

## Production migration

Production shares its Supabase project with unrelated GENFIN tables. No
`drizzle-kit push`, `db:push`, DDL, migration or other database command was
run against production. After merge, an authorised operator must review and
hand-apply the following exact additive DDL to the VAKA schema only:

```sql
-- P4-002: additive requisition, RFQ, approval and goods-receipt lifecycle.
-- Production must hand-apply this reviewed SQL; never run drizzle push there.
SET lock_timeout = '5s';
SET statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS "purchase_requisitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "number" text NOT NULL,
  "status" text DEFAULT 'SUBMITTED' NOT NULL,
  "purpose" text NOT NULL,
  "needed_by" timestamp with time zone,
  "currency" "currency" DEFAULT 'USD' NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "approved_by" uuid REFERENCES "users"("id"),
  "approved_at" timestamp with time zone,
  "decision_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "purchase_requisitions_status_check"
    CHECK ("status" IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "purchase_requisitions_tenant_number"
  ON "purchase_requisitions" ("tenant_id", "number");
CREATE INDEX IF NOT EXISTS "purchase_requisitions_tenant_status"
  ON "purchase_requisitions" ("tenant_id", "status", "created_at");

CREATE TABLE IF NOT EXISTS "purchase_requisition_line_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "purchase_requisition_id" uuid NOT NULL REFERENCES "purchase_requisitions"("id"),
  "product_id" uuid NOT NULL REFERENCES "products"("id"),
  "warehouse_id" uuid NOT NULL REFERENCES "warehouses"("id"),
  "position" integer NOT NULL,
  "quantity" numeric(12, 3) NOT NULL,
  "estimated_unit_cost" numeric(14, 2),
  CONSTRAINT "purchase_requisition_lines_position_check" CHECK ("position" > 0),
  CONSTRAINT "purchase_requisition_lines_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "purchase_requisition_lines_cost_check"
    CHECK ("estimated_unit_cost" IS NULL OR "estimated_unit_cost" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "purchase_requisition_lines_position"
  ON "purchase_requisition_line_items" ("purchase_requisition_id", "position");
CREATE INDEX IF NOT EXISTS "purchase_requisition_lines_tenant"
  ON "purchase_requisition_line_items" ("tenant_id", "purchase_requisition_id");

CREATE TABLE IF NOT EXISTS "request_for_quotes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "purchase_requisition_id" uuid NOT NULL REFERENCES "purchase_requisitions"("id"),
  "number" text NOT NULL,
  "status" text DEFAULT 'ISSUED' NOT NULL,
  "response_due_at" timestamp with time zone,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "awarded_supplier_contact_id" uuid REFERENCES "contacts"("id"),
  "awarded_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "request_for_quotes_status_check"
    CHECK ("status" IN ('ISSUED', 'AWARDED', 'CANCELLED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "request_for_quotes_tenant_number"
  ON "request_for_quotes" ("tenant_id", "number");
CREATE UNIQUE INDEX IF NOT EXISTS "request_for_quotes_requisition"
  ON "request_for_quotes" ("tenant_id", "purchase_requisition_id");
CREATE INDEX IF NOT EXISTS "request_for_quotes_tenant_status"
  ON "request_for_quotes" ("tenant_id", "status", "created_at");

CREATE TABLE IF NOT EXISTS "request_for_quote_line_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "request_for_quote_id" uuid NOT NULL REFERENCES "request_for_quotes"("id"),
  "purchase_requisition_line_item_id" uuid NOT NULL REFERENCES "purchase_requisition_line_items"("id"),
  "product_id" uuid NOT NULL REFERENCES "products"("id"),
  "warehouse_id" uuid NOT NULL REFERENCES "warehouses"("id"),
  "position" integer NOT NULL,
  "quantity" numeric(12, 3) NOT NULL,
  CONSTRAINT "request_for_quote_lines_position_check" CHECK ("position" > 0),
  CONSTRAINT "request_for_quote_lines_quantity_check" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "request_for_quote_lines_position"
  ON "request_for_quote_line_items" ("request_for_quote_id", "position");
CREATE UNIQUE INDEX IF NOT EXISTS "request_for_quote_lines_requisition_line"
  ON "request_for_quote_line_items" ("request_for_quote_id", "purchase_requisition_line_item_id");
CREATE INDEX IF NOT EXISTS "request_for_quote_lines_tenant"
  ON "request_for_quote_line_items" ("tenant_id", "request_for_quote_id");

CREATE TABLE IF NOT EXISTS "request_for_quote_suppliers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "request_for_quote_id" uuid NOT NULL REFERENCES "request_for_quotes"("id"),
  "supplier_contact_id" uuid NOT NULL REFERENCES "contacts"("id"),
  "invited_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "request_for_quote_suppliers_unique"
  ON "request_for_quote_suppliers" ("request_for_quote_id", "supplier_contact_id");
CREATE INDEX IF NOT EXISTS "request_for_quote_suppliers_tenant"
  ON "request_for_quote_suppliers" ("tenant_id", "request_for_quote_id");

ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "purchase_requisition_id" uuid REFERENCES "purchase_requisitions"("id");
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "request_for_quote_id" uuid REFERENCES "request_for_quotes"("id");
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "approved_by" uuid REFERENCES "users"("id");
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone;
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "approval_reason" text;

-- Preserve receipt compatibility for orders authorised before approval
-- evidence columns existed. New orders can never create this sentinel.
UPDATE "purchase_orders"
SET "approved_by" = "created_by",
    "approved_at" = COALESCE("received_at", "created_at"),
    "approval_reason" = 'Legacy order migrated as previously authorised'
WHERE "status" IN ('ORDERED', 'RECEIVED')
  AND "approved_at" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "po_tenant_rfq"
  ON "purchase_orders" ("tenant_id", "request_for_quote_id");
CREATE INDEX IF NOT EXISTS "po_tenant_requisition"
  ON "purchase_orders" ("tenant_id", "purchase_requisition_id");

CREATE TABLE IF NOT EXISTS "goods_receipts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "purchase_order_id" uuid NOT NULL REFERENCES "purchase_orders"("id"),
  "number" text NOT NULL,
  "status" text DEFAULT 'POSTED' NOT NULL,
  "received_at" timestamp with time zone NOT NULL,
  "delivery_note" text,
  "note" text,
  "idempotency_key" text NOT NULL,
  "idempotency_fingerprint" text NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "goods_receipts_status_check" CHECK ("status" = 'POSTED')
);

CREATE UNIQUE INDEX IF NOT EXISTS "goods_receipts_tenant_number"
  ON "goods_receipts" ("tenant_id", "number");
CREATE UNIQUE INDEX IF NOT EXISTS "goods_receipts_tenant_idempotency"
  ON "goods_receipts" ("tenant_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "goods_receipts_tenant_po"
  ON "goods_receipts" ("tenant_id", "purchase_order_id", "created_at");

CREATE TABLE IF NOT EXISTS "goods_receipt_line_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "goods_receipt_id" uuid NOT NULL REFERENCES "goods_receipts"("id"),
  "purchase_order_line_item_id" uuid NOT NULL REFERENCES "purchase_order_line_items"("id"),
  "product_id" uuid NOT NULL REFERENCES "products"("id"),
  "warehouse_id" uuid NOT NULL REFERENCES "warehouses"("id"),
  "quantity_received" numeric(12, 3) NOT NULL,
  "unit_cost" numeric(14, 2) NOT NULL,
  "line_total" numeric(14, 2) NOT NULL,
  CONSTRAINT "goods_receipt_lines_quantity_check" CHECK ("quantity_received" > 0),
  CONSTRAINT "goods_receipt_lines_cost_check" CHECK ("unit_cost" >= 0 AND "line_total" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "goods_receipt_lines_po_line"
  ON "goods_receipt_line_items" ("goods_receipt_id", "purchase_order_line_item_id");
CREATE INDEX IF NOT EXISTS "goods_receipt_lines_tenant_receipt"
  ON "goods_receipt_line_items" ("tenant_id", "goods_receipt_id");
CREATE INDEX IF NOT EXISTS "goods_receipt_lines_po_line_lookup"
  ON "goods_receipt_line_items" ("tenant_id", "purchase_order_line_item_id");

CREATE UNIQUE INDEX IF NOT EXISTS "accounts_tenant_system_key"
  ON "accounts" ("tenant_id", "system_key") WHERE "system_key" IS NOT NULL;

INSERT INTO "accounts" ("tenant_id", "code", "name", "type", "is_system", "system_key", "is_active")
SELECT tenant."id",
  CASE WHEN EXISTS (
    SELECT 1 FROM "accounts" account
    WHERE account."tenant_id" = tenant."id" AND account."code" = '2050'
  ) THEN 'GRNI-' || tenant."id"::text ELSE '2050' END,
  'Goods Received Not Invoiced', 'LIABILITY', true, 'GRNI', true
FROM "tenants" tenant
WHERE NOT EXISTS (
  SELECT 1 FROM "accounts" account
  WHERE account."tenant_id" = tenant."id" AND account."system_key" = 'GRNI'
);

UPDATE "roles"
SET "permissions" = ARRAY(
  SELECT DISTINCT permission
  FROM unnest("permissions" || ARRAY[
    'procurement.read', 'procurement.request', 'procurement.write',
    'procurement.approve', 'procurement.receive'
  ]::text[]) AS permission
)
WHERE "name" IN ('Owner', 'Admin');

UPDATE "roles"
SET "permissions" = ARRAY(
  SELECT DISTINCT permission
  FROM unnest("permissions" || ARRAY[
    'procurement.read', 'procurement.request', 'procurement.write',
    'procurement.receive'
  ]::text[]) AS permission
)
WHERE "name" = 'Stock Controller';

UPDATE "roles"
SET "permissions" = ARRAY(
  SELECT DISTINCT permission
  FROM unnest("permissions" || ARRAY['procurement.read']::text[]) AS permission
)
WHERE "name" = 'Accountant';

INSERT INTO "roles" ("tenant_id", "name", "permissions", "is_system")
SELECT tenant."id", 'Procurement Officer',
  ARRAY['procurement.read', 'procurement.request', 'procurement.write', 'procurement.receive']::text[], true
FROM "tenants" tenant
ON CONFLICT ("tenant_id", "name") DO NOTHING;

INSERT INTO "roles" ("tenant_id", "name", "permissions", "is_system")
SELECT tenant."id", 'Procurement Approver',
  ARRAY['procurement.read', 'procurement.approve']::text[], true
FROM "tenants" tenant
ON CONFLICT ("tenant_id", "name") DO NOTHING;
```

The backfill adds procurement permissions and roles, assigns GRNI to every
existing tenant without overwriting an occupied chart code, and records explicit
legacy approval evidence for existing ordered/received POs. New records remain
subject to the independent approval services.

## Behaviour and finance boundaries

- Requisitions, RFQs, draft orders and PO approval are non-posting commitment
  records.
- A goods receipt recognises inventory possession only. It posts Inventory/GRNI
  and deliberately excludes AP and input VAT until P4-003 completes a controlled
  three-way match and supplier-bill posting.
- Receipt, stock, journal, numbering, PO status and audit effects share one
  transaction. Posted receipt/stock/journal history has no edit or delete path.
- Tenant is still the documented legal-entity surrogate. This mission does not
  claim multi-entity accounting or qualified tax approval.
- The GRNI account and Zimbabwe accounting treatment require qualified
  accountant review before market GA.
- No AI provider can request, approve, award, receive or post procurement
  records.

## Risks and follow-up gates

1. Production remains schema-gated until the exact DDL above is independently
   reviewed and hand-applied; application deployment must not precede it.
2. Domain events and in-app notifications remain best-effort and process-local.
   Durable outbox/replay/dead-letter operations remain a platform follow-up.
3. Existing stock movements retain a two-decimal unit-cost snapshot, so
   unusually small per-unit foreign-currency values remain constrained by the
   current inventory schema even though journals use exact integer cents.
4. Amount-based authority limits, multi-stage approval, budgets, supplier quote
   portals, attachments, quality inspection, returns and receipt reversal are
   outside this mission.
5. English catalogue copy is implemented. ChiShona and isiNdebele procurement
   terminology requires native/professional review before enablement.

## Rollback

Revert procurement routes/services/UI/permissions and event subscribers only
through a reviewed rollback. Additive tables and columns may remain dormant.
Never drop receipt, stock movement, journal, number or audit history. Any posted
GRNI balances require normal accounting reconciliation or future offsetting
workflow, not destructive deletion.

## Next mission

P4-003 — enforce three-way matching between purchase order, goods receipt and
supplier bill before Accounts Payable posting through the existing balanced,
append-only journal service.
