-- Mission 2D: critical financial integrity controls.
-- Preconditions:
-- - no cross-tenant journal/account references;
-- - no orphaned journal lines;
-- - no financial history repair is performed by this migration.

ALTER TABLE "public"."payments"
  ADD COLUMN IF NOT EXISTS "idempotency_key" text;

ALTER TABLE "public"."payments"
  ADD COLUMN IF NOT EXISTS "idempotency_fingerprint" text;

ALTER TABLE "public"."expenses"
  ADD COLUMN IF NOT EXISTS "idempotency_key" text;

ALTER TABLE "public"."expenses"
  ADD COLUMN IF NOT EXISTS "idempotency_fingerprint" text;

ALTER TABLE "public"."stock_movements"
  ADD COLUMN IF NOT EXISTS "idempotency_key" text;

ALTER TABLE "public"."stock_movements"
  ADD COLUMN IF NOT EXISTS "idempotency_fingerprint" text;

DROP INDEX IF EXISTS "public"."payments_tenant_idempotency";
CREATE UNIQUE INDEX "payments_tenant_idempotency"
  ON "public"."payments" ("tenant_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

DROP INDEX IF EXISTS "public"."expenses_tenant_idempotency";
CREATE UNIQUE INDEX "expenses_tenant_idempotency"
  ON "public"."expenses" ("tenant_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

DROP INDEX IF EXISTS "public"."stock_movements_tenant_idempotency";
CREATE UNIQUE INDEX "stock_movements_tenant_idempotency"
  ON "public"."stock_movements" ("tenant_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

ALTER TABLE "public"."journal_lines"
  DROP CONSTRAINT IF EXISTS "journal_lines_journal_entry_id_journal_entries_id_fk";

ALTER TABLE "public"."journal_lines"
  ADD CONSTRAINT "journal_lines_journal_entry_id_journal_entries_id_fk"
  FOREIGN KEY ("journal_entry_id")
  REFERENCES "public"."journal_entries"("id")
  ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION "public"."prevent_financial_history_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'posted financial history is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "journal_entries_append_only" ON "public"."journal_entries";
CREATE TRIGGER "journal_entries_append_only"
BEFORE UPDATE OR DELETE ON "public"."journal_entries"
FOR EACH ROW EXECUTE FUNCTION "public"."prevent_financial_history_mutation"();

DROP TRIGGER IF EXISTS "journal_lines_append_only" ON "public"."journal_lines";
CREATE TRIGGER "journal_lines_append_only"
BEFORE UPDATE OR DELETE ON "public"."journal_lines"
FOR EACH ROW EXECUTE FUNCTION "public"."prevent_financial_history_mutation"();

DROP TRIGGER IF EXISTS "stock_movements_append_only" ON "public"."stock_movements";
CREATE TRIGGER "stock_movements_append_only"
BEFORE UPDATE OR DELETE ON "public"."stock_movements"
FOR EACH ROW EXECUTE FUNCTION "public"."prevent_financial_history_mutation"();

DO $$
BEGIN
  IF to_regclass('public.stock_movement_valuations') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS "stock_movement_valuations_append_only" ON "public"."stock_movement_valuations";
    CREATE TRIGGER "stock_movement_valuations_append_only"
    BEFORE UPDATE OR DELETE ON "public"."stock_movement_valuations"
    FOR EACH ROW EXECUTE FUNCTION "public"."prevent_financial_history_mutation"();
  END IF;
END $$;
