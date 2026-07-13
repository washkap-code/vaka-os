-- P7-001: append-only consent evidence and idempotent finance delivery outcomes.
-- Additive only; no existing customer, invoice, notification or ledger data changes.
CREATE TABLE IF NOT EXISTS "contact_communication_preference_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "contact_id" uuid NOT NULL REFERENCES "contacts"("id"),
  "channel" text NOT NULL,
  "status" text NOT NULL,
  "locale" text NOT NULL,
  "evidence_source" text NOT NULL,
  "reason" text,
  "actor_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "contact_communication_preference_channel_check" CHECK ("channel" IN ('EMAIL')),
  CONSTRAINT "contact_communication_preference_status_check" CHECK ("status" IN ('CONSENTED', 'OPTED_OUT')),
  CONSTRAINT "contact_communication_preference_locale_check" CHECK ("locale" IN ('en-ZW', 'sn-ZW', 'nd-ZW')),
  CONSTRAINT "contact_communication_preference_source_check" CHECK ("evidence_source" IN ('CUSTOMER_REQUEST', 'CONTRACT', 'LEGITIMATE_INTEREST', 'OTHER'))
);

CREATE INDEX IF NOT EXISTS "contact_communication_preference_latest"
  ON "contact_communication_preference_events" ("tenant_id", "contact_id", "channel", "created_at", "id");

CREATE TABLE IF NOT EXISTS "finance_document_delivery_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "contact_id" uuid NOT NULL REFERENCES "contacts"("id"),
  "invoice_id" uuid REFERENCES "invoices"("id"),
  "document_type" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "idempotency_fingerprint" text NOT NULL,
  "status" text DEFAULT 'PROCESSING' NOT NULL,
  "email_notification_id" text,
  "in_app_notification_id" text,
  "share_link_id" uuid REFERENCES "invoice_share_links"("id"),
  "failure_code" text,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "finance_document_delivery_type_check" CHECK ("document_type" IN ('INVOICE', 'STATEMENT', 'PAYMENT_REMINDER')),
  CONSTRAINT "finance_document_delivery_status_check" CHECK ("status" IN ('PROCESSING', 'SENT', 'FAILED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "finance_document_delivery_tenant_idempotency"
  ON "finance_document_delivery_requests" ("tenant_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "finance_document_delivery_tenant_contact_time"
  ON "finance_document_delivery_requests" ("tenant_id", "contact_id", "created_at");
