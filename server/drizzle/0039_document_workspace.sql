-- PD-001: documents workspace (folders, versioned uploads, classification)
-- behind the `documents.workspace` feature flag. Empty tables change nothing.
-- Additive and idempotent: safe to hand-apply to production before the code
-- deploys. Role backfill precedent: 0004 / 0035.

CREATE TABLE IF NOT EXISTS "document_folders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" text NOT NULL,
  "parent_id" uuid,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "document_folders_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "document_folders"("id"),
  CONSTRAINT "document_folders_name_check" CHECK (length(trim("name")) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS "document_folders_root_name"
  ON "document_folders" ("tenant_id", "name") WHERE "parent_id" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "document_folders_child_name"
  ON "document_folders" ("tenant_id", "parent_id", "name") WHERE "parent_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "document_folders_tenant"
  ON "document_folders" ("tenant_id");

CREATE TABLE IF NOT EXISTS "workspace_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "folder_id" uuid REFERENCES "document_folders"("id"),
  "title" text NOT NULL,
  "classification" text NOT NULL,
  "status" text DEFAULT 'ACTIVE' NOT NULL,
  "current_version" integer DEFAULT 1 NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "workspace_documents_classification_check" CHECK ("classification" IN
    ('POLICY', 'CONTRACT', 'CERTIFICATE', 'LICENCE', 'REPORT', 'CORRESPONDENCE', 'OTHER')),
  CONSTRAINT "workspace_documents_status_check" CHECK ("status" IN ('ACTIVE', 'ARCHIVED')),
  CONSTRAINT "workspace_documents_version_check" CHECK ("current_version" >= 1),
  CONSTRAINT "workspace_documents_title_check" CHECK (length(trim("title")) BETWEEN 1 AND 200)
);

CREATE INDEX IF NOT EXISTS "workspace_documents_tenant_status"
  ON "workspace_documents" ("tenant_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "workspace_documents_tenant_folder"
  ON "workspace_documents" ("tenant_id", "folder_id");

CREATE TABLE IF NOT EXISTS "workspace_document_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "document_id" uuid NOT NULL REFERENCES "workspace_documents"("id"),
  "version" integer NOT NULL,
  "file_name" text NOT NULL,
  "media_type" text NOT NULL,
  "byte_size" integer NOT NULL,
  "checksum" text NOT NULL,
  "data_url" text NOT NULL,
  "uploaded_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "workspace_document_versions_version_check" CHECK ("version" >= 1),
  CONSTRAINT "workspace_document_versions_size_check" CHECK ("byte_size" > 0 AND "byte_size" <= 1500000)
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_document_versions_doc_version"
  ON "workspace_document_versions" ("document_id", "version");
CREATE INDEX IF NOT EXISTS "workspace_document_versions_tenant_doc"
  ON "workspace_document_versions" ("tenant_id", "document_id");

-- Role backfill (precedent: 0004 / 0035). Idempotent — unnest+DISTINCT dedupes.
UPDATE "public"."roles"
SET "permissions" = ARRAY(
  SELECT DISTINCT permission
  FROM unnest("permissions" || ARRAY[
    'documents.read',
    'documents.manage'
  ]::text[]) AS permission
)
WHERE "name" IN ('Owner', 'Admin');

UPDATE "public"."roles"
SET "permissions" = ARRAY(
  SELECT DISTINCT permission
  FROM unnest("permissions" || ARRAY['documents.read']::text[]) AS permission
)
WHERE "name" = 'Accountant';
