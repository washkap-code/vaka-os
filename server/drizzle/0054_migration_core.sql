-- P15-001: registry-driven, staged, reversible CSV imports for canonical
-- Customer, Supplier and Product master data. This is additive and leaves the
-- existing PM-001/PM-002 migration project and finance-opening paths intact.

CREATE TABLE IF NOT EXISTS "migration_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "object_type" text NOT NULL,
  "source_filename" text NOT NULL,
  "status" text DEFAULT 'uploaded' NOT NULL,
  "duplicate_policy" text DEFAULT 'skip' NOT NULL,
  "total_rows" integer DEFAULT 0 NOT NULL,
  "valid_rows" integer DEFAULT 0 NOT NULL,
  "error_rows" integer DEFAULT 0 NOT NULL,
  "imported_rows" integer DEFAULT 0 NOT NULL,
  "mapping_json" jsonb,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "completed_at" timestamptz,
  CONSTRAINT "migration_jobs_object_type_check" CHECK ("object_type" IN ('Customer', 'Supplier', 'Product')),
  CONSTRAINT "migration_jobs_status_check" CHECK ("status" IN
    ('uploaded', 'mapped', 'validated', 'importing', 'completed', 'failed', 'rolled_back')),
  CONSTRAINT "migration_jobs_duplicate_policy_check" CHECK ("duplicate_policy" IN ('skip', 'update-existing', 'create-anyway')),
  CONSTRAINT "migration_jobs_filename_check" CHECK (length(trim("source_filename")) BETWEEN 1 AND 255),
  CONSTRAINT "migration_jobs_counts_check" CHECK (
    "total_rows" >= 0 AND "valid_rows" >= 0 AND "error_rows" >= 0 AND "imported_rows" >= 0
    AND "valid_rows" <= "total_rows" AND "error_rows" <= "total_rows"
    AND "imported_rows" <= "total_rows")
);

CREATE INDEX IF NOT EXISTS "migration_jobs_tenant_time"
  ON "migration_jobs" ("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "migration_jobs_tenant_status"
  ON "migration_jobs" ("tenant_id", "status", "created_at");

CREATE TABLE IF NOT EXISTS "migration_rows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "job_id" uuid NOT NULL REFERENCES "migration_jobs"("id") ON DELETE CASCADE,
  "row_number" integer NOT NULL,
  "raw_json" jsonb NOT NULL,
  "mapped_json" jsonb,
  "status" text DEFAULT 'pending' NOT NULL,
  "errors_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_record_id" uuid,
  "matched_record_id" uuid,
  "import_operation" text,
  "before_json" jsonb,
  "after_json" jsonb,
  CONSTRAINT "migration_rows_job_row_unique" UNIQUE ("job_id", "row_number"),
  CONSTRAINT "migration_rows_row_number_check" CHECK ("row_number" >= 2),
  CONSTRAINT "migration_rows_status_check" CHECK ("status" IN ('pending', 'valid', 'error', 'imported', 'skipped')),
  CONSTRAINT "migration_rows_operation_check" CHECK ("import_operation" IS NULL OR "import_operation" IN ('created', 'updated')),
  CONSTRAINT "migration_rows_import_evidence_check" CHECK (
    ("status" <> 'imported') OR
    ("created_record_id" IS NOT NULL AND "import_operation" IS NOT NULL AND "after_json" IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS "migration_rows_job_status"
  ON "migration_rows" ("job_id", "status", "row_number");

-- Preserve one universal-audit record per changed canonical object without a
-- network round trip per CSV row. The tenant lock and explicit loop maintain
-- exactly the same hash-chain contract as vaka_append_audit_log().
CREATE OR REPLACE FUNCTION vaka_append_migration_audit_batch(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_ip text,
  p_records jsonb
) RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
  v_record jsonb;
  v_id uuid;
  v_occurred_at timestamptz;
  v_prev_hash text;
  v_hash text;
  v_count integer := 0;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_id IS NULL OR jsonb_typeof(p_records) <> 'array' THEN
    RAISE EXCEPTION 'Invalid migration audit batch';
  END IF;

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

  FOR v_record IN
    SELECT item.value
      FROM jsonb_array_elements(p_records) WITH ORDINALITY AS item(value, position)
     ORDER BY item.position
  LOOP
    IF length(trim(COALESCE(v_record->>'action', ''))) = 0
       OR length(trim(COALESCE(v_record->>'objectType', ''))) = 0
       OR length(trim(COALESCE(v_record->>'objectId', ''))) = 0
       OR length(trim(COALESCE(v_record->>'source', ''))) = 0 THEN
      RAISE EXCEPTION 'Invalid migration audit record';
    END IF;
    v_id := gen_random_uuid();
    v_occurred_at := COALESCE((v_record->>'occurredAt')::timestamptz, now());
    v_hash := encode(sha256(convert_to(
      COALESCE(v_prev_hash, '') || vaka_audit_record_content(
        v_id, p_tenant_id, p_actor_id, 'user', v_record->>'action',
        v_record->>'objectType', v_record->>'objectId',
        NULLIF(v_record->'beforeJson', 'null'::jsonb),
        NULLIF(v_record->'afterJson', 'null'::jsonb),
        v_record->>'source', p_ip, v_occurred_at
      ), 'UTF8'
    )), 'hex');
    INSERT INTO "audit_log" (
      "id", "tenant_id", "actor_id", "actor_type", "action", "object_type",
      "object_id", "before_json", "after_json", "source", "ip",
      "occurred_at", "hash", "prev_hash"
    ) VALUES (
      v_id, p_tenant_id, p_actor_id, 'user', v_record->>'action',
      v_record->>'objectType', v_record->>'objectId',
      NULLIF(v_record->'beforeJson', 'null'::jsonb),
      NULLIF(v_record->'afterJson', 'null'::jsonb),
      v_record->>'source', p_ip, v_occurred_at, v_hash, v_prev_hash
    );
    v_prev_hash := v_hash;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

-- Generic dependency discovery keeps rollback fail-closed as new foreign keys
-- are added to contacts/products. Only direct single-column references to the
-- canonical id are reported; a non-empty result blocks the whole rollback.
CREATE OR REPLACE FUNCTION vaka_migration_record_dependencies(
  p_target_table regclass,
  p_record_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  fk record;
  dependent_count bigint;
  reasons jsonb := '[]'::jsonb;
BEGIN
  FOR fk IN
    SELECT child_ns.nspname AS schema_name,
           child.relname AS table_name,
           child_column.attname AS column_name
      FROM pg_constraint constraint_record
      JOIN pg_class parent ON parent.oid = constraint_record.confrelid
      JOIN pg_class child ON child.oid = constraint_record.conrelid
      JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
      JOIN LATERAL unnest(constraint_record.conkey) WITH ORDINALITY child_key(attnum, position) ON true
      JOIN LATERAL unnest(constraint_record.confkey) WITH ORDINALITY parent_key(attnum, position)
        ON parent_key.position = child_key.position
      JOIN pg_attribute parent_column
        ON parent_column.attrelid = parent.oid AND parent_column.attnum = parent_key.attnum
      JOIN pg_attribute child_column
        ON child_column.attrelid = child.oid AND child_column.attnum = child_key.attnum
     WHERE constraint_record.contype = 'f'
       AND constraint_record.confrelid = p_target_table
       AND parent_column.attname = 'id'
       AND array_length(constraint_record.conkey, 1) = 1
  LOOP
    EXECUTE format('SELECT count(*) FROM %I.%I WHERE %I = $1',
      fk.schema_name, fk.table_name, fk.column_name)
      INTO dependent_count USING p_record_id;
    IF dependent_count > 0 THEN
      reasons := reasons || jsonb_build_array(jsonb_build_object(
        'table', fk.table_name,
        'count', dependent_count
      ));
    END IF;
  END LOOP;
  RETURN reasons;
END;
$function$;

UPDATE "roles"
SET "permissions" = array_append("permissions", 'migration:run')
WHERE "name" IN ('Owner', 'Admin')
  AND NOT ('migration:run' = ANY("permissions"));
