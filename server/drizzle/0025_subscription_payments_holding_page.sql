ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "sign_out_destination" text DEFAULT 'PUBLIC_HOME' NOT NULL;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "idle_sign_out_enabled" boolean DEFAULT false NOT NULL;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "idle_sign_out_minutes" integer DEFAULT 5 NOT NULL;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "holding_page_heading" text;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "holding_page_message" text;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "holding_offer_title" text;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "holding_offer_body" text;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "holding_offer_cta_label" text;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "holding_offer_cta_url" text;

DO $$ BEGIN
  ALTER TABLE "tenants" ADD CONSTRAINT "tenants_sign_out_destination_check"
    CHECK ("sign_out_destination" IN ('PUBLIC_HOME', 'HOLDING_PAGE'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "tenants" ADD CONSTRAINT "tenants_idle_sign_out_minutes_check"
    CHECK ("idle_sign_out_minutes" BETWEEN 5 AND 480);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "subscription_payment_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "subscription_invoice_id" uuid NOT NULL REFERENCES "subscription_invoices"("id"),
  "provider" text DEFAULT 'PAYNOW' NOT NULL,
  "merchant_reference" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "amount" numeric(10,2) NOT NULL,
  "currency" "currency" NOT NULL,
  "status" text DEFAULT 'CREATED' NOT NULL,
  "provider_status" text,
  "provider_reference" text,
  "redirect_url" text,
  "encrypted_poll_url" text,
  "initiated_by" uuid NOT NULL REFERENCES "users"("id"),
  "provider_confirmed_at" timestamp with time zone,
  "settled_at" timestamp with time zone,
  "last_checked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "subscription_payment_attempts_provider_check" CHECK ("provider" = 'PAYNOW'),
  CONSTRAINT "subscription_payment_attempts_status_check" CHECK ("status" IN ('CREATED', 'PENDING', 'PAID', 'FAILED', 'CANCELLED', 'DISPUTED', 'REFUNDED', 'REQUIRES_REVIEW'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "subscription_payment_attempts_reference_unique"
  ON "subscription_payment_attempts" ("merchant_reference");
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_payment_attempts_idempotency_unique"
  ON "subscription_payment_attempts" ("tenant_id", "subscription_invoice_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "subscription_payment_attempts_tenant_invoice"
  ON "subscription_payment_attempts" ("tenant_id", "subscription_invoice_id", "created_at");
CREATE INDEX IF NOT EXISTS "subscription_payment_attempts_invoice"
  ON "subscription_payment_attempts" ("subscription_invoice_id");
CREATE INDEX IF NOT EXISTS "subscription_payment_attempts_initiated_by"
  ON "subscription_payment_attempts" ("initiated_by");

-- VAKA's Express/RBAC boundary is authoritative. Prevent browser database
-- roles from reaching provider references or encrypted polling evidence, and
-- retain RLS as defence in depth for this public-schema tenant-owned table.
ALTER TABLE "subscription_payment_attempts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "subscription_payment_attempts" FROM anon, authenticated;
