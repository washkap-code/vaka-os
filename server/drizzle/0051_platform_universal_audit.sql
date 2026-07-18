-- P1-006: tenant-scoped universal audit ledger and tamper-evident hash chain.
--
-- audit_log is append-only evidence. Runtime roles receive no UPDATE/DELETE
-- grant and the trigger below rejects those statements even when the database
-- owner is used accidentally. Break-glass forensic testing must explicitly
-- disable the trigger and is expected to make /platform/audit/verify fail.

CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "actor_id" uuid,
  "actor_type" text NOT NULL,
  "action" text NOT NULL,
  "object_type" text NOT NULL,
  "object_id" text,
  "before_json" jsonb,
  "after_json" jsonb,
  "source" text NOT NULL,
  "ip" text,
  "occurred_at" timestamptz DEFAULT now() NOT NULL,
  "hash" text NOT NULL,
  "prev_hash" text,
  CONSTRAINT "audit_log_actor_type_check" CHECK ("actor_type" IN ('user', 'system', 'ai')),
  CONSTRAINT "audit_log_user_actor_check" CHECK ("actor_type" <> 'user' OR "actor_id" IS NOT NULL),
  CONSTRAINT "audit_log_action_check" CHECK (length(trim("action")) > 0),
  CONSTRAINT "audit_log_object_type_check" CHECK (length(trim("object_type")) > 0),
  CONSTRAINT "audit_log_source_check" CHECK (length(trim("source")) > 0),
  CONSTRAINT "audit_log_hash_check" CHECK ("hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "audit_log_prev_hash_check" CHECK ("prev_hash" IS NULL OR "prev_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "audit_log_hash_not_self_check" CHECK ("prev_hash" IS NULL OR "prev_hash" <> "hash")
);

CREATE INDEX IF NOT EXISTS "audit_log_tenant_time"
  ON "audit_log" ("tenant_id", "occurred_at", "id");
CREATE INDEX IF NOT EXISTS "audit_log_tenant_object_time"
  ON "audit_log" ("tenant_id", "object_type", "object_id", "occurred_at");
CREATE UNIQUE INDEX IF NOT EXISTS "audit_log_tenant_hash_unique"
  ON "audit_log" ("tenant_id", "hash");
CREATE UNIQUE INDEX IF NOT EXISTS "audit_log_tenant_prev_hash_unique"
  ON "audit_log" ("tenant_id", "prev_hash") WHERE "prev_hash" IS NOT NULL;

CREATE OR REPLACE FUNCTION vaka_audit_record_content(
  p_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_actor_type text,
  p_action text,
  p_object_type text,
  p_object_id text,
  p_before_json jsonb,
  p_after_json jsonb,
  p_source text,
  p_ip text,
  p_occurred_at timestamptz
) RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $function$
  SELECT jsonb_build_object(
    'id', p_id,
    'ip', p_ip,
    'action', p_action,
    'source', p_source,
    'actorId', p_actor_id,
    'afterJson', p_after_json,
    'beforeJson', p_before_json,
    'objectId', p_object_id,
    'tenantId', p_tenant_id,
    'actorType', p_actor_type,
    'objectType', p_object_type,
    'occurredAt', p_occurred_at
  )::text;
$function$;

CREATE OR REPLACE FUNCTION vaka_append_audit_log(
  p_id uuid,
  p_tenant_id uuid,
  p_actor_id uuid,
  p_actor_type text,
  p_action text,
  p_object_type text,
  p_object_id text,
  p_before_json jsonb,
  p_after_json jsonb,
  p_source text,
  p_ip text,
  p_occurred_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql
AS $function$
DECLARE
  v_id uuid := COALESCE(p_id, gen_random_uuid());
  v_occurred_at timestamptz := COALESCE(p_occurred_at, now());
  v_prev_hash text;
  v_hash text;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_type NOT IN ('user', 'system', 'ai')
     OR (p_actor_type = 'user' AND p_actor_id IS NULL)
     OR length(trim(COALESCE(p_action, ''))) = 0
     OR length(trim(COALESCE(p_object_type, ''))) = 0
     OR length(trim(COALESCE(p_source, ''))) = 0 THEN
    RAISE EXCEPTION 'Invalid universal audit record';
  END IF;

  -- One writer per tenant prevents two records from claiming the same parent.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 0));

  SELECT parent."hash"
    INTO v_prev_hash
    FROM "audit_log" parent
   WHERE parent."tenant_id" = p_tenant_id
     AND NOT EXISTS (
       SELECT 1 FROM "audit_log" child
        WHERE child."tenant_id" = parent."tenant_id"
          AND child."prev_hash" = parent."hash"
     )
   ORDER BY parent."occurred_at" DESC, parent."id" DESC
   LIMIT 1;

  v_hash := encode(sha256(convert_to(
    COALESCE(v_prev_hash, '') || vaka_audit_record_content(
      v_id, p_tenant_id, p_actor_id, p_actor_type, p_action, p_object_type,
      p_object_id, p_before_json, p_after_json, p_source, p_ip, v_occurred_at
    ), 'UTF8'
  )), 'hex');

  INSERT INTO "audit_log" (
    "id", "tenant_id", "actor_id", "actor_type", "action", "object_type",
    "object_id", "before_json", "after_json", "source", "ip",
    "occurred_at", "hash", "prev_hash"
  ) VALUES (
    v_id, p_tenant_id, p_actor_id, p_actor_type, p_action, p_object_type,
    p_object_id, p_before_json, p_after_json, p_source, p_ip,
    v_occurred_at, v_hash, v_prev_hash
  );

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION vaka_canonical_audit_object_type(p_entity_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $function$
  SELECT CASE lower(COALESCE(p_entity_type, ''))
    WHEN 'tenant' THEN 'Company'
    WHEN 'company' THEN 'Company'
    WHEN 'contact' THEN 'Customer'
    WHEN 'customer' THEN 'Customer'
    WHEN 'supplier' THEN 'Supplier'
    WHEN 'invoice' THEN 'Invoice'
    WHEN 'payment' THEN 'Payment'
    WHEN 'product' THEN 'Product'
    WHEN 'employee' THEN 'Employee'
    WHEN 'user' THEN 'User'
    ELSE p_entity_type
  END;
$function$;

CREATE OR REPLACE FUNCTION vaka_legacy_audit_source(p_action text, p_entity_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $function$
  SELECT CASE
    WHEN lower(COALESCE(p_entity_type, '')) IN (
      'account', 'accounting_period', 'bank_account', 'bank_reconciliation',
      'bank_transaction', 'expense', 'finance_report_snapshot', 'invoice',
      'journal', 'payment', 'supplier_bill', 'tax_return'
    ) OR COALESCE(p_action, '') ~ '^(accounting|bank_|expense|invoice|inventory\.issue_valued|journal|payment|report\.|supplier_bill|tax\.)'
      THEN 'finance'
    ELSE 'legacy'
  END;
$function$;

-- Backfill the authoritative legacy evidence in deterministic tenant order.
DO $block$
DECLARE
  legacy_row record;
BEGIN
  FOR legacy_row IN
    SELECT legacy.*
      FROM "audit_logs" legacy
     WHERE NOT EXISTS (SELECT 1 FROM "audit_log" universal WHERE universal."id" = legacy."id")
     ORDER BY legacy."tenant_id", legacy."created_at", legacy."id"
  LOOP
    PERFORM vaka_append_audit_log(
      legacy_row."id",
      legacy_row."tenant_id",
      legacy_row."user_id",
      CASE WHEN legacy_row."user_id" IS NULL THEN 'system' ELSE 'user' END,
      legacy_row."action",
      vaka_canonical_audit_object_type(legacy_row."entity_type"),
      legacy_row."entity_id",
      NULL,
      legacy_row."metadata",
      vaka_legacy_audit_source(legacy_row."action", legacy_row."entity_type"),
      NULL,
      legacy_row."created_at"
    );
  END LOOP;
END;
$block$;

CREATE OR REPLACE FUNCTION vaka_mirror_legacy_audit_log()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM vaka_append_audit_log(
    NEW."id",
    NEW."tenant_id",
    NEW."user_id",
    CASE WHEN NEW."user_id" IS NULL THEN 'system' ELSE 'user' END,
    NEW."action",
    vaka_canonical_audit_object_type(NEW."entity_type"),
    NEW."entity_id",
    NULL,
    NEW."metadata",
    vaka_legacy_audit_source(NEW."action", NEW."entity_type"),
    NULL,
    NEW."created_at"
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS "audit_logs_universal_mirror" ON "audit_logs";
CREATE TRIGGER "audit_logs_universal_mirror"
AFTER INSERT ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION vaka_mirror_legacy_audit_log();

CREATE OR REPLACE FUNCTION vaka_prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only; UPDATE and DELETE are prohibited';
END;
$function$;

DROP TRIGGER IF EXISTS "audit_log_append_only" ON "audit_log";
CREATE TRIGGER "audit_log_append_only"
BEFORE UPDATE OR DELETE ON "audit_log"
FOR EACH ROW EXECUTE FUNCTION vaka_prevent_audit_log_mutation();

REVOKE UPDATE, DELETE ON TABLE "audit_log" FROM PUBLIC;

COMMENT ON TABLE "audit_log" IS
  'P1-006 append-only universal audit evidence. UPDATE/DELETE are denied by grant and trigger; verify the per-tenant SHA-256 chain through the platform audit endpoint.';
