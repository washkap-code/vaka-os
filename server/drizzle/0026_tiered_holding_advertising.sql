-- P6-019: mandatory tenant holding-page sign-out and one governed default
-- campaign for plans without tenant-managed holding-page advertising.
SET lock_timeout = '5s';
SET statement_timeout = '30s';

UPDATE "tenants" SET "sign_out_destination" = 'HOLDING_PAGE'
WHERE "sign_out_destination" <> 'HOLDING_PAGE';
ALTER TABLE "tenants" ALTER COLUMN "sign_out_destination" SET DEFAULT 'HOLDING_PAGE';

UPDATE "plans"
SET "features" = COALESCE("features", '{}'::jsonb) || '{"holdingPageAdvertising": true}'::jsonb
WHERE "name" IN ('Business', 'Enterprise');
UPDATE "plans"
SET "features" = COALESCE("features", '{}'::jsonb) - 'holdingPageAdvertising'
WHERE "name" IN ('Starter', 'Growth');

CREATE TABLE IF NOT EXISTS "platform_holding_advert_settings" (
  "key" text PRIMARY KEY NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "title" text,
  "body" text,
  "cta_label" text,
  "cta_url" text,
  "updated_by" uuid REFERENCES "users"("id"),
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "platform_holding_advert_key_check" CHECK ("key" = 'LOWER_TIER_DEFAULT'),
  CONSTRAINT "platform_holding_advert_cta_pair_check" CHECK (("cta_label" IS NULL) = ("cta_url" IS NULL))
);

CREATE INDEX IF NOT EXISTS "platform_holding_advert_updated_by"
  ON "platform_holding_advert_settings" ("updated_by");

INSERT INTO "platform_holding_advert_settings" ("key", "enabled")
VALUES ('LOWER_TIER_DEFAULT', false)
ON CONFLICT ("key") DO NOTHING;

ALTER TABLE "platform_holding_advert_settings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "platform_holding_advert_settings" FROM anon, authenticated;
