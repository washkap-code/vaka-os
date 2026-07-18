-- P1-004: persistent user notification inbox and notification preferences.
-- Additive and idempotent. Existing delivery evidence, templates and provider
-- columns from 0014 remain authoritative for outbound email compatibility.

ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "priority" text DEFAULT 'normal' NOT NULL;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "title" text;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "body" text;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "link" text;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "object_type" text;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "object_id" text;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "read_at" timestamptz;

-- Preserve earlier in-app rows in the new strongly addressed inbox model.
UPDATE "notifications" AS n
SET "user_id" = u."id"
FROM "users" AS u
WHERE n."channel" = 'IN_APP'
  AND n."user_id" IS NULL
  AND n."recipient" = u."id"::text
  AND n."tenant_id" = u."tenant_id";

DO $$
BEGIN
  ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_user_tenant_fk"
    FOREIGN KEY ("user_id", "tenant_id")
    REFERENCES "users"("id", "tenant_id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_channel_check";
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_channel_check"
  CHECK ("channel" IN ('IN_APP', 'EMAIL', 'SMS', 'PUSH', 'WHATSAPP'));

DO $$
BEGIN
  ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_priority_check"
    CHECK ("priority" IN ('low', 'normal', 'high', 'urgent'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "notifications_user_inbox"
  ON "notifications" ("tenant_id", "user_id", "read_at", "created_at");

CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "user_id" uuid NOT NULL,
  "category" text NOT NULL,
  "channel" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  CONSTRAINT "notification_preferences_scope_unique"
    UNIQUE ("tenant_id", "user_id", "category", "channel"),
  CONSTRAINT "notification_preferences_user_tenant_fk"
    FOREIGN KEY ("user_id", "tenant_id")
    REFERENCES "users"("id", "tenant_id") ON DELETE RESTRICT,
  CONSTRAINT "notification_preferences_category_check"
    CHECK (length(trim("category")) > 0),
  CONSTRAINT "notification_preferences_channel_check"
    CHECK ("channel" IN ('IN_APP', 'EMAIL', 'SMS', 'PUSH', 'WHATSAPP'))
);

CREATE INDEX IF NOT EXISTS "notification_preferences_user"
  ON "notification_preferences" ("tenant_id", "user_id");
