-- P1-006 rollback. Derived legacy mirrors can be rebuilt. Refuse to discard
-- canonical auto-audit evidence that has no authoritative predecessor.
DO $block$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "audit_log"
     WHERE "source" NOT IN ('legacy', 'finance')
     LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Cannot roll back 0051 while non-derived universal audit evidence exists';
  END IF;
END;
$block$;

DROP TRIGGER IF EXISTS "audit_logs_universal_mirror" ON "audit_logs";
DROP FUNCTION IF EXISTS vaka_mirror_legacy_audit_log();

DROP TRIGGER IF EXISTS "audit_log_append_only" ON "audit_log";
DROP FUNCTION IF EXISTS vaka_prevent_audit_log_mutation();

DROP TABLE IF EXISTS "audit_log";
DROP FUNCTION IF EXISTS vaka_legacy_audit_source(text, text);
DROP FUNCTION IF EXISTS vaka_canonical_audit_object_type(text);
DROP FUNCTION IF EXISTS vaka_append_audit_log(uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, text, text, timestamptz);
DROP FUNCTION IF EXISTS vaka_audit_record_content(uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, text, text, timestamptz);

