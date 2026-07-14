-- P4-001: supplier-specific attributes remain on the one canonical contact
-- record. No supplier/company/contact master is duplicated.
SET lock_timeout = '5s';
SET statement_timeout = '30s';

ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "supplier_code" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "supplier_currency" "currency";
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "supplier_payment_terms_days" integer;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "supplier_lead_time_days" integer;

DO $$ BEGIN
  ALTER TABLE "contacts" ADD CONSTRAINT "contacts_supplier_payment_terms_days_check"
    CHECK ("supplier_payment_terms_days" IS NULL OR "supplier_payment_terms_days" BETWEEN 0 AND 3650);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "contacts" ADD CONSTRAINT "contacts_supplier_lead_time_days_check"
    CHECK ("supplier_lead_time_days" IS NULL OR "supplier_lead_time_days" BETWEEN 0 AND 3650);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "contacts_tenant_active_supplier_code"
  ON "contacts" ("tenant_id", lower("supplier_code"))
  WHERE "supplier_code" IS NOT NULL AND "deleted_at" IS NULL;

-- Backward-compatible expansion of the rebuildable search projection.
ALTER TABLE "search_documents" DROP CONSTRAINT IF EXISTS "search_documents_entity_type_check";
ALTER TABLE "search_documents" ADD CONSTRAINT "search_documents_entity_type_check"
  CHECK ("entity_type" IN ('customer', 'supplier', 'invoice', 'product'));
