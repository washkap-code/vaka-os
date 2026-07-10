-- Immutable invoice render inputs captured at issue time.
CREATE TABLE IF NOT EXISTS "invoice_document_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "invoice_id" uuid NOT NULL REFERENCES "invoices"("id"),
  "template_version" text NOT NULL,
  "document" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "invoice_document_snapshot_invoice"
  ON "invoice_document_snapshots" ("invoice_id");
CREATE INDEX IF NOT EXISTS "invoice_document_snapshot_tenant"
  ON "invoice_document_snapshots" ("tenant_id", "created_at");
