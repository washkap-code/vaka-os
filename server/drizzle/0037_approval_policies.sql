-- PW-002: tenant-configurable approval policies (thresholds, extra
-- permission, second-person rule) for purchase orders and payroll runs.
-- No row = no additional rule, so an empty table changes nothing. Additive
-- and idempotent: safe to hand-apply to production before the code deploys.

CREATE TABLE IF NOT EXISTS "approval_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "subject_type" text NOT NULL,
  "threshold_amount" numeric(14,2) DEFAULT 0 NOT NULL,
  "required_permission" text,
  "require_distinct_actor" boolean DEFAULT false NOT NULL,
  "updated_by" uuid REFERENCES "users"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "approval_policies_subject_check"
    CHECK ("subject_type" IN ('purchase_order', 'payroll_run')),
  CONSTRAINT "approval_policies_threshold_check" CHECK ("threshold_amount" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "approval_policies_tenant_subject"
  ON "approval_policies" ("tenant_id", "subject_type");
