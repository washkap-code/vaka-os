-- PV-001: verification evidence vault behind the `verify.centre` feature flag.
-- Evidence bytes live in the PD-001 documents workspace; this table registers
-- typed, expiring references with an append-only renewal chain.
-- Additive and idempotent: safe to hand-apply before the code deploys.
-- Empty table + flag OFF everywhere = nothing changes.

CREATE TABLE IF NOT EXISTS "verification_evidence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "document_id" uuid NOT NULL REFERENCES "workspace_documents"("id"),
  "document_version" integer NOT NULL,
  "evidence_type" text NOT NULL,
  "issuer" text NOT NULL,
  "reference_number" text,
  "notes" text,
  "valid_from" date,
  "expires_at" date,
  "status" text DEFAULT 'ACTIVE' NOT NULL,
  "superseded_by" uuid REFERENCES "verification_evidence"("id"),
  "withdrawn_reason" text,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "verification_evidence_type_check" CHECK ("evidence_type" IN
    ('INCORPORATION_CERTIFICATE', 'TAX_CLEARANCE', 'CR14_DIRECTORS',
     'PROOF_OF_ADDRESS', 'DIRECTOR_ID', 'VAT_REGISTRATION',
     'LICENCE', 'INSURANCE', 'OTHER')),
  CONSTRAINT "verification_evidence_status_check" CHECK ("status" IN
    ('ACTIVE', 'SUPERSEDED', 'WITHDRAWN')),
  CONSTRAINT "verification_evidence_version_check" CHECK ("document_version" >= 1),
  CONSTRAINT "verification_evidence_issuer_check" CHECK (length(trim("issuer")) BETWEEN 1 AND 160),
  CONSTRAINT "verification_evidence_reference_check" CHECK ("reference_number" IS NULL OR length("reference_number") <= 80),
  CONSTRAINT "verification_evidence_notes_check" CHECK ("notes" IS NULL OR length("notes") <= 500),
  CONSTRAINT "verification_evidence_validity_check" CHECK (
    "valid_from" IS NULL OR "expires_at" IS NULL OR "expires_at" > "valid_from"),
  CONSTRAINT "verification_evidence_superseded_check" CHECK (
    ("status" = 'SUPERSEDED') = ("superseded_by" IS NOT NULL)),
  CONSTRAINT "verification_evidence_withdrawn_check" CHECK (
    ("status" = 'WITHDRAWN') = ("withdrawn_reason" IS NOT NULL))
);

-- Identity-class evidence is singleton per tenant while ACTIVE; licences,
-- insurance, director IDs and OTHER may hold several ACTIVE rows.
CREATE UNIQUE INDEX IF NOT EXISTS "verification_evidence_singleton_active"
  ON "verification_evidence" ("tenant_id", "evidence_type")
  WHERE "status" = 'ACTIVE' AND "evidence_type" IN
    ('INCORPORATION_CERTIFICATE', 'TAX_CLEARANCE', 'CR14_DIRECTORS',
     'PROOF_OF_ADDRESS', 'VAT_REGISTRATION');

CREATE INDEX IF NOT EXISTS "verification_evidence_tenant_status"
  ON "verification_evidence" ("tenant_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "verification_evidence_tenant_expiry"
  ON "verification_evidence" ("tenant_id", "expires_at");

-- Role backfill (precedent: 0039). Idempotent — unnest+DISTINCT dedupes.
UPDATE "public"."roles"
SET "permissions" = ARRAY(
  SELECT DISTINCT permission
  FROM unnest("permissions" || ARRAY[
    'verify.read',
    'verify.manage'
  ]::text[]) AS permission
)
WHERE "name" IN ('Owner', 'Admin');

UPDATE "public"."roles"
SET "permissions" = ARRAY(
  SELECT DISTINCT permission
  FROM unnest("permissions" || ARRAY[
    'verify.read'
  ]::text[]) AS permission
)
WHERE "name" = 'Accountant';
