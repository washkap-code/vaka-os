-- PD-002: document approvals + retention on the PD-001 workspace.
-- Approvals: second-person rule at the data layer (decider <> requester).
-- Retention: retention_until on workspace_documents — a document under
-- retention cannot be archived until the date passes.
-- Additive and idempotent; empty table + null column change nothing.

ALTER TABLE "workspace_documents"
  ADD COLUMN IF NOT EXISTS "retention_until" date;

CREATE TABLE IF NOT EXISTS "document_approvals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "document_id" uuid NOT NULL REFERENCES "workspace_documents"("id"),
  "version" integer NOT NULL,
  "note" text,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "requested_by" uuid NOT NULL REFERENCES "users"("id"),
  "decided_by" uuid REFERENCES "users"("id"),
  "decision_note" text,
  "decided_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "document_approvals_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED')),
  CONSTRAINT "document_approvals_version_check" CHECK ("version" >= 1),
  CONSTRAINT "document_approvals_sod_check" CHECK ("decided_by" IS NULL OR "decided_by" <> "requested_by"),
  CONSTRAINT "document_approvals_decided_check" CHECK (
    ("status" = 'PENDING' AND "decided_by" IS NULL AND "decided_at" IS NULL)
    OR ("status" <> 'PENDING' AND "decided_by" IS NOT NULL AND "decided_at" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "document_approvals_one_pending"
  ON "document_approvals" ("document_id") WHERE "status" = 'PENDING';
CREATE INDEX IF NOT EXISTS "document_approvals_tenant_status"
  ON "document_approvals" ("tenant_id", "status", "created_at");
