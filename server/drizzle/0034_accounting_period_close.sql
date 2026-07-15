-- P2-005: financial period close. Posted periods can be locked so history
-- cannot change underneath filed VAT returns or reviewed management accounts;
-- corrections are posted as offsetting entries in an open period.
-- Additive and idempotent: safe to hand-apply to production before the code
-- that uses it deploys (an empty table locks nothing).

CREATE TABLE IF NOT EXISTS "accounting_periods" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "period_month" date NOT NULL,
  "status" text DEFAULT 'CLOSED' NOT NULL,
  "closed_by" uuid NOT NULL REFERENCES "users"("id"),
  "closed_at" timestamptz DEFAULT now() NOT NULL,
  "closed_reason" text NOT NULL,
  "reopened_by" uuid REFERENCES "users"("id"),
  "reopened_at" timestamptz,
  "reopened_reason" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "accounting_periods_status_check" CHECK ("status" IN ('CLOSED', 'OPEN')),
  CONSTRAINT "accounting_periods_month_check"
    CHECK ("period_month" = date_trunc('month', "period_month")::date),
  CONSTRAINT "accounting_periods_reopen_state_check" CHECK (
    ("status" = 'CLOSED' AND "reopened_at" IS NULL AND "reopened_by" IS NULL AND "reopened_reason" IS NULL)
    OR ("status" = 'OPEN' AND "reopened_at" IS NOT NULL AND "reopened_by" IS NOT NULL AND "reopened_reason" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "accounting_periods_tenant_month"
  ON "accounting_periods" ("tenant_id", "period_month");

-- Defence in depth below the application boundary: no journal entry may be
-- inserted into a closed month regardless of code path. Month boundaries are
-- evaluated in UTC, matching the application's period arithmetic.
CREATE OR REPLACE FUNCTION vaka_enforce_accounting_period_lock()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "accounting_periods" p
    WHERE p."tenant_id" = NEW."tenant_id"
      AND p."status" = 'CLOSED'
      AND p."period_month" = date_trunc('month', NEW."date" AT TIME ZONE 'UTC')::date
  ) THEN
    RAISE EXCEPTION 'Accounting period is closed for posting date %', NEW."date"
      USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS journal_entries_period_lock ON "journal_entries";
CREATE TRIGGER journal_entries_period_lock
BEFORE INSERT ON "journal_entries"
FOR EACH ROW EXECUTE FUNCTION vaka_enforce_accounting_period_lock();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "accounting_periods" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "accounting_periods" FROM authenticated;
  END IF;
END $$;
