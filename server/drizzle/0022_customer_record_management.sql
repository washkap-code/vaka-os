-- P3-004: additive customer profile, reversible removal evidence and exact
-- owner approval history. Referenced CRM/finance records are never erased.
SET lock_timeout = '5s';
SET statement_timeout = '30s';

ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "address_line_1" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "address_line_2" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "city" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "region" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "postal_code" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "country_code" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "website" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "industry" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "registration_number" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "deleted_by" uuid REFERENCES "users"("id");

CREATE INDEX IF NOT EXISTS "contacts_tenant_active_name"
  ON "contacts" ("tenant_id", "deleted_at", "name");
CREATE INDEX IF NOT EXISTS "contacts_deleted_by" ON "contacts" ("deleted_by");

CREATE TABLE IF NOT EXISTS "record_deletion_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "requested_by" uuid NOT NULL REFERENCES "users"("id"),
  "reason" text NOT NULL,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "decided_by" uuid REFERENCES "users"("id"),
  "decision_reason" text,
  "decided_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "record_deletion_entity_type_check" CHECK ("entity_type" IN ('contact')),
  CONSTRAINT "record_deletion_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "record_deletion_one_pending"
  ON "record_deletion_requests" ("tenant_id", "entity_type", "entity_id")
  WHERE "status" = 'PENDING';
CREATE INDEX IF NOT EXISTS "record_deletion_tenant_status_time"
  ON "record_deletion_requests" ("tenant_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "record_deletion_requester_time"
  ON "record_deletion_requests" ("requested_by", "created_at");
CREATE INDEX IF NOT EXISTS "record_deletion_decider"
  ON "record_deletion_requests" ("decided_by");

-- VAKA uses its verified Express/RBAC boundary rather than the Supabase Data
-- API. Keep the approval table unavailable to browser database roles.
REVOKE ALL ON TABLE "record_deletion_requests" FROM anon, authenticated;
