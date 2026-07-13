-- P1-004: tenant-scoped notification delivery evidence. Additive only.
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" text PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "recipient" text NOT NULL,
  "channel" text NOT NULL,
  "template" text NOT NULL,
  "locale" text NOT NULL,
  "variables" jsonb NOT NULL,
  "status" text NOT NULL,
  "transmitted" boolean DEFAULT false NOT NULL,
  "provider_message_id" text,
  "dedupe_key" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "notifications_channel_check" CHECK ("channel" IN ('IN_APP', 'EMAIL', 'SMS', 'WHATSAPP')),
  CONSTRAINT "notifications_status_check" CHECK ("status" IN ('accepted', 'sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS "notifications_tenant_time"
  ON "notifications" ("tenant_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_tenant_dedupe"
  ON "notifications" ("tenant_id", "dedupe_key");
