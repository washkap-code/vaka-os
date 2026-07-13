-- P2-002: additive VAT treatment evidence. Historical invoice/product rows are
-- intentionally left unclassified; only tenant jurisdiction is backfilled
-- because every existing VAKA tenant belongs to the Zimbabwe launch market.
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "country_code" text DEFAULT 'ZW' NOT NULL;

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "tax_jurisdiction" text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "tax_date" date;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "tax_treatment" text;

ALTER TABLE "invoice_line_items" ADD COLUMN IF NOT EXISTS "tax_treatment" text;
ALTER TABLE "invoice_line_items" ADD COLUMN IF NOT EXISTS "tax_amount" numeric(14,2);
ALTER TABLE "invoice_line_items" ADD COLUMN IF NOT EXISTS "tax_rate_effective_from" date;
ALTER TABLE "invoice_line_items" ADD COLUMN IF NOT EXISTS "tax_rate_effective_to" date;

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "tax_treatment" text;
ALTER TABLE "products" ALTER COLUMN "tax_rate" DROP DEFAULT;

DO $$ BEGIN
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tax_treatment_check"
    CHECK ("tax_treatment" IS NULL OR "tax_treatment" IN ('standard', 'zero-rated', 'exempt', 'mixed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_lines_tax_treatment_check"
    CHECK ("tax_treatment" IS NULL OR "tax_treatment" IN ('standard', 'zero-rated', 'exempt'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "products" ADD CONSTRAINT "products_tax_treatment_check"
    CHECK ("tax_treatment" IS NULL OR "tax_treatment" IN ('standard', 'zero-rated', 'exempt'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
