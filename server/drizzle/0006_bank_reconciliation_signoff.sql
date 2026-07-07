CREATE TABLE IF NOT EXISTS "bank_reconciliations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "bank_account_id" uuid NOT NULL REFERENCES "bank_accounts"("id"),
  "statement_date" timestamp with time zone NOT NULL,
  "statement_closing_balance" numeric(14, 2) NOT NULL,
  "opening_balance" numeric(14, 2) NOT NULL,
  "imported_net_movement" numeric(14, 2) NOT NULL,
  "expected_book_balance" numeric(14, 2) NOT NULL,
  "difference" numeric(14, 2) NOT NULL,
  "total_lines" integer DEFAULT 0 NOT NULL,
  "matched_lines" integer DEFAULT 0 NOT NULL,
  "unreviewed_lines" integer DEFAULT 0 NOT NULL,
  "unreviewed_net" numeric(14, 2) NOT NULL,
  "status" text DEFAULT 'PREPARED' NOT NULL,
  "reconciliation_status" text NOT NULL,
  "notes" text,
  "prepared_by" uuid REFERENCES "users"("id"),
  "prepared_at" timestamp with time zone DEFAULT now() NOT NULL,
  "approved_by" uuid REFERENCES "users"("id"),
  "approved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "bankrec_status_check" CHECK ("status" IN ('PREPARED', 'APPROVED')),
  CONSTRAINT "bankrec_reconciliation_status_check" CHECK ("reconciliation_status" IN ('balanced', 'needs_review'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "bankrec_tenant_account_statement"
  ON "bank_reconciliations" ("tenant_id", "bank_account_id", "statement_date");

CREATE INDEX IF NOT EXISTS "bankrec_tenant_time"
  ON "bank_reconciliations" ("tenant_id", "statement_date");

UPDATE "public"."roles"
SET "permissions" = ARRAY(
  SELECT DISTINCT permission
  FROM unnest("permissions" || ARRAY[
    'bank_reconciliation.prepare',
    'bank_reconciliation.approve'
  ]::text[]) AS permission
)
WHERE "name" IN ('Owner', 'Admin');

UPDATE "public"."roles"
SET "permissions" = ARRAY(
  SELECT DISTINCT permission
  FROM unnest("permissions" || ARRAY[
    'bank_reconciliation.prepare'
  ]::text[]) AS permission
)
WHERE "name" = 'Accountant';
