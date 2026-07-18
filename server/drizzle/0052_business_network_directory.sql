-- P10-001: Business Network directory core.
--
-- This evolves the opt-in PN-001 profile table without replacing it. Existing
-- draft/public snapshot semantics remain the privacy boundary while canonical
-- Company linkage, workflow review, capabilities, views and directory fields
-- are added. Cross-tenant reads must use the application read model that
-- selects only status='published' AND visibility='public'.

ALTER TABLE "business_profiles"
  DROP CONSTRAINT IF EXISTS "business_profiles_status_check",
  DROP CONSTRAINT IF EXISTS "business_profiles_snapshot_check",
  DROP CONSTRAINT IF EXISTS "business_profiles_description_check";

ALTER TABLE "business_profiles"
  ADD COLUMN IF NOT EXISTS "company_id" uuid,
  ADD COLUMN IF NOT EXISTS "slug" text,
  ADD COLUMN IF NOT EXISTS "name" text,
  ADD COLUMN IF NOT EXISTS "industry_primary" text,
  ADD COLUMN IF NOT EXISTS "industry_secondary_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS "country" text DEFAULT 'ZW' NOT NULL,
  ADD COLUMN IF NOT EXISTS "region" text,
  ADD COLUMN IF NOT EXISTS "address_json" jsonb,
  ADD COLUMN IF NOT EXISTS "phone" text,
  ADD COLUMN IF NOT EXISTS "email_public" text,
  ADD COLUMN IF NOT EXISTS "logo_document_id" uuid,
  ADD COLUMN IF NOT EXISTS "cover_document_id" uuid,
  ADD COLUMN IF NOT EXISTS "founded_year" integer,
  ADD COLUMN IF NOT EXISTS "employee_band" text,
  ADD COLUMN IF NOT EXISTS "visibility" text DEFAULT 'public' NOT NULL;

UPDATE "business_profiles" profile
SET
  "company_id" = profile."tenant_id",
  "slug" = tenant."subdomain",
  "name" = profile."display_name",
  "industry_primary" = COALESCE(profile."categories"->>0, 'other'),
  "industry_secondary_json" = CASE
    WHEN jsonb_typeof(profile."categories") = 'array'
      THEN profile."categories" - 0
    ELSE '[]'::jsonb
  END,
  "country" = profile."country_code",
  "phone" = profile."contact_phone",
  "email_public" = profile."contact_email",
  "status" = CASE profile."status"
    WHEN 'PUBLISHED' THEN 'published'
    WHEN 'published' THEN 'published'
    WHEN 'SUSPENDED' THEN 'suspended'
    WHEN 'suspended' THEN 'suspended'
    WHEN 'PENDING_REVIEW' THEN 'pending_review'
    WHEN 'pending_review' THEN 'pending_review'
    ELSE 'draft'
  END
FROM "tenants" tenant
WHERE tenant."id" = profile."tenant_id";

UPDATE "business_profiles"
SET "published_snapshot" = "published_snapshot" || jsonb_strip_nulls(jsonb_build_object(
  'slug', "slug",
  'name', "name",
  'tagline', "tagline",
  'description', "description",
  'industryPrimary', "industry_primary",
  'industrySecondary', "industry_secondary_json",
  'country', "country",
  'region', "region",
  'city', "city",
  'address', "address_json",
  'phone', CASE WHEN "show_contact" THEN "phone" ELSE NULL END,
  'emailPublic', CASE WHEN "show_contact" THEN "email_public" ELSE NULL END,
  'website', "website",
  'logoDocumentId', "logo_document_id",
  'coverDocumentId', "cover_document_id",
  'foundedYear', "founded_year",
  'employeeBand', "employee_band",
  'capabilities', '[]'::jsonb
))
WHERE "status" = 'published' AND "published_snapshot" IS NOT NULL;

ALTER TABLE "business_profiles"
  ALTER COLUMN "company_id" SET NOT NULL,
  ALTER COLUMN "slug" SET NOT NULL,
  ALTER COLUMN "name" SET NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'draft';

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_profiles_company_id_tenants_id_fk') THEN
    ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_company_id_tenants_id_fk"
      FOREIGN KEY ("company_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_profiles_logo_document_tenant_fk') THEN
    ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_logo_document_tenant_fk"
      FOREIGN KEY ("logo_document_id", "tenant_id")
      REFERENCES "workspace_documents"("id", "tenant_id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_profiles_cover_document_tenant_fk') THEN
    ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_cover_document_tenant_fk"
      FOREIGN KEY ("cover_document_id", "tenant_id")
      REFERENCES "workspace_documents"("id", "tenant_id") ON DELETE RESTRICT;
  END IF;
END
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS "business_profiles_slug_unique"
  ON "business_profiles" ("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "business_profiles_tenant_company_unique"
  ON "business_profiles" ("tenant_id", "company_id");
CREATE INDEX IF NOT EXISTS "business_profiles_status_visibility_country"
  ON "business_profiles" ("status", "visibility", "country");

ALTER TABLE "business_profiles"
  ADD CONSTRAINT "business_profiles_company_tenant_check" CHECK ("company_id" = "tenant_id"),
  ADD CONSTRAINT "business_profiles_status_check" CHECK ("status" IN ('draft', 'pending_review', 'published', 'suspended')),
  ADD CONSTRAINT "business_profiles_visibility_check" CHECK ("visibility" IN ('public', 'network', 'hidden')),
  ADD CONSTRAINT "business_profiles_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND length("slug") BETWEEN 3 AND 120),
  ADD CONSTRAINT "business_profiles_canonical_name_check" CHECK (length(trim("name")) BETWEEN 1 AND 120),
  ADD CONSTRAINT "business_profiles_description_check" CHECK ("description" IS NULL OR length("description") <= 5000),
  ADD CONSTRAINT "business_profiles_country_check" CHECK ("country" ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT "business_profiles_founded_year_check" CHECK ("founded_year" IS NULL OR "founded_year" BETWEEN 1000 AND 9999),
  ADD CONSTRAINT "business_profiles_employee_band_check" CHECK ("employee_band" IS NULL OR "employee_band" IN ('1-9', '10-49', '50-249', '250-999', '1000+')),
  ADD CONSTRAINT "business_profiles_snapshot_check" CHECK (
    ("status" = 'published' AND "published_snapshot" IS NOT NULL AND "published_at" IS NOT NULL)
    OR ("status" <> 'published' AND "published_snapshot" IS NULL)
  );

CREATE TABLE IF NOT EXISTS "profile_capabilities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "profile_id" uuid NOT NULL REFERENCES "business_profiles"("id") ON DELETE CASCADE,
  "category" text NOT NULL,
  "name" text NOT NULL,
  CONSTRAINT "profile_capabilities_profile_category_name_unique" UNIQUE ("profile_id", "category", "name"),
  CONSTRAINT "profile_capabilities_category_check" CHECK (length(trim("category")) BETWEEN 1 AND 80),
  CONSTRAINT "profile_capabilities_name_check" CHECK (length(trim("name")) BETWEEN 1 AND 120)
);

CREATE INDEX IF NOT EXISTS "profile_capabilities_profile"
  ON "profile_capabilities" ("profile_id");

CREATE TABLE IF NOT EXISTS "profile_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "profile_id" uuid NOT NULL REFERENCES "business_profiles"("id") ON DELETE CASCADE,
  "viewer_tenant_id" uuid REFERENCES "tenants"("id") ON DELETE SET NULL,
  "viewed_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "profile_views_profile_time"
  ON "profile_views" ("profile_id", "viewed_at");
CREATE INDEX IF NOT EXISTS "profile_views_viewer_tenant_time"
  ON "profile_views" ("viewer_tenant_id", "viewed_at");

-- Persist the review policy for existing tenants. WorkflowService applies the
-- same definition lazily for tenants created after this migration.
INSERT INTO "workflow_definitions"
  ("tenant_id", "name", "version", "object_type", "steps_json", "active")
SELECT
  "id",
  'business-profile.publish.review',
  1,
  'BusinessProfile',
  '[{"name":"review-public-profile","approver":{"type":"role","role":"Owner","permission":"settings.manage"}}]'::jsonb,
  true
FROM "tenants"
ON CONFLICT ("tenant_id", "name", "version") DO NOTHING;
