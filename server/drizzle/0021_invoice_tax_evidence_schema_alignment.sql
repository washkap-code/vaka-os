-- HOTFIX-2026-07-13: idempotently align production with the P2-002 runtime
-- contract. All evidence columns are nullable so historical drafts and posted
-- documents are preserved without invented tax classifications.
SET lock_timeout = '5s';
SET statement_timeout = '30s';

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "tax_jurisdiction" text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "tax_date" date;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "tax_treatment" text;

ALTER TABLE "invoice_line_items" ADD COLUMN IF NOT EXISTS "tax_treatment" text;
ALTER TABLE "invoice_line_items" ADD COLUMN IF NOT EXISTS "tax_amount" numeric(14,2);
ALTER TABLE "invoice_line_items" ADD COLUMN IF NOT EXISTS "tax_rate_effective_from" date;
ALTER TABLE "invoice_line_items" ADD COLUMN IF NOT EXISTS "tax_rate_effective_to" date;

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "tax_treatment" text;

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
