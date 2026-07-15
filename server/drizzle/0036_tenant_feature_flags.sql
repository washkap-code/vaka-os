-- FLAG-001: tenant feature flags (build-dark model, Master Build Plan Part II).
-- A missing row means OFF, so an empty table changes nothing. Additive and
-- idempotent: safe to hand-apply to production before the code deploys.

CREATE TABLE IF NOT EXISTS "tenant_feature_flags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "feature_key" text NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "note" text,
  "updated_by" uuid REFERENCES "users"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_feature_flags_tenant_key"
  ON "tenant_feature_flags" ("tenant_id", "feature_key");
CREATE INDEX IF NOT EXISTS "tenant_feature_flags_tenant"
  ON "tenant_feature_flags" ("tenant_id");
