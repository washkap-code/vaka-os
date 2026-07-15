-- PB-001: Black Book registry — versioned, governed platform content.
-- Global (platform-owned) reference data: NOT tenant data. Tenant read access
-- is gated by the `blackbook.directory` feature flag; writes are platform-staff
-- imports only (step-up protected, audited to platform_audit_logs).
-- Empty tables change nothing. Additive and idempotent: safe to hand-apply to
-- production before the code deploys.

CREATE TABLE IF NOT EXISTS "blackbook_import_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "country_code" text NOT NULL,
  "dataset_revision" text NOT NULL,
  "imported_by" uuid NOT NULL REFERENCES "users"("id"),
  "record_count" integer NOT NULL,
  "created_count" integer NOT NULL,
  "updated_count" integer NOT NULL,
  "unchanged_count" integer NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "blackbook_import_runs_revision_check" CHECK (length(trim("dataset_revision")) BETWEEN 1 AND 200),
  CONSTRAINT "blackbook_import_runs_counts_check" CHECK (
    "record_count" >= 0 AND "created_count" >= 0 AND "updated_count" >= 0 AND "unchanged_count" >= 0
  )
);

CREATE INDEX IF NOT EXISTS "blackbook_import_runs_country"
  ON "blackbook_import_runs" ("country_code", "created_at");

CREATE TABLE IF NOT EXISTS "blackbook_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "country_code" text NOT NULL,
  "entry_key" text NOT NULL,
  "category" text NOT NULL,
  "name" text NOT NULL,
  "payload" jsonb NOT NULL,
  "verified" boolean NOT NULL,
  "sources" jsonb NOT NULL,
  "last_reviewed" date NOT NULL,
  "status" text DEFAULT 'ACTIVE' NOT NULL,
  "current_version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "blackbook_entries_category_check" CHECK ("category" IN (
    'government_organisation', 'regulator', 'local_authority', 'utility',
    'tender_portal', 'business_association', 'licence_type', 'compliance_event', 'service')),
  CONSTRAINT "blackbook_entries_status_check" CHECK ("status" IN ('ACTIVE', 'RETIRED')),
  CONSTRAINT "blackbook_entries_version_check" CHECK ("current_version" >= 1),
  CONSTRAINT "blackbook_entries_key_check" CHECK ("entry_key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

CREATE UNIQUE INDEX IF NOT EXISTS "blackbook_entries_country_key"
  ON "blackbook_entries" ("country_code", "entry_key");
CREATE INDEX IF NOT EXISTS "blackbook_entries_country_category"
  ON "blackbook_entries" ("country_code", "category", "status");

CREATE TABLE IF NOT EXISTS "blackbook_entry_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "entry_id" uuid NOT NULL REFERENCES "blackbook_entries"("id"),
  "version" integer NOT NULL,
  "payload" jsonb NOT NULL,
  "verified" boolean NOT NULL,
  "sources" jsonb NOT NULL,
  "last_reviewed" date NOT NULL,
  "import_run_id" uuid NOT NULL REFERENCES "blackbook_import_runs"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "blackbook_entry_versions_version_check" CHECK ("version" >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS "blackbook_entry_versions_entry_version"
  ON "blackbook_entry_versions" ("entry_id", "version");
CREATE INDEX IF NOT EXISTS "blackbook_entry_versions_run"
  ON "blackbook_entry_versions" ("import_run_id");
