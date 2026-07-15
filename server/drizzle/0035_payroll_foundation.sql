-- P2-009: Zimbabwe payroll foundation (technical preview).
-- Employee register, payroll runs and immutable payslip snapshots. One
-- balanced journal per posted run via postJournal; reversal-only corrections.
-- Additive and idempotent: safe to hand-apply to production before the code
-- that uses it deploys (empty tables change nothing).

CREATE TABLE IF NOT EXISTS "employees" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "employee_number" text NOT NULL,
  "first_name" text NOT NULL,
  "last_name" text NOT NULL,
  "national_id" text,
  "nssa_number" text,
  "email" text,
  "phone" text,
  "currency" "currency" NOT NULL,
  "basic_salary" numeric(14,2) NOT NULL,
  "status" text DEFAULT 'ACTIVE' NOT NULL,
  "start_date" date,
  "end_date" date,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "employees_status_check" CHECK ("status" IN ('ACTIVE', 'ENDED')),
  CONSTRAINT "employees_basic_salary_check" CHECK ("basic_salary" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "employees_tenant_number"
  ON "employees" ("tenant_id", "employee_number");
CREATE INDEX IF NOT EXISTS "employees_tenant_status"
  ON "employees" ("tenant_id", "status");

CREATE TABLE IF NOT EXISTS "payroll_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "period_month" date NOT NULL,
  "currency" "currency" NOT NULL,
  "status" text DEFAULT 'DRAFT' NOT NULL,
  "employee_count" integer DEFAULT 0 NOT NULL,
  "gross_total" numeric(14,2) DEFAULT 0 NOT NULL,
  "paye_total" numeric(14,2) DEFAULT 0 NOT NULL,
  "tax_levy_total" numeric(14,2) DEFAULT 0 NOT NULL,
  "ss_employee_total" numeric(14,2) DEFAULT 0 NOT NULL,
  "ss_employer_total" numeric(14,2) DEFAULT 0 NOT NULL,
  "net_total" numeric(14,2) DEFAULT 0 NOT NULL,
  "verification_status" text NOT NULL,
  "verification_note" text NOT NULL,
  "journal_entry_id" uuid REFERENCES "journal_entries"("id"),
  "reversal_journal_entry_id" uuid REFERENCES "journal_entries"("id"),
  "created_by" uuid REFERENCES "users"("id"),
  "posted_by" uuid REFERENCES "users"("id"),
  "posted_at" timestamptz,
  "reversed_by" uuid REFERENCES "users"("id"),
  "reversed_at" timestamptz,
  "reversed_reason" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "payroll_runs_status_check" CHECK ("status" IN ('DRAFT', 'POSTED', 'REVERSED')),
  CONSTRAINT "payroll_runs_month_check"
    CHECK ("period_month" = date_trunc('month', "period_month")::date),
  CONSTRAINT "payroll_runs_posted_state_check" CHECK (
    ("status" = 'DRAFT' AND "journal_entry_id" IS NULL)
    OR ("status" = 'POSTED' AND "journal_entry_id" IS NOT NULL AND "reversal_journal_entry_id" IS NULL)
    OR ("status" = 'REVERSED' AND "journal_entry_id" IS NOT NULL AND "reversal_journal_entry_id" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "payroll_runs_tenant_month_currency_live"
  ON "payroll_runs" ("tenant_id", "period_month", "currency")
  WHERE "status" IN ('DRAFT', 'POSTED');
CREATE INDEX IF NOT EXISTS "payroll_runs_tenant_status"
  ON "payroll_runs" ("tenant_id", "status");

CREATE TABLE IF NOT EXISTS "payslips" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "payroll_run_id" uuid NOT NULL REFERENCES "payroll_runs"("id"),
  "employee_id" uuid NOT NULL REFERENCES "employees"("id"),
  "employee_number" text NOT NULL,
  "employee_name" text NOT NULL,
  "currency" "currency" NOT NULL,
  "basic_salary" numeric(14,2) NOT NULL,
  "allowances" numeric(14,2) DEFAULT 0 NOT NULL,
  "gross_pay" numeric(14,2) NOT NULL,
  "ss_employee" numeric(14,2) NOT NULL,
  "ss_employer" numeric(14,2) NOT NULL,
  "taxable_pay" numeric(14,2) NOT NULL,
  "paye" numeric(14,2) NOT NULL,
  "tax_levy" numeric(14,2) NOT NULL,
  "net_pay" numeric(14,2) NOT NULL,
  "calculation_trace" jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "payslips_amounts_check" CHECK (
    "gross_pay" >= 0 AND "ss_employee" >= 0 AND "ss_employer" >= 0
    AND "taxable_pay" >= 0 AND "paye" >= 0 AND "tax_levy" >= 0 AND "net_pay" >= 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "payslips_run_employee"
  ON "payslips" ("payroll_run_id", "employee_id");
CREATE INDEX IF NOT EXISTS "payslips_tenant_employee"
  ON "payslips" ("tenant_id", "employee_id");

-- Role backfill (precedent: 0004). Idempotent — unnest+DISTINCT dedupes.
UPDATE "public"."roles"
SET "permissions" = ARRAY(
  SELECT DISTINCT permission
  FROM unnest("permissions" || ARRAY[
    'payroll.read',
    'payroll.manage',
    'payroll.post'
  ]::text[]) AS permission
)
WHERE "name" IN ('Owner', 'Admin', 'Accountant');
