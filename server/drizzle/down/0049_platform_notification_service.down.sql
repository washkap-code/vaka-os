-- P1-004 rollback. Use only before dependent code is deployed and after
-- confirming no notification preference or inbox-state evidence must remain.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "notifications" WHERE "channel" = 'PUSH') THEN
    RAISE EXCEPTION 'Cannot roll back 0049 while PUSH notification evidence exists';
  END IF;
END $$;

DROP TABLE IF EXISTS "notification_preferences";
DROP INDEX IF EXISTS "notifications_user_inbox";
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_user_tenant_fk";
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_priority_check";
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_channel_check";
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_channel_check"
  CHECK ("channel" IN ('IN_APP', 'EMAIL', 'SMS', 'WHATSAPP'));
ALTER TABLE "notifications" DROP COLUMN IF EXISTS "read_at";
ALTER TABLE "notifications" DROP COLUMN IF EXISTS "object_id";
ALTER TABLE "notifications" DROP COLUMN IF EXISTS "object_type";
ALTER TABLE "notifications" DROP COLUMN IF EXISTS "link";
ALTER TABLE "notifications" DROP COLUMN IF EXISTS "body";
ALTER TABLE "notifications" DROP COLUMN IF EXISTS "title";
ALTER TABLE "notifications" DROP COLUMN IF EXISTS "priority";
ALTER TABLE "notifications" DROP COLUMN IF EXISTS "user_id";
