CREATE TABLE IF NOT EXISTS "customer_timeline_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "contact_id" uuid NOT NULL REFERENCES "contacts"("id"),
  "event_kind" text NOT NULL,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "actor_user_id" uuid,
  "projected_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_timeline_source"
  ON "customer_timeline_events" ("tenant_id", "event_kind", "source_id");

CREATE INDEX IF NOT EXISTS "customer_timeline_contact_time"
  ON "customer_timeline_events" ("tenant_id", "contact_id", "occurred_at", "id");
