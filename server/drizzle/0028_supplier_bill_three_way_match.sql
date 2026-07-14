-- P4-003: additive supplier bills and enforced three-way-match evidence.
-- Production must hand-apply this reviewed SQL; never run drizzle push there.
SET lock_timeout = '5s';
SET statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS "supplier_bills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "purchase_order_id" uuid NOT NULL REFERENCES "purchase_orders"("id"),
  "vendor_contact_id" uuid NOT NULL REFERENCES "contacts"("id"),
  "number" text,
  "supplier_invoice_number" text NOT NULL,
  "status" text DEFAULT 'DRAFT' NOT NULL,
  "bill_date" timestamp with time zone NOT NULL,
  "tax_date" date NOT NULL,
  "due_date" timestamp with time zone NOT NULL,
  "currency" "currency" NOT NULL,
  "rate_to_base" numeric(18, 6) NOT NULL,
  "tax_jurisdiction" text NOT NULL,
  "tax_treatment" text NOT NULL,
  "subtotal" numeric(14, 2) NOT NULL,
  "tax_total" numeric(14, 2) NOT NULL,
  "total" numeric(14, 2) NOT NULL,
  "match_status" text DEFAULT 'PENDING' NOT NULL,
  "match_evidence" jsonb,
  "matched_at" timestamp with time zone,
  "posting_idempotency_key" text,
  "posting_idempotency_fingerprint" text,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "updated_by" uuid NOT NULL REFERENCES "users"("id"),
  "posted_by" uuid REFERENCES "users"("id"),
  "posted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "supplier_bills_status_check" CHECK ("status" IN ('DRAFT', 'POSTED')),
  CONSTRAINT "supplier_bills_match_status_check" CHECK ("match_status" IN ('PENDING', 'MATCHED', 'BLOCKED')),
  CONSTRAINT "supplier_bills_tax_treatment_check" CHECK ("tax_treatment" IN ('standard', 'zero-rated', 'exempt', 'mixed')),
  CONSTRAINT "supplier_bills_totals_check" CHECK ("subtotal" >= 0 AND "tax_total" >= 0 AND "total" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "supplier_bills_tenant_number"
  ON "supplier_bills" ("tenant_id", "number");
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_bills_tenant_supplier_invoice"
  ON "supplier_bills" ("tenant_id", "vendor_contact_id", lower("supplier_invoice_number"));
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_bills_tenant_posting_idempotency"
  ON "supplier_bills" ("tenant_id", "posting_idempotency_key");
CREATE INDEX IF NOT EXISTS "supplier_bills_tenant_po"
  ON "supplier_bills" ("tenant_id", "purchase_order_id", "created_at");
CREATE INDEX IF NOT EXISTS "supplier_bills_tenant_status"
  ON "supplier_bills" ("tenant_id", "status", "due_date");

CREATE TABLE IF NOT EXISTS "supplier_bill_line_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "supplier_bill_id" uuid NOT NULL REFERENCES "supplier_bills"("id"),
  "purchase_order_line_item_id" uuid NOT NULL REFERENCES "purchase_order_line_items"("id"),
  "product_id" uuid NOT NULL REFERENCES "products"("id"),
  "position" integer NOT NULL,
  "quantity" numeric(12, 3) NOT NULL,
  "unit_price" numeric(14, 2) NOT NULL,
  "net_amount" numeric(14, 2) NOT NULL,
  "tax_treatment" text NOT NULL,
  "tax_rate" numeric(7, 4) NOT NULL,
  "tax_rate_effective_from" date,
  "tax_rate_effective_to" date,
  "tax_amount" numeric(14, 2) NOT NULL,
  "line_total" numeric(14, 2) NOT NULL,
  CONSTRAINT "supplier_bill_lines_position_check" CHECK ("position" > 0),
  CONSTRAINT "supplier_bill_lines_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "supplier_bill_lines_money_check"
    CHECK ("unit_price" > 0 AND "net_amount" >= 0 AND "tax_amount" >= 0 AND "line_total" >= 0),
  CONSTRAINT "supplier_bill_lines_tax_treatment_check"
    CHECK ("tax_treatment" IN ('standard', 'zero-rated', 'exempt'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "supplier_bill_lines_po_line"
  ON "supplier_bill_line_items" ("supplier_bill_id", "purchase_order_line_item_id");
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_bill_lines_position"
  ON "supplier_bill_line_items" ("supplier_bill_id", "position");
CREATE INDEX IF NOT EXISTS "supplier_bill_lines_tenant_bill"
  ON "supplier_bill_line_items" ("tenant_id", "supplier_bill_id");
CREATE INDEX IF NOT EXISTS "supplier_bill_lines_tenant_po_line"
  ON "supplier_bill_line_items" ("tenant_id", "purchase_order_line_item_id");
