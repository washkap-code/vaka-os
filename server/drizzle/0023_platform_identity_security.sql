CREATE TABLE IF NOT EXISTS "platform_roles" (
  "key" text PRIMARY KEY,
  "name" text NOT NULL,
  "permissions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "is_system" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "platform_roles" ("key", "name", "permissions") VALUES
  ('PRINCIPAL_ADMIN', 'Principal Administrator', '["platform.overview.read","platform.tenants.read","platform.tenant_audit.read","platform.operations.read","platform.billing.run","platform.billing.payment.manage","platform.referrals.manage","platform.backups.read","platform.backups.write","platform.staff.read","platform.staff.manage","platform.security.manage","platform.settings.manage"]'::jsonb),
  ('OPERATIONS_ADMIN', 'Operations Administrator', '["platform.overview.read","platform.tenants.read","platform.tenant_audit.read","platform.operations.read","platform.backups.read","platform.backups.write","platform.staff.read"]'::jsonb),
  ('FINANCE_OPERATIONS', 'Finance Operations', '["platform.overview.read","platform.tenants.read","platform.billing.run","platform.billing.payment.manage","platform.referrals.manage"]'::jsonb),
  ('SUPPORT_ANALYST', 'Support Analyst', '["platform.overview.read","platform.tenants.read","platform.tenant_audit.read"]'::jsonb),
  ('SECURITY_AUDITOR', 'Security Auditor', '["platform.overview.read","platform.tenant_audit.read","platform.operations.read","platform.backups.read","platform.staff.read"]'::jsonb)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "permissions" = EXCLUDED."permissions",
  "is_system" = true;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "platform_role_key" text;
DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_platform_role_key_platform_roles_key_fk"
    FOREIGN KEY ("platform_role_key") REFERENCES "platform_roles"("key");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE "users"
SET "platform_role_key" = 'PRINCIPAL_ADMIN'
WHERE "tenant_id" IS NULL AND "is_platform_admin" = true AND "platform_role_key" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "platform_users_email_unique"
  ON "users" ("email") WHERE "tenant_id" IS NULL;

CREATE TABLE IF NOT EXISTS "password_reset_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "tenant_id" uuid REFERENCES "tenants"("id"),
  "token_hash" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "delivery_status" text NOT NULL DEFAULT 'PENDING',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "password_reset_requests_delivery_check" CHECK ("delivery_status" IN ('PENDING', 'SENT', 'FAILED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_requests_token_hash" ON "password_reset_requests" ("token_hash");
CREATE INDEX IF NOT EXISTS "password_reset_requests_user_time" ON "password_reset_requests" ("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "user_mfa_factors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "factor_type" text NOT NULL DEFAULT 'TOTP',
  "status" text NOT NULL DEFAULT 'PENDING',
  "encrypted_secret" text NOT NULL,
  "secret_iv" text NOT NULL,
  "secret_tag" text NOT NULL,
  "recovery_code_hashes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "verified_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "user_mfa_factors_type_check" CHECK ("factor_type" = 'TOTP'),
  CONSTRAINT "user_mfa_factors_status_check" CHECK ("status" IN ('PENDING', 'VERIFIED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "user_mfa_factors_user" ON "user_mfa_factors" ("user_id");

CREATE TABLE IF NOT EXISTS "platform_staff_profiles" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id"),
  "employee_number" text UNIQUE,
  "business_function" text NOT NULL,
  "job_title" text NOT NULL,
  "work_phone" text,
  "location" text,
  "manager_user_id" uuid REFERENCES "users"("id"),
  "employment_state" text NOT NULL DEFAULT 'ACTIVE',
  "start_date" date,
  "end_date" date,
  "operational_notes" text,
  "updated_by" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "platform_staff_profiles_state_check" CHECK ("employment_state" IN ('ACTIVE', 'LEAVE', 'ENDED'))
);
CREATE INDEX IF NOT EXISTS "platform_staff_profiles_function" ON "platform_staff_profiles" ("business_function", "employment_state");
CREATE INDEX IF NOT EXISTS "platform_staff_profiles_manager" ON "platform_staff_profiles" ("manager_user_id");
CREATE INDEX IF NOT EXISTS "platform_staff_profiles_updated_by" ON "platform_staff_profiles" ("updated_by");

INSERT INTO "platform_staff_profiles" (
  "user_id", "business_function", "job_title", "employment_state", "updated_by"
)
SELECT "id", 'Executive', 'Principal Platform Administrator', 'ACTIVE', "id"
FROM "users"
WHERE "tenant_id" IS NULL AND "is_platform_admin" = true
ON CONFLICT ("user_id") DO NOTHING;

REVOKE ALL ON TABLE "platform_roles", "password_reset_requests", "user_mfa_factors", "platform_staff_profiles" FROM anon, authenticated;
