# P4-004 — Supplier Performance and Spend Analytics

**Status:** Approved by the product owner for implementation  
**Programme:** 4 — Procurement and suppliers  
**Type:** Read-only procurement and Accounts Payable reporting  
**Depends on:** P1-005 events; P1-006 canonical search; P4-001 suppliers; P4-002 procurement lifecycle; P4-003 supplier bills

## Outcome

An authorised tenant user can review supplier spend, delivery performance,
strict-match exceptions and open GRNI/AP exposure for a bounded period from one
responsive Procurement view. Every amount is calculated with exact minor-unit
arithmetic, reports in the tenant's base currency and retains the original
transaction currency and immutable rate source.

This mission is a read model. It creates no supplier, purchase, stock, bill,
journal, audit or financial write and does not change posted history.

## Current behaviour

- Canonical suppliers are the vendor role of `contacts`; POs, goods receipts and
  posted supplier bills already retain tenant, supplier, currency, rate, amount
  and lifecycle evidence.
- Goods receipts post Inventory/GRNI through the journal service and emit
  `stock.moved`; supplier bills post GRNI/input VAT/AP and emit
  `supplier_bill.posted`. Supplier changes already update P1-006 search through
  `supplier.changed`.
- P4-003 exposes deterministic match results for one bill and the statutory
  pack exposes a bounded bill-sourced AP schedule, but there is no consolidated
  supplier-performance report.
- A rejected three-way-match attempt intentionally persists no match status,
  event or audit side effect. Consequently, historical rejected attempts do
  not exist as an authoritative source and must not be invented by analytics.
- AP payment allocation is not complete. Posted supplier-bill source exposure
  can be reconciled to the AP control account, but it cannot be presented as a
  complete settled/open-item subledger.

## User, problem and measurable result

- **Users:** procurement officers/approvers, accountants and business owners
  with `procurement.read`, `accounting.read` or `reports.read`.
- **Problem:** supplier cost, delivery and matching evidence is fragmented
  across POs, receipts, bills and ledger reports.
- **Result:** one tenant-safe report explains spend and operational exceptions
  without spreadsheets or duplicate supplier records.
- **Measure:** report totals tie to posted supplier-bill/AP and receipt/GRNI
  source evidence; cross-tenant and disallowed requests return no data; the
  view reflows at 320, 640 and desktop widths; full regression gates remain
  green.

## Report contract

`GET /reports/supplier-performance` accepts strictly validated query values:

- `from`: first included UTC calendar date;
- `to`: last included UTC calendar date;
- `asAt`: exposure cut-off, on or after `to`;
- optional `supplierId`: one canonical tenant supplier; and
- the period is inclusive and cannot exceed 366 calendar days.

The response states generation time, selected dates, tenant provisional entity
scope, base currency, applied supplier filter, calculation bases and known
coverage limitations. HTTP caching is `private, no-store`.

### Spend

- Spend is the gross obligation of `POSTED` supplier bills whose `posted_at`
  falls in the selected period.
- Original subtotal, tax and gross totals are grouped by canonical supplier and
  original currency.
- Base gross uses the immutable supplier-bill AP journal evidence and therefore
  follows the exact posting-time exchange-rate and rounding result. Base net and
  tax use each bill's snapshotted rate before aggregation; report tie-outs make
  any journal/source difference visible.
- Draft bills, POs and receipts are not described as recognised spend.

### Delivery performance

- The eligible population is fully received purchase orders whose final
  `received_at` date is inside the selected period and which have an
  `expected_date`.
- A PO is on time when the UTC calendar date of final receipt is on or before
  its expected UTC calendar date. Partial receipts are not counted separately;
  the final receipt determines supplier delivery completion.
- Counts and an integer basis-point rate are returned per supplier and in the
  summary. Missing expected dates are disclosed and excluded from the rate.

### Price variance and strict-match blocks

- Posted price variance is always zero under P4-003's exact-match policy and is
  returned with the policy label `STRICT_EXACT_MATCH`.
- Current draft bill lines in the selected bill-date period are compared to
  their approved PO prices. Non-zero draft price variance retains original
  currency and translates at the PO's immutable rate for comparison only.
- The existing P4-003 evaluator is reused for current draft bills. Stable block
  reason counts and affected bill/supplier identifiers are returned; reasons
  are calculation facts, not persisted posting-attempt history.
- The response explicitly labels historical blocked-attempt coverage as
  unavailable because P4-003 correctly rolls every failed post back with zero
  side effects.

### Open GRNI and AP exposure

- Open GRNI as at the cut-off is receipt line value less posted matched bill net
  value for the same PO line. Both sides use their canonical source amounts and
  the PO's immutable rate. It is grouped by supplier/original currency and
  reconciled to the GRNI control balance.
- Bill-sourced AP exposure is the AP journal value of posted supplier bills as
  at the cut-off, grouped by supplier/original currency and reconciled to the AP
  control balance.
- Until payment allocation is implemented, AP is labelled
  `SOURCE_SCHEDULE_NOT_COMPLETE_OPEN_ITEM_SUBLEDGER`. Differences between the
  source schedule and control account remain visible rather than being hidden
  or allocated heuristically.
- Negative or non-zero reconciliation differences are valid exception signals,
  not silently overwritten totals.

## Permissions, tenant isolation and data protection

- The route accepts any of `procurement.read`, `accounting.read` or
  `reports.read`; it performs no write and grants no related mutation ability.
- Tenant and actor identity come only from the verified JWT. Every query scopes
  headers, lines, contacts, accounts and journals by that tenant.
- An optional supplier ID is revalidated against the tenant's canonical vendor
  role. Another tenant's ID returns a safe not-found response.
- Results include business names, document identifiers, currency, dates,
  amounts and control facts only. Addresses, contact details, bank data, notes,
  tax identifiers and credentials are excluded.
- Report reads are not material mutations and do not create audit-log noise.

## Kernel, search and event behaviour

- Supplier identity and discovery remain the P4-001 canonical projection and
  P1-006 search index; no supplier analytics master or second supplier table is
  introduced.
- The report reads canonical POs, receipts, bills and append-only journal
  evidence at request time. It does not use an event-only balance or cache,
  because the current P1-005 bus is best-effort and process-local.
- Existing `supplier.changed`, `stock.moved` and `supplier_bill.posted` facts
  continue to refresh search and identify committed source changes for later
  durable projections. Missed events cannot make this live canonical report
  incorrect.
- No new table, materialised aggregate, financial event or background write is
  required for P4-004.

## Exactness and failure behaviour

- Money enters calculations as decimal strings and is converted to `bigint`
  minor units. Rates use the existing snapshotted six-decimal conversion rule;
  authoritative totals never accumulate JavaScript floating-point values.
- Quantities use exact thousandths where comparisons or disclosure require
  them. Percentages use integer counts/basis points.
- Invalid dates, reversed/oversized periods, invalid supplier IDs, missing
  tenant context and unavailable control accounts fail with a safe response.
- A no-data period returns a complete zero/empty report, not an exception.
- Because the report is read-only, a failure leaves every operational,
  financial, numbering, audit and event record unchanged.

## Finance readiness

- **Accounting event:** none; this is a read-only explanation of existing
  procurement and posted-ledger evidence.
- **Journal:** none; source journals remain the P4-002 receipt and P4-003 bill
  postings through the approved journal service.
- **Legal entity:** tenant is explicitly disclosed as the current provisional
  surrogate; multi-entity claims remain blocked.
- **Currency:** original currency and immutable PO/bill rate trace remain with
  every grouped amount; base values never use a current rate.
- **Tax:** spend discloses snapshotted bill tax but neither redetermines tax nor
  claims a filing result.
- **Audit:** no new audit event; source receipt, bill and journal audits remain
  authoritative.
- **Reversal:** not applicable to this read model; source corrections remain
  controlled offset/reversal workflows.
- **Explanation:** every metric states its population, date basis, currency and
  reconciliation result.
- **AI:** AI may later explain this permission-safe read model; it cannot alter
  calculations, approve suppliers, waive matches or post anything.
- **Permission:** one of the three existing read permissions; no write authority
  is implied.

Supplier analytics and AP/GRNI presentation remain technical management
information. Qualified accounting review is required before any statutory,
assurance or complete open-item claim.

## Mobile, accessibility and localisation

- Procurement gains a `Supplier analytics` section with labelled period and
  supplier controls, an explicit refresh action, loading/error/retry/empty
  states and textual explanations for every status.
- Summary cards, supplier rows and exception tables reflow without horizontal
  page overflow at 320, 640 and desktop widths. Tables use the existing
  responsive labelled-cell pattern where appropriate.
- Keyboard focus, headings, table captions, live result/error messages and
  non-colour reconciliation labels are required.
- All new user-facing copy lives in the typed English catalogue. Stored codes,
  dates, currencies and reason codes remain locale-neutral. ChiShona and
  isiNdebele terminology requires native/professional review before enablement.

## Scope

- Exact, tenant-scoped supplier-performance report service and validated API.
- Spend, final-delivery on-time rate, draft price variance/current strict-match
  reasons, open GRNI and source-scheduled AP exposure with control tie-outs.
- Canonical supplier filtering and P1-006-compatible supplier discovery.
- Responsive Procurement analytics view and typed English copy.
- Focused tenant/RBAC, period, exactness, currency, partial receipt/bill,
  reconciliation, block reason, empty and UI-governance tests.
- Completion report, changelog, finance architecture and roadmap updates.

## Out of scope

- Supplier scorecards with subjective ratings, sanctions/verification,
  contracts, quality inspection, returns, service receipt or supplier portal.
- Historical rejected-post attempt logging, match tolerance/waiver approvals,
  predicted delivery, benchmarking or AI recommendations.
- AP payments/allocations, supplier statements, complete open-item accounting,
  tax filing, consolidation or legal-entity isolation.
- New write permissions, financial postings, schema, durable analytics
  projection/outbox, scheduled report distribution, CSV/PDF or external sends.

## Acceptance criteria

- Mission pack is committed before implementation.
- One canonical Supplier/PO/receipt/bill/journal source is reused; no duplicate
  master or analytics balance becomes authoritative.
- API input is zod-validated, private/no-store, permission-gated and tenant-safe,
  including cross-tenant supplier filters.
- Spend uses posted supplier bills, retains original currency and ties base
  gross to AP source journals with exact minor-unit arithmetic.
- On-time delivery uses the documented final-receipt population and returns
  explainable counts plus integer basis points.
- Posted price variance remains zero under strict match; current draft variance
  and P4-003 block reason counts are deterministic and clearly labelled as
  current rather than historical attempts.
- GRNI and AP schedules retain original currency, use immutable rate evidence
  and expose control-account differences; incomplete AP allocation is visible.
- Empty, invalid, permission, tenant, rounding, partial-receipt/bill and
  reconciliation tests pass without writes or cross-tenant leakage.
- UI works at 320, 640 and desktop widths with catalogue copy, labels,
  keyboard/accessibility contracts and no colour-only meaning.
- `COMPLETION.md` has a `Production migration` heading stating that P4-004 adds
  no DDL. No production `drizzle-kit push`, `db:push` or shared-Supabase command
  is run.
- `test:db:prepare`, full server suite, both typechecks, web build, relevant
  shell/design/accessibility checks and `git diff --check` pass before merge.

## Rollout and rollback

P4-004 is additive application code with no schema or financial mutation.
Rollout enables the authenticated report and Procurement section together.
Rollback reverts the route, report service, UI, tests and documentation. Source
POs, receipts, bills, journals, audit records, events and search documents are
unchanged and require no data rollback.
