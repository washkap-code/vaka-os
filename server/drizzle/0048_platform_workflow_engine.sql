-- P1-003: durable tenant-scoped workflow engine and invoice-issue approval
-- definition. Additive and idempotent; no existing finance table is changed.

CREATE TABLE IF NOT EXISTS "workflow_definitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "name" text NOT NULL,
  "version" integer NOT NULL,
  "object_type" text NOT NULL,
  "steps_json" jsonb NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  CONSTRAINT "workflow_definitions_id_tenant_unique" UNIQUE ("id", "tenant_id"),
  CONSTRAINT "workflow_definitions_tenant_name_version_unique" UNIQUE ("tenant_id", "name", "version"),
  CONSTRAINT "workflow_definitions_name_check" CHECK (length(trim("name")) > 0),
  CONSTRAINT "workflow_definitions_version_check" CHECK ("version" >= 1),
  CONSTRAINT "workflow_definitions_object_type_check" CHECK (length(trim("object_type")) > 0),
  CONSTRAINT "workflow_definitions_steps_check" CHECK (jsonb_typeof("steps_json") = 'array')
);

CREATE INDEX IF NOT EXISTS "workflow_definitions_tenant_object_active"
  ON "workflow_definitions" ("tenant_id", "object_type", "active");

CREATE TABLE IF NOT EXISTS "workflow_instances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "definition_id" uuid NOT NULL,
  "object_type" text NOT NULL,
  "object_id" text NOT NULL,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "current_step" integer NOT NULL DEFAULT 0,
  "started_by" uuid NOT NULL,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz,
  CONSTRAINT "workflow_instances_id_tenant_unique" UNIQUE ("id", "tenant_id"),
  CONSTRAINT "workflow_instances_definition_tenant_fk"
    FOREIGN KEY ("definition_id", "tenant_id")
    REFERENCES "workflow_definitions"("id", "tenant_id") ON DELETE RESTRICT,
  CONSTRAINT "workflow_instances_actor_tenant_fk"
    FOREIGN KEY ("started_by", "tenant_id")
    REFERENCES "users"("id", "tenant_id") ON DELETE RESTRICT,
  CONSTRAINT "workflow_instances_object_type_check" CHECK (length(trim("object_type")) > 0),
  CONSTRAINT "workflow_instances_object_id_check" CHECK (length(trim("object_id")) > 0),
  CONSTRAINT "workflow_instances_status_check" CHECK ("status" IN ('ACTIVE', 'COMPLETED', 'REJECTED')),
  CONSTRAINT "workflow_instances_current_step_check" CHECK ("current_step" >= 0),
  CONSTRAINT "workflow_instances_completion_check" CHECK (
    ("status" = 'ACTIVE' AND "completed_at" IS NULL)
    OR ("status" IN ('COMPLETED', 'REJECTED') AND "completed_at" IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS "workflow_instances_tenant_object"
  ON "workflow_instances" ("tenant_id", "object_type", "object_id");
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_instances_one_active_object"
  ON "workflow_instances" ("tenant_id", "definition_id", "object_type", "object_id")
  WHERE "status" = 'ACTIVE';

CREATE TABLE IF NOT EXISTS "workflow_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "instance_id" uuid NOT NULL REFERENCES "workflow_instances"("id") ON DELETE RESTRICT,
  "step" integer NOT NULL,
  "actor_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "action" text NOT NULL,
  "comment" text,
  "acted_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "workflow_actions_step_check" CHECK ("step" >= 0),
  CONSTRAINT "workflow_actions_action_check" CHECK ("action" IN ('APPROVE', 'REJECT')),
  CONSTRAINT "workflow_actions_comment_check" CHECK ("comment" IS NULL OR length("comment") <= 1000)
);

CREATE UNIQUE INDEX IF NOT EXISTS "workflow_actions_instance_step_unique"
  ON "workflow_actions" ("instance_id", "step");
CREATE INDEX IF NOT EXISTS "workflow_actions_instance_time"
  ON "workflow_actions" ("instance_id", "acted_at");

-- Seed the current one-step invoice approval rule for every existing tenant.
-- Future tenants are seeded lazily by WorkflowService on first invoice issue.
INSERT INTO "workflow_definitions"
  ("tenant_id", "name", "version", "object_type", "steps_json", "active")
SELECT
  "id",
  'invoice.issue.approval',
  1,
  'Invoice',
  '[{"name":"authorise-issue","approver":{"type":"role","role":"Accounting poster","permission":"accounting.post"}}]'::jsonb,
  true
FROM "tenants"
ON CONFLICT ("tenant_id", "name", "version") DO NOTHING;
