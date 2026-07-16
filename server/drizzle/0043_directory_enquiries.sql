-- PN-003: directory enquiries → CRM leads. Consent-first (a business must
-- opt in via accept_enquiries on its published profile), rate-limited per
-- sender tenant, audited on both sides. Conversion to a CRM contact is an
-- explicit recipient action — nothing enters the CRM automatically.
-- Additive and idempotent; empty table + default-false column change nothing.
-- Every statement is PostgreSQL transaction-safe. Apply this file as one
-- transaction (the automated migration verifier enforces that contract).

ALTER TABLE "business_profiles"
  ADD COLUMN IF NOT EXISTS "accept_enquiries" boolean DEFAULT false NOT NULL;

CREATE TABLE IF NOT EXISTS "directory_enquiries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL CONSTRAINT "directory_enquiries_tenant_id_tenants_id_fk" REFERENCES "tenants"("id"),
  "profile_id" uuid NOT NULL CONSTRAINT "directory_enquiries_profile_id_business_profiles_id_fk" REFERENCES "business_profiles"("id"),
  "from_tenant_id" uuid NOT NULL CONSTRAINT "directory_enquiries_from_tenant_id_tenants_id_fk" REFERENCES "tenants"("id"),
  "from_user_id" uuid NOT NULL CONSTRAINT "directory_enquiries_from_user_id_users_id_fk" REFERENCES "users"("id"),
  "sender_business" text NOT NULL,
  "reply_email" text,
  "message" text NOT NULL,
  "status" text DEFAULT 'NEW' NOT NULL,
  "contact_id" uuid CONSTRAINT "directory_enquiries_contact_id_contacts_id_fk" REFERENCES "contacts"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "directory_enquiries_status_check" CHECK ("status" IN ('NEW', 'CONVERTED', 'DISMISSED')),
  CONSTRAINT "directory_enquiries_message_check" CHECK (length(trim("message")) BETWEEN 5 AND 2000),
  CONSTRAINT "directory_enquiries_no_self_check" CHECK ("tenant_id" <> "from_tenant_id")
);

CREATE INDEX IF NOT EXISTS "directory_enquiries_recipient"
  ON "directory_enquiries" ("tenant_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "directory_enquiries_sender_day"
  ON "directory_enquiries" ("from_tenant_id", "created_at");
