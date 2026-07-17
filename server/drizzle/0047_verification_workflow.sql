-- PV-002: reasoned business-verification workflow and immutable VERIFIED badge
-- issue evidence. Tenant surfaces remain dark behind `verify.centre`; platform
-- review is separately permission- and step-up-protected. Empty tables and a
-- permission backfill change no tenant behaviour. Additive and idempotent.

-- Composite uniqueness supports tenant-consistent foreign keys in the frozen
-- submission snapshot without replacing the existing primary keys.
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_documents_id_tenant_unique"
  ON "workspace_documents" ("id", "tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_document_versions_doc_version_tenant_unique"
  ON "workspace_document_versions" ("document_id", "version", "tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "verification_evidence_id_tenant_unique"
  ON "verification_evidence" ("id", "tenant_id");

CREATE TABLE IF NOT EXISTS "verification_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "status" text NOT NULL DEFAULT 'DRAFT',
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "submitted_by" uuid REFERENCES "users"("id"),
  "submitted_at" timestamptz,
  "in_review_by" uuid REFERENCES "users"("id"),
  "in_review_at" timestamptz,
  "sod_actor_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "verification_requests_id_tenant_unique" UNIQUE ("id", "tenant_id"),
  CONSTRAINT "verification_requests_status_check" CHECK (
    "status" IN ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'REVOKED')
  ),
  CONSTRAINT "verification_requests_sod_actors_check" CHECK (
    jsonb_typeof("sod_actor_ids") = 'array'
  ),
  CONSTRAINT "verification_requests_lifecycle_check" CHECK (
    ("status" = 'DRAFT'
      AND "submitted_by" IS NULL AND "submitted_at" IS NULL
      AND "in_review_by" IS NULL AND "in_review_at" IS NULL)
    OR ("status" = 'SUBMITTED'
      AND "submitted_by" IS NOT NULL AND "submitted_at" IS NOT NULL
      AND "in_review_by" IS NULL AND "in_review_at" IS NULL)
    OR ("status" IN ('IN_REVIEW', 'APPROVED', 'REJECTED', 'REVOKED')
      AND "submitted_by" IS NOT NULL AND "submitted_at" IS NOT NULL
      AND "in_review_by" IS NOT NULL AND "in_review_at" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "verification_requests_one_open_per_tenant"
  ON "verification_requests" ("tenant_id")
  WHERE "status" IN ('DRAFT', 'SUBMITTED', 'IN_REVIEW');
CREATE INDEX IF NOT EXISTS "verification_requests_tenant_time"
  ON "verification_requests" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "verification_requests_queue"
  ON "verification_requests" ("status", "submitted_at" ASC)
  WHERE "status" IN ('SUBMITTED', 'IN_REVIEW');

CREATE TABLE IF NOT EXISTS "verification_request_evidence_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "request_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "evidence_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "document_version" integer NOT NULL,
  "evidence_type" text NOT NULL,
  "issuer" text NOT NULL,
  "reference_number" text,
  "valid_from" date,
  "expires_at" date,
  "file_name" text NOT NULL,
  "media_type" text NOT NULL,
  "byte_size" integer NOT NULL,
  "checksum" text NOT NULL,
  "captured_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "verification_snapshot_request_tenant_fk" FOREIGN KEY ("request_id", "tenant_id")
    REFERENCES "verification_requests"("id", "tenant_id") ON DELETE RESTRICT,
  CONSTRAINT "verification_snapshot_evidence_tenant_fk" FOREIGN KEY ("evidence_id", "tenant_id")
    REFERENCES "verification_evidence"("id", "tenant_id") ON DELETE RESTRICT,
  CONSTRAINT "verification_snapshot_document_tenant_fk" FOREIGN KEY ("document_id", "tenant_id")
    REFERENCES "workspace_documents"("id", "tenant_id") ON DELETE RESTRICT,
  CONSTRAINT "verification_snapshot_version_tenant_fk" FOREIGN KEY ("document_id", "document_version", "tenant_id")
    REFERENCES "workspace_document_versions"("document_id", "version", "tenant_id") ON DELETE RESTRICT,
  CONSTRAINT "verification_snapshot_request_evidence_unique" UNIQUE ("request_id", "evidence_id"),
  CONSTRAINT "verification_snapshot_version_check" CHECK ("document_version" >= 1),
  CONSTRAINT "verification_snapshot_type_check" CHECK ("evidence_type" IN
    ('INCORPORATION_CERTIFICATE', 'TAX_CLEARANCE', 'CR14_DIRECTORS',
     'PROOF_OF_ADDRESS', 'DIRECTOR_ID', 'VAT_REGISTRATION',
     'LICENCE', 'INSURANCE', 'OTHER')),
  CONSTRAINT "verification_snapshot_issuer_check" CHECK (length(trim("issuer")) BETWEEN 1 AND 160),
  CONSTRAINT "verification_snapshot_reference_check" CHECK ("reference_number" IS NULL OR length("reference_number") <= 80),
  CONSTRAINT "verification_snapshot_validity_check" CHECK (
    "valid_from" IS NULL OR "expires_at" IS NULL OR "expires_at" > "valid_from"
  ),
  CONSTRAINT "verification_snapshot_size_check" CHECK ("byte_size" > 0 AND "byte_size" <= 1500000)
);

CREATE INDEX IF NOT EXISTS "verification_snapshot_tenant_request"
  ON "verification_request_evidence_snapshots" ("tenant_id", "request_id", "captured_at");

CREATE TABLE IF NOT EXISTS "verification_decisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "request_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "decision" text NOT NULL,
  "reason" text NOT NULL,
  "decided_by" uuid NOT NULL REFERENCES "users"("id"),
  "sod_evaluation" jsonb NOT NULL,
  "decided_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "verification_decisions_request_tenant_fk" FOREIGN KEY ("request_id", "tenant_id")
    REFERENCES "verification_requests"("id", "tenant_id") ON DELETE RESTRICT,
  CONSTRAINT "verification_decisions_decision_check" CHECK ("decision" IN ('APPROVE', 'REJECT', 'REVOKE')),
  CONSTRAINT "verification_decisions_reason_check" CHECK (length(trim("reason")) BETWEEN 3 AND 1000),
  CONSTRAINT "verification_decisions_sod_check" CHECK (jsonb_typeof("sod_evaluation") = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS "verification_decisions_terminal_once"
  ON "verification_decisions" ("request_id")
  WHERE "decision" IN ('APPROVE', 'REJECT');
CREATE UNIQUE INDEX IF NOT EXISTS "verification_decisions_revoke_once"
  ON "verification_decisions" ("request_id") WHERE "decision" = 'REVOKE';
CREATE INDEX IF NOT EXISTS "verification_decisions_tenant_request"
  ON "verification_decisions" ("tenant_id", "request_id", "decided_at");

CREATE TABLE IF NOT EXISTS "verification_badges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "request_id" uuid NOT NULL,
  "approval_decision_id" uuid NOT NULL REFERENCES "verification_decisions"("id") ON DELETE RESTRICT,
  "level" text NOT NULL DEFAULT 'VERIFIED',
  "issued_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" date NOT NULL,
  "issued_by" uuid NOT NULL REFERENCES "users"("id"),
  "evidence_snapshot_ref" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "verification_badges_request_tenant_fk" FOREIGN KEY ("request_id", "tenant_id")
    REFERENCES "verification_requests"("id", "tenant_id") ON DELETE RESTRICT,
  CONSTRAINT "verification_badges_snapshot_ref_fk" FOREIGN KEY ("evidence_snapshot_ref", "tenant_id")
    REFERENCES "verification_requests"("id", "tenant_id") ON DELETE RESTRICT,
  CONSTRAINT "verification_badges_request_unique" UNIQUE ("request_id"),
  CONSTRAINT "verification_badges_approval_unique" UNIQUE ("approval_decision_id"),
  CONSTRAINT "verification_badges_level_check" CHECK ("level" = 'VERIFIED'),
  CONSTRAINT "verification_badges_snapshot_ref_check" CHECK ("evidence_snapshot_ref" = "request_id"),
  CONSTRAINT "verification_badges_expiry_check" CHECK ("expires_at" > "issued_at"::date)
);

CREATE INDEX IF NOT EXISTS "verification_badges_tenant_time"
  ON "verification_badges" ("tenant_id", "issued_at" DESC);

-- Requests are mutable only through the declared state machine. Submission
-- and review context become frozen as soon as their transitions occur.
CREATE OR REPLACE FUNCTION vaka_enforce_verification_request_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id"
     OR NEW."created_by" IS DISTINCT FROM OLD."created_by"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'verification request identity is immutable';
  END IF;

  IF OLD."submitted_at" IS NOT NULL AND (
    NEW."submitted_at" IS DISTINCT FROM OLD."submitted_at"
    OR NEW."submitted_by" IS DISTINCT FROM OLD."submitted_by"
    OR NEW."sod_actor_ids" IS DISTINCT FROM OLD."sod_actor_ids"
  ) THEN
    RAISE EXCEPTION 'verification submission context is immutable';
  END IF;

  IF OLD."in_review_at" IS NOT NULL AND (
    NEW."in_review_at" IS DISTINCT FROM OLD."in_review_at"
    OR NEW."in_review_by" IS DISTINCT FROM OLD."in_review_by"
  ) THEN
    RAISE EXCEPTION 'verification review context is immutable';
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" = 'SUBMITTED')
    OR (OLD."status" = 'SUBMITTED' AND NEW."status" = 'IN_REVIEW')
    OR (OLD."status" = 'IN_REVIEW' AND NEW."status" IN ('APPROVED', 'REJECTED'))
    OR (OLD."status" = 'APPROVED' AND NEW."status" = 'REVOKED')
  ) THEN
    RAISE EXCEPTION 'invalid verification request transition: % to %', OLD."status", NEW."status";
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "verification_requests_state_machine" ON "verification_requests";
CREATE TRIGGER "verification_requests_state_machine"
BEFORE UPDATE ON "verification_requests"
FOR EACH ROW EXECUTE FUNCTION vaka_enforce_verification_request_transition();

-- Submission snapshots, decisions and badge issue records are append-only.
CREATE OR REPLACE FUNCTION vaka_reject_verification_history_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'verification history is append-only';
END;
$$;

DROP TRIGGER IF EXISTS "verification_snapshots_append_only" ON "verification_request_evidence_snapshots";
CREATE TRIGGER "verification_snapshots_append_only"
BEFORE UPDATE OR DELETE ON "verification_request_evidence_snapshots"
FOR EACH ROW EXECUTE FUNCTION vaka_reject_verification_history_mutation();

DROP TRIGGER IF EXISTS "verification_decisions_append_only" ON "verification_decisions";
CREATE TRIGGER "verification_decisions_append_only"
BEFORE UPDATE OR DELETE ON "verification_decisions"
FOR EACH ROW EXECUTE FUNCTION vaka_reject_verification_history_mutation();

DROP TRIGGER IF EXISTS "verification_badges_append_only" ON "verification_badges";
CREATE TRIGGER "verification_badges_append_only"
BEFORE UPDATE OR DELETE ON "verification_badges"
FOR EACH ROW EXECUTE FUNCTION vaka_reject_verification_history_mutation();

-- Closed platform-role catalogue backfill. Idempotent JSONB membership check.
UPDATE "platform_roles"
SET "permissions" = "permissions" || '["platform.verification.review"]'::jsonb
WHERE "key" IN ('PRINCIPAL_ADMIN', 'OPERATIONS_ADMIN')
  AND NOT ("permissions" ? 'platform.verification.review');

