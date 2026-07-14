-- Optional customer-facing invoice document settings. These fields contain
-- payment instructions only; internet-banking credentials must never be stored.
SET lock_timeout = '5s';

ALTER TABLE public."tenants"
  ADD COLUMN IF NOT EXISTS "invoice_payment_terms" text,
  ADD COLUMN IF NOT EXISTS "invoice_bank_name" text,
  ADD COLUMN IF NOT EXISTS "invoice_bank_account_name" text,
  ADD COLUMN IF NOT EXISTS "invoice_bank_account_number" text,
  ADD COLUMN IF NOT EXISTS "invoice_bank_branch" text,
  ADD COLUMN IF NOT EXISTS "invoice_bank_swift_code" text,
  ADD COLUMN IF NOT EXISTS "invoice_bank_currency" text,
  ADD COLUMN IF NOT EXISTS "show_vat_number_on_invoices" boolean DEFAULT true NOT NULL;

ALTER TABLE public."tenants"
  DROP CONSTRAINT IF EXISTS "tenants_invoice_bank_currency_check";
ALTER TABLE public."tenants"
  ADD CONSTRAINT "tenants_invoice_bank_currency_check"
  CHECK ("invoice_bank_currency" IS NULL OR "invoice_bank_currency" IN ('USD', 'ZWG'));
