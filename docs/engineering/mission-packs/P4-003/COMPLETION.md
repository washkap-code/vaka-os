# P4-003 — Completion Report

**Implementation:** Complete for supplier bills and enforced three-way match
**Technical verification:** Pre-PR static gates complete; isolated DB gate pending
**Availability:** Authenticated tenant Procurement workspace and APIs
**Production migration:** Pending separately authorised hand-application
**Completed on:** 2026-07-14

## Delivered

- Added tenant-scoped supplier-bill draft create/list/detail and complete draft
  replacement against one approved purchase order. Supplier and currency are
  derived from the canonical PO and supplier contact; no parallel supplier,
  PO, product or tax master was introduced.
- Added effective-dated country-pack tax resolution on the bill tax date with
  immutable line rate/effective-window snapshots and exact integer-cent totals.
- Added a deterministic strict match evaluator with stable supplier, currency,
  PO-line, price, ordered quantity, received quantity, duplicate invoice and
  missing-receipt reason codes plus line-level comparison evidence.
- Added confirmed, idempotent and concurrency-safe posting under
  `accounting.post`. The transaction locks the bill and PO, re-evaluates the
  match before allocating one BILL number, and leaves no number, journal,
  state, audit or event side effect on mismatch.
- Routed matched posting exclusively through the existing balanced journal
  service: Dr GRNI at the PO/receipt rate, Dr eligible VAT Input and Cr Accounts
  Payable at the bill rate, with the net bill-versus-receipt difference posted
  explicitly to the FX system account.
- Made posted bills immutable through the application lifecycle, retained
  match/journal/audit evidence, and emitted the typed identifier-only
  `supplier_bill.posted` event after commit.
- Preserved assignable segregation between `procurement.approve` and
  `accounting.post`; supplier-bill reads accept either procurement or accounting
  read authority while every record remains scoped from verified JWT context.
- Rebased aged payables on posted supplier bills and their AP journal source
  lineage. Unsupported/manual AP remains an explicit reconciliation difference.
- Added a responsive Supplier Bills section with catalogue-owned copy, labelled
  line-qualified controls, contained modal focus, busy/error/empty states,
  textual match status and 320/640/desktop reflow.
- Added DB-backed coverage for tenant/RBAC boundaries, duplicate supplier
  invoices, effective tax dates, strict mismatch rollback, line corruption,
  partial receipts/bills, concurrent posting, FX, rounding, idempotency,
  immutability and AP/GRNI/VAT journal correctness.

## Files changed

- Mission/governance: this mission pack and completion report, finance
  architecture, event catalogue, roadmap and `CHANGELOG.md`.
- Schema foundation already committed for this mission:
  `server/src/db/schema.ts`, migration
  `server/drizzle/0028_supplier_bill_three_way_match.sql`, and the guarded
  procurement integrity-control runner.
- Server behaviour: `server/src/supplier-bills.ts`, authenticated routes/RBAC,
  event registry, statutory AP source integration and VAT report disclosure.
- Web behaviour: Procurement workspace, typed English catalogue, responsive
  styles and governed accessibility/design-token checks.
- Verification: supplier-bill acceptance tests and updated statutory-report
  source evidence.

## Verification evidence

- Conflict-copy scan: passed; no files ending ` 2.md`, `.gitattributes 2` or
  matching `* 2.*` were present.
- Server typecheck: passed.
- Web typecheck: passed.
- Web production build: passed; Supplier Bills remains in the code-split
  Procurement workspace.
- Shell/navigation tests: 16 passed, 0 failed.
- Design-token conformance: passed (236 governed tokens).
- Accessibility conformance and negative self-test: passed, including the
  Supplier Bills dialog, labelled controls and textual live match result.
- `git diff --check`: passed.
- Guarded isolated `test:db:prepare` and full serial DB-backed server suite:
  pending the hosted PR PostgreSQL gate because no local test PostgreSQL
  service or `DATABASE_URL` is available.
- No production database or shared Supabase command was run.

## Production migration

Production shares its Supabase project with unrelated GENFIN tables. No
`drizzle-kit push`, `db:push`, DDL, migration or other database command was run
against production. After merge, an authorised operator must review and
hand-apply the following exact additive DDL to the VAKA schema only:

```sql
-- P4-003: additive supplier bills and enforced three-way-match evidence.
-- Production must hand-apply this reviewed SQL; never run drizzle push there.
SET lock_timeout = '5s';
SET statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS "supplier_bills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "purchase_order_id" uuid NOT NULL REFERENCES "purchase_orders"("id"),
  "vendor_contact_id" uuid NOT NULL REFERENCES "contacts"("id"),
  "number" text,
  "supplier_invoice_number" text NOT NULL,
  "status" text DEFAULT 'DRAFT' NOT NULL,
  "bill_date" timestamp with time zone NOT NULL,
  "tax_date" date NOT NULL,
  "due_date" timestamp with time zone NOT NULL,
  "currency" "currency" NOT NULL,
  "rate_to_base" numeric(18, 6) NOT NULL,
  "tax_jurisdiction" text NOT NULL,
  "tax_treatment" text NOT NULL,
  "subtotal" numeric(14, 2) NOT NULL,
  "tax_total" numeric(14, 2) NOT NULL,
  "total" numeric(14, 2) NOT NULL,
  "match_status" text DEFAULT 'PENDING' NOT NULL,
  "match_evidence" jsonb,
  "matched_at" timestamp with time zone,
  "posting_idempotency_key" text,
  "posting_idempotency_fingerprint" text,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "updated_by" uuid NOT NULL REFERENCES "users"("id"),
  "posted_by" uuid REFERENCES "users"("id"),
  "posted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "supplier_bills_status_check" CHECK ("status" IN ('DRAFT', 'POSTED')),
  CONSTRAINT "supplier_bills_match_status_check" CHECK ("match_status" IN ('PENDING', 'MATCHED', 'BLOCKED')),
  CONSTRAINT "supplier_bills_tax_treatment_check" CHECK ("tax_treatment" IN ('standard', 'zero-rated', 'exempt', 'mixed')),
  CONSTRAINT "supplier_bills_totals_check" CHECK ("subtotal" >= 0 AND "tax_total" >= 0 AND "total" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "supplier_bills_tenant_number"
  ON "supplier_bills" ("tenant_id", "number");
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_bills_tenant_supplier_invoice"
  ON "supplier_bills" ("tenant_id", "vendor_contact_id", lower("supplier_invoice_number"));
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_bills_tenant_posting_idempotency"
  ON "supplier_bills" ("tenant_id", "posting_idempotency_key");
CREATE INDEX IF NOT EXISTS "supplier_bills_tenant_po"
  ON "supplier_bills" ("tenant_id", "purchase_order_id", "created_at");
CREATE INDEX IF NOT EXISTS "supplier_bills_tenant_status"
  ON "supplier_bills" ("tenant_id", "status", "due_date");

CREATE TABLE IF NOT EXISTS "supplier_bill_line_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "supplier_bill_id" uuid NOT NULL REFERENCES "supplier_bills"("id"),
  "purchase_order_line_item_id" uuid NOT NULL REFERENCES "purchase_order_line_items"("id"),
  "product_id" uuid NOT NULL REFERENCES "products"("id"),
  "position" integer NOT NULL,
  "quantity" numeric(12, 3) NOT NULL,
  "unit_price" numeric(14, 2) NOT NULL,
  "net_amount" numeric(14, 2) NOT NULL,
  "tax_treatment" text NOT NULL,
  "tax_rate" numeric(7, 4) NOT NULL,
  "tax_rate_effective_from" date,
  "tax_rate_effective_to" date,
  "tax_amount" numeric(14, 2) NOT NULL,
  "line_total" numeric(14, 2) NOT NULL,
  CONSTRAINT "supplier_bill_lines_position_check" CHECK ("position" > 0),
  CONSTRAINT "supplier_bill_lines_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "supplier_bill_lines_money_check"
    CHECK ("unit_price" > 0 AND "net_amount" >= 0 AND "tax_amount" >= 0 AND "line_total" >= 0),
  CONSTRAINT "supplier_bill_lines_tax_treatment_check"
    CHECK ("tax_treatment" IN ('standard', 'zero-rated', 'exempt'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "supplier_bill_lines_po_line"
  ON "supplier_bill_line_items" ("supplier_bill_id", "purchase_order_line_item_id");
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_bill_lines_position"
  ON "supplier_bill_line_items" ("supplier_bill_id", "position");
CREATE INDEX IF NOT EXISTS "supplier_bill_lines_tenant_bill"
  ON "supplier_bill_line_items" ("tenant_id", "supplier_bill_id");
CREATE INDEX IF NOT EXISTS "supplier_bill_lines_tenant_po_line"
  ON "supplier_bill_line_items" ("tenant_id", "purchase_order_line_item_id");
```

This DDL adds only supplier-bill documents, immutable tax/match snapshots and
their indexes/checks. It does not modify, inspect or remove any GENFIN table.

## Behaviour and finance boundaries

- Draft supplier bills are non-posting working documents. A match inspection
  is read-only and deliberately does not persist a blocked result.
- Only confirmed `accounting.post` requests that pass a fresh in-transaction
  match recognise AP/input VAT and clear the matched portion of GRNI.
- Posted bills and journals cannot be edited or deleted. Corrections require a
  future controlled supplier credit/debit note or reversing workflow.
- Payment, allocation, credit/debit notes, non-PO bills, tolerances/waivers,
  registration-aware input-tax eligibility and supplier statements remain out
  of scope and release-gated.
- Zimbabwe accounting/tax treatment requires qualified professional review
  before market GA; this implementation is deterministic technical control,
  not tax or accounting approval.

## Rollback

Revert routes, services, UI, event/report consumers and permission helper only
through a reviewed rollback. Leave additive tables and all posted bills,
journals, match evidence, numbers and audits intact. Reconcile any posted
balances through controlled future reversing documents; never mutate or drop
financial history.
