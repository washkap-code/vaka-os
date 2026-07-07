ALTER TABLE "public"."bank_transactions"
  ADD COLUMN IF NOT EXISTS "reference" text,
  ADD COLUMN IF NOT EXISTS "source_key" text;

CREATE UNIQUE INDEX IF NOT EXISTS "banktx_account_source"
  ON "public"."bank_transactions" USING btree ("bank_account_id", "source_key");

UPDATE "public"."roles"
SET "permissions" = ARRAY(
  SELECT DISTINCT permission
  FROM unnest("permissions" || ARRAY[
    'bank_accounts.read',
    'bank_accounts.configure',
    'bank_statements.import',
    'bank_transactions.read'
  ]::text[]) AS permission
)
WHERE "name" IN ('Owner', 'Admin');
