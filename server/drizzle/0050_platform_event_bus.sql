-- P1-005: persist-first platform event facts and durable handler idempotency.
-- Additive, transaction-safe and deliberately provider-neutral.

CREATE TABLE IF NOT EXISTS "platform_events" (
  "id" text PRIMARY KEY,
  "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "event_type" text NOT NULL,
  "object_type" text,
  "object_id" text,
  "actor_id" uuid,
  "payload_json" jsonb NOT NULL,
  "occurred_at" timestamptz NOT NULL,
  "processed_at" timestamptz,
  "status" text DEFAULT 'pending' NOT NULL,
  "retry_count" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "platform_events_event_type_check" CHECK (length(trim("event_type")) > 0),
  CONSTRAINT "platform_events_status_check"
    CHECK ("status" IN ('pending', 'processing', 'retrying', 'processed', 'failed')),
  CONSTRAINT "platform_events_retry_count_check" CHECK ("retry_count" BETWEEN 0 AND 3)
);

CREATE INDEX IF NOT EXISTS "platform_events_tenant_time"
  ON "platform_events" ("tenant_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "platform_events_tenant_status"
  ON "platform_events" ("tenant_id", "status", "occurred_at");

CREATE TABLE IF NOT EXISTS "processed_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "handler_name" text NOT NULL,
  "event_id" text NOT NULL REFERENCES "platform_events"("id") ON DELETE RESTRICT,
  "processed_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "processed_events_handler_event_unique" UNIQUE ("handler_name", "event_id"),
  CONSTRAINT "processed_events_handler_name_check" CHECK (length(trim("handler_name")) > 0)
);

CREATE INDEX IF NOT EXISTS "processed_events_event" ON "processed_events" ("event_id");
