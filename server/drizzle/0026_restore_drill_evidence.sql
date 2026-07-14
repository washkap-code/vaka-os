CREATE TABLE IF NOT EXISTS "platform_restore_drills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "drill_id" text NOT NULL,
  "backup_manifest_id" uuid NOT NULL REFERENCES "platform_backup_manifests"("id") ON DELETE RESTRICT,
  "environment" text NOT NULL,
  "scenario" text NOT NULL,
  "isolated_target_ref" text NOT NULL,
  "started_at" timestamptz NOT NULL,
  "completed_at" timestamptz NOT NULL,
  "target_recovery_point_at" timestamptz NOT NULL,
  "recovered_through_at" timestamptz NOT NULL,
  "target_rpo_minutes" integer NOT NULL,
  "target_rto_minutes" integer NOT NULL,
  "achieved_rpo_minutes" integer NOT NULL,
  "achieved_rto_minutes" integer NOT NULL,
  "outcome" text NOT NULL,
  "checksum_verified" boolean NOT NULL,
  "schema_verified" boolean NOT NULL,
  "tenant_isolation_verified" boolean NOT NULL,
  "audit_continuity_verified" boolean NOT NULL,
  "ledger_balance_verified" boolean NOT NULL,
  "object_recovery_verified" boolean,
  "verification_summary" text NOT NULL,
  "failure_reason" text,
  "operator" text NOT NULL,
  "recorded_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "platform_restore_drill_scenario_check"
    CHECK ("scenario" IN ('FULL_DATABASE', 'POINT_IN_TIME', 'DATABASE_AND_OBJECTS')),
  CONSTRAINT "platform_restore_drill_outcome_check"
    CHECK ("outcome" IN ('SUCCEEDED', 'PARTIAL', 'FAILED')),
  CONSTRAINT "platform_restore_drill_time_check" CHECK ("completed_at" > "started_at"),
  CONSTRAINT "platform_restore_drill_recovery_time_check"
    CHECK ("target_recovery_point_at" <= "completed_at" AND "recovered_through_at" <= "completed_at"),
  CONSTRAINT "platform_restore_drill_target_bounds_check"
    CHECK ("target_rpo_minutes" BETWEEN 1 AND 43200 AND "target_rto_minutes" BETWEEN 1 AND 10080),
  CONSTRAINT "platform_restore_drill_achieved_bounds_check"
    CHECK ("achieved_rpo_minutes" BETWEEN 0 AND 525600 AND "achieved_rto_minutes" BETWEEN 1 AND 10080),
  CONSTRAINT "platform_restore_drill_failure_reason_check"
    CHECK ("outcome" = 'SUCCEEDED' OR "failure_reason" IS NOT NULL),
  CONSTRAINT "platform_restore_drill_success_checks_check" CHECK (
    "outcome" <> 'SUCCEEDED' OR (
      "checksum_verified" AND "schema_verified" AND "tenant_isolation_verified"
      AND "audit_continuity_verified" AND "ledger_balance_verified"
      AND ("scenario" <> 'DATABASE_AND_OBJECTS' OR "object_recovery_verified" = true)
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "platform_restore_drill_id"
  ON "platform_restore_drills" ("drill_id");
CREATE INDEX IF NOT EXISTS "platform_restore_drill_time"
  ON "platform_restore_drills" ("completed_at");
CREATE INDEX IF NOT EXISTS "platform_restore_drill_manifest"
  ON "platform_restore_drills" ("backup_manifest_id");

CREATE TABLE IF NOT EXISTS "platform_restore_drill_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "restore_drill_id" uuid NOT NULL REFERENCES "platform_restore_drills"("id") ON DELETE RESTRICT,
  "decision" text NOT NULL,
  "reason" text NOT NULL,
  "reviewed_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "platform_restore_drill_review_decision_check"
    CHECK ("decision" IN ('ACCEPTED', 'REJECTED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "platform_restore_drill_review_once"
  ON "platform_restore_drill_reviews" ("restore_drill_id");
CREATE INDEX IF NOT EXISTS "platform_restore_drill_review_time"
  ON "platform_restore_drill_reviews" ("created_at");

CREATE OR REPLACE FUNCTION vaka_reject_restore_evidence_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Restore drill and review evidence is append-only';
END;
$$;

DROP TRIGGER IF EXISTS platform_restore_drills_append_only ON "platform_restore_drills";
CREATE TRIGGER platform_restore_drills_append_only
BEFORE UPDATE OR DELETE ON "platform_restore_drills"
FOR EACH ROW EXECUTE FUNCTION vaka_reject_restore_evidence_mutation();

DROP TRIGGER IF EXISTS platform_restore_drill_reviews_append_only ON "platform_restore_drill_reviews";
CREATE TRIGGER platform_restore_drill_reviews_append_only
BEFORE UPDATE OR DELETE ON "platform_restore_drill_reviews"
FOR EACH ROW EXECUTE FUNCTION vaka_reject_restore_evidence_mutation();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "platform_restore_drills", "platform_restore_drill_reviews" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "platform_restore_drills", "platform_restore_drill_reviews" FROM authenticated;
  END IF;
END $$;
