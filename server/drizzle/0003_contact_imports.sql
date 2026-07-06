CREATE TABLE IF NOT EXISTS "public"."import_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "entity_type" text NOT NULL,
  "status" text DEFAULT 'PREVIEW' NOT NULL,
  "total_rows" integer DEFAULT 0 NOT NULL,
  "valid_rows" integer DEFAULT 0 NOT NULL,
  "invalid_rows" integer DEFAULT 0 NOT NULL,
  "duplicate_rows" integer DEFAULT 0 NOT NULL,
  "created_by" uuid,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "import_batches_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id"),
  CONSTRAINT "import_batches_user_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
);

CREATE INDEX IF NOT EXISTS "imports_tenant_time"
  ON "public"."import_batches" USING btree ("tenant_id", "created_at");

CREATE TABLE IF NOT EXISTS "public"."import_rows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "batch_id" uuid NOT NULL,
  "row_number" integer NOT NULL,
  "data" jsonb NOT NULL,
  "status" text NOT NULL,
  "error" text,
  "created_record_id" uuid,
  CONSTRAINT "import_rows_batch_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id"),
  CONSTRAINT "import_batch_row" UNIQUE ("batch_id", "row_number")
);

UPDATE "public"."roles"
SET "permissions" = ARRAY(
  SELECT DISTINCT permission
  FROM unnest("permissions" || ARRAY['imports.create', 'imports.approve']::text[]) AS permission
)
WHERE "name" IN ('Owner', 'Admin');
