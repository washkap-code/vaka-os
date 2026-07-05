DO $$ BEGIN
  CREATE TYPE "public"."referral_program" AS ENUM('GENERAL', 'PROFESSIONAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "referral_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" text NOT NULL UNIQUE,
  "program" "referral_program" NOT NULL,
  "rule_version" text NOT NULL,
  "referrer_tenant_id" uuid,
  "referrer_user_id" uuid,
  "campaign" text,
  "status" text DEFAULT 'active' NOT NULL,
  "expires_at" timestamp with time zone,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "referral_codes_referrer_required"
    CHECK ("referrer_tenant_id" IS NOT NULL OR "referrer_user_id" IS NOT NULL),
  CONSTRAINT "referral_codes_tenant_fk"
    FOREIGN KEY ("referrer_tenant_id") REFERENCES "public"."tenants"("id"),
  CONSTRAINT "referral_codes_user_fk"
    FOREIGN KEY ("referrer_user_id") REFERENCES "public"."users"("id"),
  CONSTRAINT "referral_codes_creator_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
);

CREATE INDEX IF NOT EXISTS "referral_codes_referrer"
  ON "referral_codes" USING btree ("referrer_tenant_id", "referrer_user_id");
CREATE INDEX IF NOT EXISTS "referral_codes_status"
  ON "referral_codes" USING btree ("status", "expires_at");

CREATE TABLE IF NOT EXISTS "referral_attributions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "referred_tenant_id" uuid NOT NULL UNIQUE,
  "referral_code_id" uuid NOT NULL,
  "program" "referral_program" NOT NULL,
  "rule_version" text NOT NULL,
  "status" text DEFAULT 'CAPTURED' NOT NULL,
  "captured_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "referral_attributions_tenant_fk"
    FOREIGN KEY ("referred_tenant_id") REFERENCES "public"."tenants"("id"),
  CONSTRAINT "referral_attributions_code_fk"
    FOREIGN KEY ("referral_code_id") REFERENCES "public"."referral_codes"("id")
);

CREATE INDEX IF NOT EXISTS "referral_attribution_code"
  ON "referral_attributions" USING btree ("referral_code_id", "captured_at");

CREATE OR REPLACE FUNCTION prevent_referral_attribution_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'referral_attributions are append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "referral_attributions_append_only" ON "referral_attributions";
CREATE TRIGGER "referral_attributions_append_only"
BEFORE UPDATE OR DELETE ON "referral_attributions"
FOR EACH ROW EXECUTE FUNCTION prevent_referral_attribution_mutation();
