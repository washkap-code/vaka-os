# HOTFIX 2026-07-14 — Completion Report

**Implementation:** Complete on repair branch  
**Verification:** Available local gates passed; DB-backed route regression pending hosted CI  
**Availability:** Release pending review, merge and production deployment  
**Completed on:** 2026-07-14

## Delivered

- A minimal `accounting.read` invoice-customer endpoint that returns only active
  customer summaries from the one canonical, tenant-owned Contact entity. It
  does not require broad CRM access and never exposes vendor-only, removed or
  cross-tenant contacts.
- Explicit invoice customer loading, empty, failure and retry states. A request
  failure no longer appears as a successfully empty selector.
- A modern invoice-entry dialog with grouped details, optional dates/notes,
  persistent line labels, product/free-text choices, quantity, price and VAT
  treatment controls, line add/remove actions, responsive cards and local
  required-field guidance.
- The existing safe draft-amendment workflow preserved in the invoice record,
  with the same customer source and modern labelled line presentation.
- One shared lifecycle policy for row and record actions. Open invoice records
  now show preview/download plus Send and share and Invoice controls menus only
  when lifecycle and permission rules allow them.
- UI adoption of the P7-001 invoice email command with explicit recipient
  confirmation, a fresh idempotency key, existing recorded-consent enforcement
  and visible outcome. Secure email/WhatsApp link fallbacks remain available;
  direct governed WhatsApp delivery is not claimed.
- CI contracts for invoice action lifecycle rules, plus accessibility contracts
  for the new customer states, labelled line cards and record action group.

No invoice posting, journal, tax, stock, payment, numbering, PDF snapshot,
immutable-history or deletion behaviour changed.

## Files changed

- `server/src/routes.ts` — canonical invoice-customer read endpoint.
- `server/tests/record-management.test.ts` — permission, active-record and
  tenant-isolation coverage for invoice customer choices.
- `web/src/App.tsx` — reliable loading, modern entry/detail UI and record actions.
- `web/src/invoices/invoice-workspace-model.ts` — shared lifecycle action policy.
- `web/src/locales/app.en.ts` and `web/src/styles.css` — typed copy and responsive
  design-system presentation.
- `web/scripts/invoice-workspace-model.test.mjs`, package scripts, accessibility
  scanner and CI workflow — regression gates.
- Changelog, roadmap and P7-001 completion evidence — current behaviour record.

## Verification evidence

- Server typecheck: passed.
- Web typecheck: passed.
- Invoice lifecycle model: 2 tests passed, 0 failed.
- Accessibility conformance: passed; negative self-test remains active.
- Design-token conformance: passed across 19 governed web surfaces.
- Headless Chrome visual check at 1440×1000 and 390×844: page content rendered,
  customer choices appeared, all record action labels appeared, no Vite overlay,
  no console error and no horizontal overflow in the modal, sections, line card
  or line grid. Desktop and mobile screenshots were inspected with no overlap or
  clipped input/action content.
- Guarded DB preparation and the focused record-management suite were attempted
  with `NODE_ENV=test`; both stopped safely before connecting because this
  workspace has no explicit `DATABASE_URL`. The DB-backed route regression and
  full suite therefore remain pending hosted CI.
- Web production build: passed; 50 modules transformed. Vite retained its
  existing advisory that the main minified chunk exceeds 500 kB.
- Final `git diff --check`: passed. Conflict-copy scan: clean.

## Production migration

None. This repair adds no table, column, index, constraint or production DDL.
It must not run `drizzle-kit push` or `db:push` against the shared production
Supabase project.

## Risks and gates

1. Governed provider email remains dependent on recorded customer consent and
   approved production provider/domain configuration; failure is shown and does
   not alter the invoice.
2. WhatsApp is a user-initiated secure-link handoff. Direct provider delivery,
   opt-in evidence, delivery receipts and retries remain P7-004 planned work.
3. The hosted PostgreSQL gate must pass before merge. Production availability
   still requires merge and deployment; this report does not claim either.

## Rollback

Revert the hotfix implementation commit. The prior CRM contact endpoint and row
action menu remain available, canonical contacts/invoices remain unchanged, and
no schema, financial or data rollback is required.

## Next mission

Resume the approved programme order after this repair: merge P4-004 supplier
analytics, then build P5-003 weighted-average inventory valuation feeding COGS.
