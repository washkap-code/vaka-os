-- PM-001/PM-002: Migration Hub — staged, auditable tenant migrations.
-- Generalises the existing import framework (import_batches/import_rows stay
-- authoritative for row staging) into project-grouped migrations with
-- commit/rollback tracking, an opening-balance journal step and an AR/AP
-- open-item register for accountant reconciliation.
-- Empty tables change nothing. Additive and idempotent: safe to hand-apply
-- to production before the code deploys.

CREATE TABLE IF NOT EXISTS "migration_projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" text NOT NULL,
  "source_system" text NOT NULL,
  "status" text DEFAULT 'OPEN' NOT NULL,
  "sign_off" jsonb,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "migration_projects_status_check" CHECK ("status" IN ('OPEN', 'CLOSED')),
  CONSTRAINT "migration_projects_name_check" CHECK (length(trim("name")) BETWEEN 1 AND 120),
  CONSTRAINT "migration_projects_source_check" CHECK (length(trim("source_system")) BETWEEN 1 AND 120)
);

CREATE INDEX IF NOT EXISTS "migration_projects_tenant"
  ON "migration_projects" ("tenant_id", "created_at");

CREATE TABLE IF NOT EXISTS "migration_steps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "project_id" uuid NOT NULL REFERENCES "migration_projects"("id"),
  "kind" text NOT NULL,
  "status" text DEFAULT 'STAGED' NOT NULL,
  "import_batch_id" uuid REFERENCES "import_batches"("id"),
  "journal_entry_id" uuid,
  "reversal_journal_entry_id" uuid,
  "summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "migration_steps_kind_check" CHECK ("kind" IN (
    'contacts', 'products', 'opening_stock', 'opening_trial_balance', 'open_invoices', 'open_bills')),
  CONSTRAINT "migration_steps_status_check" CHECK ("status" IN ('STAGED', 'COMMITTED', 'ROLLED_BACK', 'DISCARDED'))
);

CREATE INDEX IF NOT EXISTS "migration_steps_project"
  ON "migration_steps" ("project_id", "created_at");
CREATE INDEX IF NOT EXISTS "migration_steps_tenant"
  ON "migration_steps" ("tenant_id");

CREATE TABLE IF NOT EXISTS "migration_open_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "project_id" uuid NOT NULL REFERENCES "migration_projects"("id"),
  "step_id" uuid NOT NULL REFERENCES "migration_steps"("id"),
  "side" text NOT NULL,
  "contact_name" text NOT NULL,
  "reference" text NOT NULL,
  "issue_date" date,
  "due_date" date,
  "currency" text NOT NULL,
  "amount" numeric(18, 2) NOT NULL,
  "balance" numeric(18, 2) NOT NULL,
  "matched_contact_id" uuid,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "migration_open_items_side_check" CHECK ("side" IN ('AR', 'AP')),
  CONSTRAINT "migration_open_items_amount_check" CHECK ("amount" >= 0 AND "balance" >= 0 AND "balance" <= "amount")
);

CREATE INDEX IF NOT EXISTS "migration_open_items_project_side"
  ON "migration_open_items" ("project_id", "side");
CREATE INDEX IF NOT EXISTS "migration_open_items_tenant"
  ON "migration_open_items" ("tenant_id");
