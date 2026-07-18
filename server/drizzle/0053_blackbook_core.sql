-- P11-001: structured, governed Black Book directory.
-- Global platform reference data: deliberately no tenant_id. Additive and
-- idempotent; existing PB-001 registry tables and behaviour remain unchanged.

CREATE TABLE IF NOT EXISTS "gov_organisations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_type" text NOT NULL,
  "name" text NOT NULL,
  "acronym" text,
  "parent_org_id" uuid,
  "country" text DEFAULT 'ZW' NOT NULL,
  "description" text,
  "website" text,
  "status" text DEFAULT 'active' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "verified_at" date,
  "updated_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "gov_organisations_parent_fk" FOREIGN KEY ("parent_org_id")
    REFERENCES "gov_organisations"("id") ON DELETE RESTRICT,
  CONSTRAINT "gov_organisations_type_check" CHECK ("org_type" IN
    ('ministry', 'department', 'regulator', 'local_authority', 'utility',
     'court', 'police', 'hospital', 'association', 'tender_portal', 'embassy')),
  CONSTRAINT "gov_organisations_status_check" CHECK ("status" IN ('active', 'merged', 'dissolved')),
  CONSTRAINT "gov_organisations_name_check" CHECK (length(trim("name")) BETWEEN 1 AND 200),
  CONSTRAINT "gov_organisations_acronym_check" CHECK ("acronym" IS NULL OR length(trim("acronym")) BETWEEN 1 AND 30),
  CONSTRAINT "gov_organisations_country_check" CHECK ("country" ~ '^[A-Z]{2}$'),
  CONSTRAINT "gov_organisations_description_check" CHECK ("description" IS NULL OR length("description") <= 5000),
  CONSTRAINT "gov_organisations_website_check" CHECK ("website" IS NULL OR "website" ~ '^https://'),
  CONSTRAINT "gov_organisations_version_check" CHECK ("version" >= 1),
  CONSTRAINT "gov_organisations_parent_check" CHECK ("parent_org_id" IS NULL OR "parent_org_id" <> "id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "gov_organisations_country_name_unique"
  ON "gov_organisations" ("country", "name");
CREATE INDEX IF NOT EXISTS "gov_organisations_country_type"
  ON "gov_organisations" ("country", "org_type", "status", "name");
CREATE INDEX IF NOT EXISTS "gov_organisations_parent"
  ON "gov_organisations" ("parent_org_id", "name");

CREATE TABLE IF NOT EXISTS "gov_contact_points" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "gov_organisations"("id") ON DELETE RESTRICT,
  "type" text NOT NULL,
  "label" text NOT NULL,
  "value" text,
  "region" text,
  "verified_at" date,
  CONSTRAINT "gov_contact_points_type_check" CHECK ("type" IN ('phone', 'email', 'address', 'office_location')),
  CONSTRAINT "gov_contact_points_label_check" CHECK (length(trim("label")) BETWEEN 1 AND 120),
  CONSTRAINT "gov_contact_points_value_check" CHECK ("value" IS NULL OR length("value") <= 1000),
  CONSTRAINT "gov_contact_points_region_check" CHECK ("region" IS NULL OR length("region") <= 120)
);

CREATE INDEX IF NOT EXISTS "gov_contact_points_org"
  ON "gov_contact_points" ("org_id", "type");

CREATE TABLE IF NOT EXISTS "gov_services" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "gov_organisations"("id") ON DELETE RESTRICT,
  "name" text NOT NULL,
  "description" text,
  "category" text NOT NULL,
  "requirements_json" jsonb,
  "fees_json" jsonb,
  "processing_time" text,
  "official_form_url" text,
  "online_service_url" text,
  "verified_at" date,
  CONSTRAINT "gov_services_category_check" CHECK ("category" IN
    ('licensing', 'registration', 'tax', 'permits', 'tenders', 'utilities', 'other')),
  CONSTRAINT "gov_services_name_check" CHECK (length(trim("name")) BETWEEN 1 AND 200),
  CONSTRAINT "gov_services_description_check" CHECK ("description" IS NULL OR length("description") <= 5000),
  CONSTRAINT "gov_services_requirements_check" CHECK ("requirements_json" IS NULL OR jsonb_typeof("requirements_json") = 'array'),
  CONSTRAINT "gov_services_fees_check" CHECK ("fees_json" IS NULL OR jsonb_typeof("fees_json") = 'array'),
  CONSTRAINT "gov_services_processing_time_check" CHECK ("processing_time" IS NULL OR length("processing_time") <= 500),
  CONSTRAINT "gov_services_form_url_check" CHECK ("official_form_url" IS NULL OR "official_form_url" ~ '^https://'),
  CONSTRAINT "gov_services_online_url_check" CHECK ("online_service_url" IS NULL OR "online_service_url" ~ '^https://')
);

CREATE UNIQUE INDEX IF NOT EXISTS "gov_services_org_name_unique"
  ON "gov_services" ("org_id", "name");
CREATE INDEX IF NOT EXISTS "gov_services_org_category"
  ON "gov_services" ("org_id", "category", "name");

CREATE TABLE IF NOT EXISTS "blackbook_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "before_json" jsonb,
  "after_json" jsonb,
  "editor_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "reason" text NOT NULL,
  "revised_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "blackbook_revisions_entity_type_check" CHECK ("entity_type" IN ('organisation', 'contact_point', 'service')),
  CONSTRAINT "blackbook_revisions_reason_check" CHECK (length(trim("reason")) BETWEEN 3 AND 1000),
  CONSTRAINT "blackbook_revisions_change_check" CHECK ("before_json" IS NOT NULL OR "after_json" IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS "blackbook_revisions_entity_time"
  ON "blackbook_revisions" ("entity_type", "entity_id", "revised_at");
CREATE INDEX IF NOT EXISTS "blackbook_revisions_editor_time"
  ON "blackbook_revisions" ("editor_id", "revised_at");

-- The permission is platform-scoped. Principal and operations administrators
-- receive it explicitly; tenant roles are deliberately untouched.
UPDATE "platform_roles"
SET "permissions" = "permissions" || '["blackbook:editor"]'::jsonb
WHERE "key" IN ('PRINCIPAL_ADMIN', 'OPERATIONS_ADMIN')
  AND NOT ("permissions" ? 'blackbook:editor');
