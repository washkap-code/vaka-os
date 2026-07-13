CREATE TABLE IF NOT EXISTS "low_stock_alert_states" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "product_id" uuid NOT NULL REFERENCES "products"("id"),
  "state" text DEFAULT 'HEALTHY' NOT NULL,
  "last_observed_quantity" numeric(12,3) DEFAULT '0' NOT NULL,
  "threshold" integer DEFAULT 0 NOT NULL,
  "breach_sequence" integer DEFAULT 0 NOT NULL,
  "notification_pending" boolean DEFAULT false NOT NULL,
  "last_transition_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_notified_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "low_stock_alert_state_check" CHECK ("state" IN ('HEALTHY', 'LOW')),
  CONSTRAINT "low_stock_alert_sequence_check" CHECK ("breach_sequence" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "low_stock_alert_tenant_product"
  ON "low_stock_alert_states" ("tenant_id", "product_id");

CREATE INDEX IF NOT EXISTS "low_stock_alert_pending"
  ON "low_stock_alert_states" ("tenant_id", "notification_pending");
