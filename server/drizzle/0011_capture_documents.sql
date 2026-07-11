CREATE TABLE IF NOT EXISTS "capture_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "document_type" text NOT NULL,
  "file_name" text NOT NULL,
  "media_type" text NOT NULL,
  "byte_size" integer NOT NULL,
  "data_url" text NOT NULL,
  "status" text DEFAULT 'CAPTURED' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "capture_documents_tenant_time"
  ON "capture_documents" ("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "capture_documents_tenant_status"
  ON "capture_documents" ("tenant_id", "status");
