-- PN-001: opt-in public business profile from the canonical Company (tenant).
-- Owner-controlled; NOTHING is public by default: no row = no profile, and a
-- profile only becomes publicly consumable when the tenant OWNER publishes it,
-- which freezes an explicit snapshot. The directory (PN-002) will read ONLY
-- published snapshots — never live tenant data.
-- Empty table changes nothing. Additive and idempotent: safe to hand-apply to
-- production before the code deploys.

CREATE TABLE IF NOT EXISTS "business_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "display_name" text NOT NULL,
  "tagline" text,
  "description" text,
  "categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "city" text,
  "country_code" text DEFAULT 'ZW' NOT NULL,
  "website" text,
  "contact_email" text,
  "contact_phone" text,
  "show_contact" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'DRAFT' NOT NULL,
  "published_snapshot" jsonb,
  "published_at" timestamptz,
  "published_by" uuid REFERENCES "users"("id"),
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "business_profiles_status_check" CHECK ("status" IN ('DRAFT', 'PUBLISHED', 'UNPUBLISHED')),
  CONSTRAINT "business_profiles_name_check" CHECK (length(trim("display_name")) BETWEEN 1 AND 120),
  CONSTRAINT "business_profiles_tagline_check" CHECK ("tagline" IS NULL OR length("tagline") <= 140),
  CONSTRAINT "business_profiles_description_check" CHECK ("description" IS NULL OR length("description") <= 2000),
  -- A published profile must have a snapshot; anything else must not.
  CONSTRAINT "business_profiles_snapshot_check" CHECK (
    ("status" = 'PUBLISHED' AND "published_snapshot" IS NOT NULL AND "published_at" IS NOT NULL)
    OR ("status" <> 'PUBLISHED' AND "published_snapshot" IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "business_profiles_tenant"
  ON "business_profiles" ("tenant_id");
CREATE INDEX IF NOT EXISTS "business_profiles_status_country"
  ON "business_profiles" ("status", "country_code");
