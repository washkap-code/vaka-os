-- P7-002: immutable tenant-scoped finance report snapshot evidence.
-- Additive only; no report source, ledger, tax or existing document data changes.
CREATE TABLE IF NOT EXISTS "finance_report_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "report_type" text NOT NULL,
  "report_version" text NOT NULL,
  "pdf_template_version" text NOT NULL,
  "branding_version" text NOT NULL,
  "parameters" jsonb NOT NULL,
  "report_document" jsonb NOT NULL,
  "branding_document" jsonb NOT NULL,
  "file_name" text NOT NULL,
  "media_type" text DEFAULT 'application/pdf' NOT NULL,
  "byte_size" integer NOT NULL,
  "checksum" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "idempotency_fingerprint" text NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "finance_report_snapshot_type_check" CHECK ("report_type" IN ('VAT', 'STATUTORY')),
  CONSTRAINT "finance_report_snapshot_media_check" CHECK ("media_type" = 'application/pdf'),
  CONSTRAINT "finance_report_snapshot_byte_size_check" CHECK ("byte_size" > 0 AND "byte_size" <= 10000000)
);

CREATE UNIQUE INDEX IF NOT EXISTS "finance_report_snapshot_tenant_idempotency"
  ON "finance_report_snapshots" ("tenant_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "finance_report_snapshot_tenant_time"
  ON "finance_report_snapshots" ("tenant_id", "created_at");

CREATE OR REPLACE FUNCTION vaka_prevent_finance_report_snapshot_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Finance report snapshots are append-only';
END;
$$;

DROP TRIGGER IF EXISTS finance_report_snapshots_append_only ON "finance_report_snapshots";
CREATE TRIGGER finance_report_snapshots_append_only
BEFORE UPDATE OR DELETE ON "finance_report_snapshots"
FOR EACH ROW EXECUTE FUNCTION vaka_prevent_finance_report_snapshot_mutation();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "finance_report_snapshots" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "finance_report_snapshots" FROM authenticated;
  END IF;
END $$;
