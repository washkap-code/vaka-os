CREATE TABLE IF NOT EXISTS "platform_backup_manifests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "manifest_id" text NOT NULL,
  "contract_version" text NOT NULL,
  "environment" text NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "completed_at" timestamp with time zone NOT NULL,
  "status" text NOT NULL,
  "database_snapshot_ref" text NOT NULL,
  "object_snapshot_ref" text,
  "checksum" text NOT NULL,
  "encryption_ref" text NOT NULL,
  "retention_expires_at" timestamp with time zone NOT NULL,
  "operator" text NOT NULL,
  "failure_reason" text,
  "recorded_by" uuid REFERENCES "users"("id"),
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "platform_backup_manifest_id"
  ON "platform_backup_manifests" ("manifest_id");
CREATE INDEX IF NOT EXISTS "platform_backup_manifest_time"
  ON "platform_backup_manifests" ("completed_at");
CREATE INDEX IF NOT EXISTS "platform_backup_manifest_status"
  ON "platform_backup_manifests" ("status", "completed_at");
