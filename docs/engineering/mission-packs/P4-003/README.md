# P4-003 — Supplier Bills and Enforced Three-Way Match

**Status:** Approved by the product owner for implementation
**Programme:** 4 — Procurement and suppliers
**Type:** Supplier-bill, three-way-match and Accounts Payable posting control
**Depends on:** P2-001 journal controls; P2-002 effective-dated tax; P4-001 canonical suppliers; P4-002 controlled PO and goods receipt

## Outcome

An authorised tenant can capture and amend an unposted supplier bill against an
approved purchase order, see an explainable PO ↔ goods receipt ↔ bill match,
and post Accounts Payable only when supplier, currency, line identity,
quantity, price and effective-dated tax evidence pass. Posting is idempotent,
tenant-scoped, concurrency-safe, audited and routed exclusively through the
existing balanced append-only journal service.

## Current behaviour

- P4-002 receives stock through numbered goods receipts and posts Dr Inventory /
  Cr GRNI. It deliberately does not recognise Accounts Payable or input VAT.
- Purchase orders, lines, receipts and receipt lines are canonical, tenant-safe
  records. Suppliers remain the canonical contact with `is_vendor = true`.
- The generic expense command can post an immediate cash expense but is not a
  supplier-bill, open-item or procurement-match workflow.
- VAKA has no supplier-bill document, supplier-invoice duplicate control,
  deterministic three-way-match result, AP due date or bill-based AP schedule.

## Target lifecycle

1. A user with `accounting.post` captures a `DRAFT` supplier bill against one
   same-tenant approved PO. Supplier identity and bill currency are derived and
   checked against that PO. The draft records supplier invoice number, bill/tax
   date, due date, bill exchange-rate snapshot and one line per selected PO line.
2. Each bill line records billed quantity, PO-currency unit price and tax
   treatment. The applicable rate/effective window is resolved from the
   tenant's country pack on the bill tax date and snapshotted; clients cannot
   invent or override the statutory rate.
3. An authorised user may replace the complete contents of a `DRAFT` bill.
   Every update revalidates tenant-owned PO/product lineage, recalculates exact
   totals and audits the before/after control facts. Posted bills are immutable.
4. A deterministic match evaluator returns `MATCHED` or `BLOCKED` plus bounded,
   line-specific reason codes and plain explanations. It compares:
   - bill supplier and currency to the PO;
   - every bill line to exactly one PO line;
   - bill unit price to the approved PO unit price with zero automatic tolerance;
   - cumulative posted billed quantity plus this bill to ordered quantity; and
   - cumulative posted billed quantity plus this bill to physically received
     quantity as at posting.
5. `POST /supplier-bills/:id/post` requires `accounting.post`, an idempotency
   key and current confirmation. It locks the bill and PO, recomputes the match
   inside the posting transaction and refuses every mismatch before allocating
   a bill number, creating AP/tax journals or changing state.
6. A successful post assigns an immutable sequential `BILL` number, changes the
   bill to `POSTED`, records match evidence and posts the balanced journal.
7. P4-003 does not pay the bill. AP allocation, outbound payment, credit notes,
   debit notes and supplier statements require later controlled missions.

## Permissions and segregation of duties

- `procurement.read` can inspect PO, receipt, supplier-bill and match evidence.
- `accounting.read` can inspect supplier bills and AP schedule evidence.
- `accounting.post` can create/update drafts and post only matched bills.
- Procurement Approver retains `procurement.approve` without `accounting.post`.
- Accountant retains `accounting.post` and `procurement.read` without
  `procurement.approve`.
- Owner/Admin can perform both for small-business continuity, but permission
  assignments keep PO approval and bill posting separable. Hard four-eyes bill
  posting, thresholds and delegated authority matrices remain a follow-on
  policy layer; the server never treats the UI as authority.

## Match policy

The initial deterministic policy is intentionally strict:

- One bill references one PO and its canonical supplier.
- Bill currency must equal PO currency.
- Every bill line must map to a unique PO line; unrelated and duplicate lines
  are rejected.
- Bill quantity must be positive with at most three decimals.
- Bill unit price must exactly equal the approved PO unit price in integer cents.
- Cumulative `POSTED` bill quantity cannot exceed either cumulative received
  quantity or ordered quantity. Drafts do not reserve receipt capacity.
- Multiple partial bills are allowed when each post remains within received and
  ordered quantities. PO locking serialises concurrent posts.
- Supplier invoice number is required and case-insensitively unique per active
  canonical supplier and tenant.
- No percentage/absolute tolerance, substitution, unplanned charge, landed cost,
  service line, quantity waiver or price-variance approval is silently applied.
  Those require explicit later workflows and accounts.

The evaluator emits stable reason codes such as `SUPPLIER_MISMATCH`,
`CURRENCY_MISMATCH`, `LINE_NOT_ON_PO`, `PRICE_MISMATCH`,
`QUANTITY_EXCEEDS_RECEIVED`, `QUANTITY_EXCEEDS_ORDERED`,
`DUPLICATE_SUPPLIER_INVOICE` and `NO_RECEIPT_EVIDENCE`. Error responses and UI
show safe explanations without leaking another tenant's record existence.

## Finance readiness

- **Accounting event:** acceptance of a matched supplier obligation and input
  tax evidence after inventory receipt.
- **Journal:** debit GRNI for the matched goods value at the PO/receipt base
  snapshot; debit VAT Input for effective-dated eligible standard tax; credit AP
  for the supplier bill gross amount at the bill exchange-rate snapshot. Any
  base-currency difference caused solely by the bill-vs-receipt rate is posted
  to the existing FX gain/loss system account so the entry balances and the
  cleared GRNI amount remains explainable.
- **Legal entity:** tenant remains the documented provisional surrogate.
- **Currency:** original bill currency, bill rate and PO/receipt rate remain
  immutable snapshots. Core logic does not infer a live rate.
- **Tax:** treatment and effective rate window are resolved from the tenant
  country pack on the bill tax date. Standard, zero-rated and exempt stay
  distinct. Input VAT eligibility/registration remains subject to qualified
  market review; the system records deterministic configured evidence, not tax
  advice.
- **Audit:** draft create/update and successful post record material control
  facts, match result, source IDs, totals, currency and tax evidence without
  copying supplier personal/contact details.
- **Reversal:** posted bill and journal are immutable. Correction requires a
  future controlled supplier credit/debit note or reversing document; no edit,
  delete or direct ledger mutation is exposed.
- **Explanation:** bill detail retains PO, receipt-derived quantities, line
  comparisons, rate/tax snapshots, match codes and journal source lineage.
- **AI:** AI may later explain read-only match evidence but cannot create,
  modify, waive, approve or post a bill.
- **Permission:** `accounting.post`, distinct from procurement approval.

The AP/input-tax/FX treatment requires qualified Zimbabwean accountant and tax
review before market GA. This mission is a deterministic technical control, not
professional approval or a filing claim.

## Data model

Additive records:

- `supplier_bills`: tenant, canonical supplier, PO, nullable internal number,
  supplier invoice reference, lifecycle, dates, currency/rate, tax jurisdiction,
  exact totals, match evidence, idempotency and actor/time evidence;
- `supplier_bill_line_items`: tenant, bill, PO line, product, quantity, unit
  price, net/tax/gross totals and effective-dated tax snapshot; and
- indexes/checks for tenant number, tenant/supplier invoice uniqueness, PO,
  status, line identity and posting idempotency.

No supplier, company, PO, receipt, product, tax-rate or journal master is
duplicated. Receipt quantities are read from canonical goods-receipt lines.

## Kernel and operational behaviour

- Verified JWT identity and server RBAC determine tenant, actor and authority.
- Every write uses strict zod validation and bounded text.
- Exact money uses integer cents and quantity comparison uses exact thousandths.
- Draft create/update and post use the audit service within their transactions.
- Posting calls the existing journal service; operational code never inserts
  journal headers or lines directly.
- A typed, identifier-only `supplier_bill.posted` event is emitted after commit
  for future AP/search/report consumers. No external message is sent.
- Bill and PO locks plus unique constraints protect concurrent posting,
  duplicate invoice references and idempotent retries.
- AP reporting reads bill/journal source evidence. It must not infer open items
  from obsolete receipt-to-AP assumptions.

## Validation, failure and data protection

- IDs are revalidated under tenant scope; foreign IDs return a safe not-found
  result before mutation.
- Missing receipts, price/quantity/currency/supplier differences, duplicate
  supplier invoice references, unsupported tax evidence, invalid rates,
  already-posted state and changed idempotent payloads fail closed.
- A blocked post leaves bill status, document number, AP/VAT/GRNI/FX journal,
  audit and event state unchanged. The draft and explainable match result remain
  available for correction.
- Posting number, status, match evidence, journal and audit commit atomically.
- Notes and invoice references are bounded. Match/event/audit metadata contains
  identifiers and control facts only, not addresses, bank details or tax IDs.

## Mobile, accessibility and localisation

- Procurement gains a Supplier Bills section with responsive cards and a
  match-evidence view at 320, 640 and desktop widths.
- Draft forms use labelled controls, line-qualified accessible names, contained
  dialog focus, keyboard actions, visible busy/error/empty states and no
  colour-only match meaning.
- All new UI copy lives in the typed English catalogue. Stored codes, currency,
  dates and match reason codes remain locale-neutral. ChiShona and isiNdebele
  financial/procurement terminology requires professional/native review.

## Scope

- Supplier-bill draft create/list/detail/full-draft-update.
- Effective-dated line tax resolution and immutable snapshots.
- Explainable strict three-way-match evaluation.
- Idempotent, concurrency-safe matched posting through the journal service.
- GRNI clearing, input VAT and AP recognition with rate-difference balancing.
- Supplier-bill AP source integration, audit, event, permissions, UI and tests.
- Additive migration, completion report, changelog and roadmap update.

## Out of scope

- Tolerance/waiver approvals, unplanned charges, freight/landed cost, services,
  non-PO bills, recurring bills, OCR/capture automation and supplier portal.
- Bill payment, payment proposal, bank initiation, allocations, supplier
  statement reconciliation, withholding/reverse charge and fiscalisation.
- Credit/debit notes, returns, receipt reversal and posted-bill reversal.
- Multi-entity accounting, budgets, period locks, durable outbox and AI action.

## Acceptance criteria

- Mission pack is committed before implementation.
- Canonical supplier/PO/receipt/product/journal/tax services are reused.
- AP cannot post before a fresh in-transaction three-way match returns matched.
- Mismatches return stable, clear line-specific reasons with zero journal,
  number, state, audit or event side effects.
- Partial receipts/bills work; cumulative billed quantity cannot exceed received
  or ordered quantity under concurrent posting.
- Successful posting is idempotent, allocates one immutable bill number, posts
  one balanced journal through the existing service, clears only matched GRNI,
  recognises configured input VAT and creates mandatory audit evidence.
- PO approval and bill posting remain independently assignable permissions.
- Posted bills and financial history are immutable; draft updates are bounded
  and audited.
- Tenant/RBAC, duplicate supplier invoice, tax-date, FX, rounding, rollback,
  concurrency and AP/GRNI/VAT journal tests pass.
- UI/catalogue/accessibility/reflow and bill-based AP report coverage pass.
- Exact additive production SQL appears in `COMPLETION.md`; no production
  `drizzle-kit push`, `db:push` or shared-Supabase DDL is run.
- Full DB-backed suite, both typechecks, web build, relevant shell/design/a11y
  gates and `git diff --check` pass before merge.

## Rollback

Revert routes/services/UI/permissions/event/report consumers only through a
reviewed rollback. Additive bill tables may remain dormant. Never drop posted
bills, journals, match evidence, sequential numbers or audits. Posted AP/GRNI/
VAT/FX balances require normal accounting reconciliation and controlled future
reversal, not destructive migration.
