# P2-006 — Statutory Report Pack Export

**Status:** Approved for bounded technical-preview implementation
**Programme:** 2 — Finance, tax and localisation (Zimbabwe)
**Type:** Read-only posted-ledger report pack, CSV/PDF export and UI adoption
**Depends on:** P2-002 finance/tax model; posted journal integrity; P2-003 export patterns

## Outcome

An authorised finance user can select a reporting period/as-at date and export
one reconcilable technical report pack containing trial balance, profit and
loss, balance sheet, aged receivables and aged payables to CSV or PDF. Every
figure is derived from posted journal evidence and displayed in the tenant base
currency with explicit coverage, legal-entity and professional-review caveats.

This is a technical accounting pack for review. It is not a signed statutory
filing, audited financial statement, complete Zimbabwe compliance pack, IFRS
opinion, tax advice or accountant approval.

## Current behaviour

- `trialBalance`, `profitAndLoss` and `balanceSheet` read journal/account data,
  but there is no unified period contract, cross-report tie-out or pack export.
- The current trial-balance as-at join can include journal lines whose entries
  fall after the selected date; P2-006 must correct and regression-test it.
- Existing aged receivables is a useful original-currency operational view over
  invoice cached balances, not a posted-ledger/base-currency pack schedule.
- The Accounts Receivable and Accounts Payable control accounts exist in the
  chart. Invoice/payment journals carry invoice source IDs; purchase-order
  receipt journals carry PO/vendor source IDs.
- VAKA has no complete supplier bill, due-date, allocation, AP payment or open-
  item subledger. AP control balance may therefore contain entries that cannot
  be aged to a supported vendor/source.
- Tenant is the current posting owner. A separate canonical LegalEntity model
  and multi-entity consolidation do not yet exist.
- P2-003 establishes formula-safe CSV, multi-page PDF, audited export and
  explicit not-filing-ready patterns.

## Target behaviour

1. Add one strict report-period contract:
   - `from` and `to` define the P&L period;
   - `asAt` defines trial balance, balance sheet and ageing cut-off;
   - dates use `YYYY-MM-DD`, `from <= to <= asAt`, and bounded range checks.
2. Correct trial-balance as-at filtering so only lines belonging to posted
   journal entries at or before the cut-off are included.
3. Build a tenant-scoped report pack in tenant base currency from posted
   journals/accounts only:
   - trial balance by account with period cut-off;
   - P&L for the selected period;
   - balance sheet at `asAt`;
   - AR control reconciliation and invoice-source ageing schedule; and
   - AP control reconciliation and supported PO/vendor-source ageing schedule.
4. Reconcile and expose exact minor-unit checks:
   - trial-balance total debits equal total credits;
   - balance sheet balances;
   - P&L totals tie to the included income/expense lines;
   - AR/AP scheduled balances plus unallocated control balance equal their
     respective posted control-account balance.
5. Age AR using canonical due date, falling back to issue date, while the
   authoritative pack amount is the posted base-currency AR balance per invoice.
6. Age supported AP using the posted liability/source date because supplier due
   dates/payment terms are not implemented. Label the value `daysOutstanding`,
   not legally overdue, and disclose this limitation prominently.
7. Preserve unallocated AR/AP control amounts rather than hiding or fabricating
   open items. A non-zero unallocated amount marks the relevant schedule as
   requiring reconciliation.
8. Return a versioned JSON pack and export the same snapshot to:
   - formula-safe, sectioned UTF-8 CSV; and
   - deterministic, multi-page PDF with titles, period/as-at/base-currency,
     page numbers, section totals, tie-outs and professional-review caveats.
9. Require verified authentication and `reports.read` for JSON and both
   exports. Tenant comes only from JWT context; no tenant/legal-entity ID is
   accepted from input.
10. Audit CSV/PDF exports with period/as-at, format, pack version, base currency,
    tie-out status and counts. Do not audit full rows, customer/vendor names or
    report contents.
11. Add a responsive Reports workspace tab using typed catalogue copy for
    period selection, preview status, coverage warnings and CSV/PDF downloads.
12. Present the pack as `TECHNICAL_PREVIEW` and `notFilingReady: true` until a
    qualified Zimbabwean accountant approves fixtures, presentation, legal-
    entity scope and statutory use.

## User and measurable business result

- **User:** Owner, Administrator, Accountant or auditor with `reports.read`.
- **Problem:** Core statements exist as separate screens without one governed,
  exportable, tie-out-evidenced period pack; AP gaps can be mistaken for
  completeness.
- **Result:** One selected period produces consistent JSON/CSV/PDF sections and
  makes every coverage gap visible.
- **Measure:** Fixed fixtures tie across TB/P&L/BS/AR/AP; after-cut-off journals
  are excluded; unallocated control amounts reconcile exactly; tenant and
  permission tests deny unauthorised access; exports audit and remain safe.

## Accounting readiness answers

1. **Accounting event:** None. This mission is read-only reporting.
2. **Journal:** None created. Reports consume already-posted balanced journals.
3. **Owner:** Authenticated tenant is the provisional reporting scope; canonical
   legal-entity isolation remains unavailable and explicitly gated.
4. **Currency:** Tenant base currency only. No original currencies are summed
   and no new translation/FX calculation is introduced.
5. **Tax:** No tax calculation. Existing posted account balances flow through;
   VAT filing remains governed by P2-003 and professional approval.
6. **Audit:** CSV/PDF export only; ordinary preview reads avoid audit noise.
7. **Reversal:** Not applicable to a read. Source corrections use existing
   reversal/offsetting rules and appear in the selected period/as-at result.
8. **Explanation:** Pack version, source boundary, dates, base currency,
   formulas, tie-outs, coverage and unallocated amounts are explicit.
9. **AI:** AI has no access/action in this mission and cannot certify results.
10. **Permission:** `reports.read` on every pack read/export.

## Security, privacy and failure behaviour

- Every account, journal, source invoice/PO and contact join is tenant-scoped.
- Cross-tenant IDs are never accepted. Platform-admin access is not added.
- Query inputs are zod-validated with bounded dates; malformed/inverted ranges
  fail before database work.
- CSV formula injection is neutralised for every text cell. PDF text is escaped
  and no HTML, remote asset or user-provided path is evaluated.
- Exports use private/no-store responses and deterministic safe filenames.
- Empty ledgers return valid zero/empty sections with tie-out evidence.
- Missing AR/AP control accounts, invalid exact money, a non-balancing trial
  balance or internal tie-out failure fails closed; no misleading file is sent.
- Non-zero unallocated AR/AP does not silently fail the export: it is a visible
  reconciliation exception and keeps `reviewRequired` true.

## Localisation, accessibility and mobile

- New UI copy lives in the typed English application catalogue. ChiShona and
  isiNdebele finance terminology remains disabled pending qualified review.
- Canonical export values remain language-neutral; dates are ISO and money is
  exact base-currency text.
- The new tab uses labelled date inputs, keyboard-operable buttons, text status
  (not colour alone), responsive cards and controlled table overflow.
- PDF selectable text and logical section order are preserved within the
  repository’s current minimal renderer limits.

## Scope

- Period schema, posted-ledger pack read model and tie-out logic.
- Trial-balance as-at correctness fix and regression coverage.
- Posted-ledger AR schedule and supported-source AP schedule with unallocated
  control reconciliation.
- JSON, CSV and PDF endpoints and export audit evidence.
- Responsive Reports tab and typed English copy.
- Focused exactness, cut-off, reconciliation, empty, tenant, permission, CSV,
  PDF and audit tests.
- Finance architecture/current-state docs, master-plan status, changelog and
  Completion Report.

## Out of scope

- Filing/submission, e-signature, audit opinion, accountant sign-off workflow or
  production statutory claim.
- Supplier bill, supplier due date/terms, AP allocation/payment, credit note,
  debit note, allowance, bad-debt or full open-item subledger implementation.
- LegalEntity schema, branch/entity dimensions, consolidation, eliminations,
  comparative periods, budgets, cash-flow statement, notes/disclosures, IFRS
  mapping, retained-earnings close or financial period lock.
- Original-currency statutory presentation, FX translation or new exchange-rate
  behaviour.
- AI explanation/certification or autonomous action.
- Database migration; all work is read-only over existing tables.

## Acceptance criteria

- Mission pack is committed before implementation.
- All pack sections derive from posted journals/accounts under verified tenant
  scope; no cached invoice/PO amount is authoritative for pack totals.
- Trial-balance cut-off excludes after-as-at lines and balances exactly.
- P&L/BS tie to their section lines; balance sheet balances.
- AR/AP schedules plus unallocated amounts equal posted control balances in
  exact tenant base currency.
- AP source/date limitations are visible and never marketed as complete ageing.
- JSON/CSV/PDF share one versioned snapshot contract and period/as-at values.
- CSV is formula-safe; PDF is valid, deterministic and multi-page when needed.
- `reports.read`, tenant isolation, zod dates, private caching and export audits
  are tested.
- UI is typed-copy, responsive, labelled and keyboard operable.
- No migration or production database operation is introduced.
- Full guarded DB suite, server/web typechecks and web production build pass.

## Rollback

Revert the pack read model, export renderers/routes, trial-balance cut-off fix,
UI/catalogue changes, tests and documentation. Existing separate report routes
remain available. No schema or data rollback is required because this mission
is read-only and adds no migration.
