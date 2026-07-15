-- PW-003: tenant task centre + opt-in event automation. Tasks are
-- operational work items only (no financial writes). No automation_rules row
-- = rule disabled, so empty tables change nothing. Additive and idempotent:
-- safe to hand-apply to production before the code deploys.

CREATE TABLE IF NOT EXISTS "tenant_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "title" text NOT NULL,
  "detail" text,
  "status" text DEFAULT 'OPEN' NOT NULL,
  "source_type" text NOT NULL,
  "source_key" text,
  "subject_type" text,
  "subject_id" uuid,
  "assigned_to" uuid REFERENCES "users"("id"),
  "created_by" uuid REFERENCES "users"("id"),
  "closed_by" uuid REFERENCES "users"("id"),
  "closed_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "tenant_tasks_status_check" CHECK ("status" IN ('OPEN', 'DONE', 'DISMISSED')),
  CONSTRAINT "tenant_tasks_source_check" CHECK ("source_type" IN ('automation', 'manual')),
  CONSTRAINT "tenant_tasks_closed_state_check" CHECK (
    ("status" = 'OPEN' AND "closed_at" IS NULL AND "closed_by" IS NULL)
    OR ("status" IN ('DONE', 'DISMISSED') AND "closed_at" IS NOT NULL AND "closed_by" IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS "tenant_tasks_tenant_status"
  ON "tenant_tasks" ("tenant_id", "status", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_tasks_open_automation_dedupe"
  ON "tenant_tasks" ("tenant_id", "source_key", "subject_id")
  WHERE "status" = 'OPEN' AND "source_key" IS NOT NULL AND "subject_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "automation_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "rule_key" text NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "updated_by" uuid REFERENCES "users"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "automation_rules_tenant_key"
  ON "automation_rules" ("tenant_id", "rule_key");
