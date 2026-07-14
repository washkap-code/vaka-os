# P6-009 — Financial Reporting and Billing Accessibility

**Status:** Implementation complete; all local release gates passed; remote release pending
**Programme:** 6 — Application shell, navigation and workbench
**Type:** Frontend accessibility remediation and localisation adoption
**Depends on:** P6-001 design system; P6-005 legacy field and modal patterns; P2-003 VAT technical report; statutory report-pack foundation

## Outcome

Authorised tenant users can navigate read-only financial reports, inspect report
tables, apply existing technical-preview periods, understand errors and review
their subscription and platform invoices with keyboard, touch, zoom and
assistive technology. Selected content remains usable at 320 CSS pixels without
changing any accounting, tax, billing or entitlement behaviour.

This mission follows the W3C-recommended WCAG 2.2 baseline and WAI-ARIA tab and
table guidance. It is a bounded accessibility wave, not a whole-product
accessibility certification or professional accounting/tax approval.

## Current behaviour

- Report navigation is visually tab-like but does not expose tablist, tab,
  selected-state or tabpanel relationships.
- Profit and loss, balance sheet, aged receivables, journal, VAT evidence and
  platform-invoice tables are not consistently labelled or keyboard-scrollable
  local regions.
- The VAT action group uses a visible form label without an associated control.
- VAT errors are not consistently announced as alerts and report loading states
  are not explicitly live.
- Billing and most core report labels remain embedded in the component instead
  of the typed English catalogue.
- Upgrade-request success and failure feedback share one visual treatment and
  are not consistently announced.

## Target behaviour

1. Expose report navigation as a labelled tablist with named tabs,
   `aria-selected`, keyboard focusability and labelled tabpanels.
2. Wrap selected native tables in labelled, focusable local scroll regions;
   journal entry tables receive entry-qualified names.
3. Associate selected report-period fields with their visible labels and expose
   action sets as named groups rather than fake form fields.
4. Announce recoverable errors as alerts, successful upgrade requests as status
   messages and loading state with appropriate live semantics.
5. Move selected Reports, Billing and upgrade-feedback copy into the typed
   English catalogue while preserving locale-independent API values.
6. Keep selected report and billing surfaces operable without page-level
   horizontal overflow at 320 and 640 CSS pixels.
7. Extend permanent conformance checks so loss of selected tab, table-region,
   field, live-feedback and reflow contracts fails locally and in CI.

## User and measurable business result

- **Users:** Authorised owners, finance users and read-only users reviewing
  company performance, statutory technical previews and VAKA subscription
  evidence.
- **Problem:** Financial evidence is harder to navigate and interpret when tabs,
  tables, errors and period controls lack consistent accessible semantics.
- **Result:** Report sections expose correct navigation and relationships;
  financial and billing tables remain locally navigable; report controls and
  feedback are announced; narrow screens retain all evidence.
- **Measure:** Static negative-self-testing contracts pass; browser inspection
  finds one selected tab and a labelled panel; all selected controls and table
  regions are named; document width equals viewport width at 320 and 640 CSS
  pixels; existing finance and billing gates remain green remotely.

## Finance, permissions, audit, data and failure behaviour

- The Finance & Accounting Intelligence Architecture remains authoritative.
- No posted transaction, journal line, balance, tax result, currency snapshot,
  ageing bucket, report period default or report calculation changes.
- No operational module writes to the ledger. No new accounting event or
  journal is created by this presentation-only mission.
- VAT and statutory outputs remain explicitly technical previews and retain
  their existing professional-review warnings.
- Existing server-derived report, billing and subscription permissions and
  tenant scope are unchanged. UI visibility is never authority.
- Existing download, upgrade-interest and billing APIs and audit behaviour are
  unchanged. Upgrade feedback does not claim that a plan changed.
- Existing API failures remain visible and are not retried automatically.
- No financial, subscription or tenant data is sent to a new provider.

## Finance Readiness Questions

1. **Accounting event:** None; this mission changes presentation only.
2. **Journal:** None.
3. **Legal entity:** Existing tenant scope is unchanged; canonical future legal-
   entity limitations remain declared on the statutory preview.
4. **Currency:** Existing report currency and formatting paths are unchanged.
5. **Tax:** Existing country-configured technical VAT report is unchanged.
6. **Audit event:** Existing report/download/upgrade behaviour is unchanged; no
   new material financial action is added.
7. **Reversal:** Not applicable because no financial write occurs.
8. **Explanation:** Existing report evidence, warnings and tie-outs are retained.
9. **AI:** No AI is involved.
10. **Permission:** Existing server-derived `reports.read` and billing access
    rules remain authoritative.

## Localisation, mobile and AI

- Migrated copy is added to the typed English catalogue. ChiShona and
  isiNdebele activation remains gated on the localisation framework, native
  review and qualified finance/tax terminology review.
- Controls tolerate text expansion and stack at 320 CSS pixels; native tables
  retain labelled local horizontal scrolling instead of widening the page.
- No AI is involved. Deterministic ledger, tax, currency, permission and billing
  rules remain authoritative.

## Scope

- Reports page heading, report-tab navigation and selected read-only tables.
- VAT and statutory technical-preview period controls, action groups, loading
  and error presentation.
- Billing summary, platform-invoice table and non-payment/escrow explanation.
- Upgrade-interest success/error announcement semantics.
- Typed English catalogue, responsive CSS, permanent accessibility scanner and
  completion evidence.

## Out of scope

- Any report calculation, accounting/tax/currency logic, ledger or statutory
  behaviour; Phase 0 finance restrictions remain in force.
- Filing-ready VAT returns, annual accounts, professional approval, new report
  formats, new charts, email/WhatsApp delivery or document-template changes.
- Billing prices, trial duration, subscriptions, payments, collections,
  entitlement enforcement or arrears lifecycle changes.
- Imports, captures, bank matching/reconciliation actions and opening-stock
  posting; these require a separate high-risk workflow mission.
- Remaining Platform Admin overview/tenant/operations tables; these require a
  separate platform-operations wave.
- Schema/API migrations, new dependencies, production data operations,
  accessibility certification or legal/accounting/tax opinion.

## Acceptance criteria

- Mission Pack is committed before implementation.
- Exactly one report tab exposes selected state and controls a labelled panel.
- Selected report and billing tables remain native tables inside labelled,
  keyboard-scrollable regions.
- Selected controls, action groups, loading and error/success messages expose
  correct names, roles and states.
- Selected pages have no page-level horizontal overflow at 320/640 CSS pixels.
- Report values, calculations, warnings, downloads, API requests, permissions,
  audit effects, billing and entitlements remain unchanged.
- Accessibility and design-token conformance, TypeScript, shell, invoice PDF,
  applicable finance/billing tests, production build, browser checks,
  `git diff --check` and remote quality gates pass.

## Rollback

Revert the scoped component, catalogue, CSS, scanner and documentation changes.
No schema, data, API, ledger, tax, billing or production-database rollback is
needed.
