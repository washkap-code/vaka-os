-- LP-001: align historical additive SQL with the runtime Drizzle contract.
-- Forward-only and data-preserving:
--   1. rename the timeline projection timestamp used by runtime queries;
--   2. convert the invoice bank currency column to the existing currency enum.
-- Every statement is PostgreSQL transaction-safe. Apply as one transaction.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customer_timeline_events'
      AND column_name = 'projected_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customer_timeline_events'
      AND column_name = 'created_at'
  ) THEN
    ALTER TABLE "customer_timeline_events" RENAME COLUMN "projected_at" TO "created_at";
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customer_timeline_events'
      AND column_name = 'projected_at'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customer_timeline_events'
      AND column_name = 'created_at'
  ) THEN
    RAISE EXCEPTION 'customer_timeline_events has both projected_at and created_at; manual reconciliation required';
  END IF;
END $$;

ALTER TABLE "tenants"
  DROP CONSTRAINT IF EXISTS "tenants_invoice_bank_currency_check";

DO $$
DECLARE
  current_type text;
  current_udt text;
BEGIN
  SELECT data_type, udt_name INTO current_type, current_udt
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'tenants'
    AND column_name = 'invoice_bank_currency';

  IF current_type = 'text' THEN
    ALTER TABLE "tenants"
      ALTER COLUMN "invoice_bank_currency" TYPE "currency"
      USING "invoice_bank_currency"::"currency";
  ELSIF current_type IS DISTINCT FROM 'USER-DEFINED' OR current_udt IS DISTINCT FROM 'currency' THEN
    RAISE EXCEPTION 'Unexpected tenants.invoice_bank_currency type: %.%', current_type, current_udt;
  END IF;
END $$;
