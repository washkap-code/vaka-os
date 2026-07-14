# P4-001 — Completion Report

**Implementation:** Complete for the canonical supplier-role scope
**Technical verification:** Complete
**Availability:** Authenticated tenant Supplier workspace and APIs
**Production migration:** Pending separately authorised hand-application
**Completed on:** 2026-07-14

## Delivered

- Supplier remains the existing canonical `contacts` record with
  `is_vendor = true`; no supplier, company or contact master was duplicated.
- Added nullable supplier code, preferred currency, payment-term days and
  expected-lead-time days to the canonical contact. Supplier codes are
  case-insensitively unique per tenant among active records and day values are
  constrained to 0–3,650.
- Added strict, tenant-scoped supplier list/create/detail/update APIs using
  `inventory.read` and `inventory.write`. Writes audit atomically without
  copying supplier contact details into audit metadata.
- Added a typed, identifier-only `supplier.changed` post-commit fact and
  role-aware contact/import/removal events for customer-only, supplier-only and
  dual-role parties.
- Added the Supplier role projection to canonical metadata and rebuildable
  search. Search re-reads the tenant-owned contact and requires inventory
  permission; sensitive addresses, tax identifiers and notes are not indexed.
- Added a responsive Supplier workspace, governed navigation/search result,
  catalogue-owned English copy and procurement defaults. The same record is
  visible in Contacts when the user also has CRM access.
- Purchase-order and expense commands now reject missing, removed,
  cross-tenant and non-vendor contacts before numbering, document, journal or
  audit side effects. Existing expense posting still uses the approved journal
  service; P4-001 adds no accounting or tax behaviour.
- Made guarded test preparation deterministic after the platform-admin
  first-login test rotates its fixture password. Credential restoration occurs
  only when `NODE_ENV=test`; repeat production seeds never reset a password.
- Set the serial DB-backed suite's repository timeout to 15 seconds so its
  integration tests have a stable ceiling on slower hosts.

## Files changed

- Mission evidence and governed documents:
  `docs/engineering/mission-packs/P4-001/`, event catalogue, enterprise data
  model, business-operations book, master build plan and changelog.
- Database and guarded preparation: `server/src/db/schema.ts`,
  `server/drizzle/0026_canonical_supplier_fields.sql`,
  `server/scripts/apply-procurement-integrity-controls.ts`, seed and package
  scripts.
- Server behaviour: supplier/party-event services, routes, contact bulk/remove
  handling, contact import, event registry, metadata and search.
- Web behaviour: Supplier workspace, navigation, command search/palette,
  catalogue copy, responsive styles and shell tests.
- Verification: supplier integration, metadata and platform-runtime tests.

## Verification evidence

- Conflict-copy scan: passed; no files ending ` 2.md`, `.gitattributes 2` or
  matching `* 2.*` were present.
- Guarded local `test:db:prepare`: passed against localhost database
  `vaka_os_test`; finance and procurement integrity controls and reference seed
  completed.
- Focused P4-001 integration suite: 1 file / 3 tests passed.
- Full serial DB-backed server suite: 157 suites / 241 tests passed, 0 failed,
  0 pending.
- Server typecheck: passed.
- Web typecheck: passed.
- Web production build: passed.
- Shell/navigation tests: 15 passed, 0 failed.
- Design-token conformance: passed (236 governed tokens).
- Accessibility conformance and negative self-test: passed.
- Browser walkthrough: supplier create and canonical Contacts projection
  passed; 320 CSS-pixel Supplier workspace had no horizontal overflow; browser
  console contained no warnings or errors. Screenshot capture itself timed out,
  so no screenshot artefact is claimed.
- `git diff --check`: passed.

## Production migration

Production shares its Supabase project with unrelated GENFIN tables. No
`drizzle-kit push`, `db:push`, DDL, migration or other database command was run
against production. After merge, an authorised operator must review and
hand-apply the following exact additive DDL to the VAKA schema only:

```sql
-- P4-001: supplier-specific attributes remain on the one canonical contact
-- record. No supplier/company/contact master is duplicated.
SET lock_timeout = '5s';
SET statement_timeout = '30s';

ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "supplier_code" text;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "supplier_currency" "currency";
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "supplier_payment_terms_days" integer;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "supplier_lead_time_days" integer;

DO $$ BEGIN
  ALTER TABLE "contacts" ADD CONSTRAINT "contacts_supplier_payment_terms_days_check"
    CHECK ("supplier_payment_terms_days" IS NULL OR "supplier_payment_terms_days" BETWEEN 0 AND 3650);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "contacts" ADD CONSTRAINT "contacts_supplier_lead_time_days_check"
    CHECK ("supplier_lead_time_days" IS NULL OR "supplier_lead_time_days" BETWEEN 0 AND 3650);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "contacts_tenant_active_supplier_code"
  ON "contacts" ("tenant_id", lower("supplier_code"))
  WHERE "supplier_code" IS NOT NULL AND "deleted_at" IS NULL;

-- Backward-compatible expansion of the rebuildable search projection.
ALTER TABLE "search_documents" DROP CONSTRAINT IF EXISTS "search_documents_entity_type_check";
ALTER TABLE "search_documents" ADD CONSTRAINT "search_documents_entity_type_check"
  CHECK ("entity_type" IN ('customer', 'supplier', 'invoice', 'product'));
```

No backfill is required. Existing contacts remain valid. Search documents are
derived and reconcile lazily from canonical contacts after application rollout.

## Behaviour and finance boundaries

- Supplier maintenance and purchase-order creation create no journal.
- Expense accounting, exact arithmetic, tax, exchange-rate snapshots and
  reversal rules are unchanged. Supplier preferred currency is a non-posting
  default, not transaction authority.
- Supplier bank details, verification, onboarding, portals, requisitions, RFQ,
  approvals, receipts, supplier bills, AP match/posting and payments are not
  delivered by this mission.
- Tenant remains the documented legal-entity surrogate. P4-001 does not claim
  multi-entity or filing readiness.
- No AI provider, supplier context exposure or autonomous procurement action is
  enabled.

## Risks and follow-up gates

1. Domain events remain best-effort and process-local. Durable outbox, replay,
   retries, dead-letter operations and monitoring remain platform gates.
2. Supplier currency choices reflect the currently implemented USD/ZWG enum;
   future markets must extend country/currency configuration without embedding
   currency decisions in procurement logic.
3. The Supplier workspace has verified English catalogue copy. ChiShona and
   isiNdebele terminology still requires native/professional review.
4. Supplier-code uniqueness applies only to non-null active contacts. Existing
   owner-controlled contact soft-removal and approval rules remain authoritative.
5. Production remains schema-gated until the exact DDL above is independently
   reviewed and hand-applied; application deployment must not assume the new
   columns exist before that gate.

## Rollback

Revert the supplier routes/UI, metadata/search/event adoption, PO/expense
validation, tests and documentation together. The nullable contact columns,
checks and derived-search constraint may remain dormant; do not drop them in an
incident rollback. Existing contacts, purchase orders, expenses, journals,
stock movements, document numbers and audit evidence remain intact.

## Next mission

P4-002 — purchase requisition → RFQ → purchase order → goods receipt with an
approval step, reusing canonical suppliers, existing purchase-order tables and
the append-only inventory movement service.
