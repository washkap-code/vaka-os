# P6-014 — Imports, Capture and Bank Review Accessibility

**Status:** Implementation complete; all local release gates passed; remote release pending
**Programme:** 6 — Application shell, navigation and workbench
**Type:** Frontend accessibility remediation and localisation adoption
**Depends on:** P6-001 design system; P6-005 legacy field and modal patterns; existing import, capture and bank-reconciliation services

## Outcome

Authorised tenant users can upload and review captured documents, preview
supported CSV imports, inspect import evidence, and review existing bank and
reconciliation information with keyboard, touch, zoom and assistive technology.
Dense records remain usable at 320 CSS pixels without changing any import,
inventory, bank, accounting, permission, audit or approval behaviour.

This mission follows the W3C-recommended WCAG 2.2 baseline and WAI-ARIA dialog,
form and table guidance. It is a bounded accessibility wave, not a whole-product
accessibility certification or a professional accounting approval.

## Current behaviour

- Several bank-account, statement-balance and CSV controls have visible text
  without a programmatically associated label.
- Capture, import-preview, saved-reconciliation and bank-line tables are not
  consistently labelled or keyboard-scrollable local regions.
- The capture-review dialog does not use the shared focus trap, Escape handling
  and focus-restoration primitive.
- Success, validation guidance and API failures share one warning presentation
  and are not consistently announced with the correct live semantics.
- Dense import and bank action surfaces rely on incidental wrapping and do not
  have a documented mobile reflow contract.
- Selected accessible names and feedback copy are absent from the typed English
  catalogue and permanent conformance scanner.

## Target behaviour

1. Associate selected import, bank-account and reconciliation controls with
   stable visible labels, descriptions and native input semantics.
2. Use the shared accessible modal for capture review, including initial focus,
   focus containment, Escape dismissal and focus restoration.
3. Wrap capture, import-preview, saved-reconciliation and bank-line tables in
   labelled, focusable local scroll regions with readable minimum widths.
4. Announce successful operations as status messages and recoverable errors as
   alerts while preserving the exact existing failure and retry behaviour.
5. Name action groups and status summaries where visual proximity alone is not
   sufficient for assistive technology.
6. Move selected accessible names and feedback copy into the typed English
   catalogue while preserving locale-independent API values.
7. Keep selected import, capture and bank-review surfaces operable without
   page-level horizontal overflow at 320 and 640 CSS pixels.
8. Extend permanent conformance checks so loss of selected field, modal,
   table-region, feedback and reflow contracts fails locally and in CI.

## User and measurable business result

- **Users:** Authorised owners, operations users, finance preparers and finance
  approvers using existing import, capture and bank-review capabilities.
- **Problem:** High-evidence workflows are difficult to navigate and interpret
  when fields, dialogs, tables, actions and feedback lack consistent accessible
  relationships.
- **Result:** Selected controls and evidence are named, dialog focus is safe,
  feedback is announced correctly, dense tables scroll locally, and narrow
  screens retain the complete workflow.
- **Measure:** Static negative-self-testing contracts pass; browser inspection
  finds associated controls, one correctly named capture dialog and labelled
  table regions; document width equals viewport width at 320 and 640 CSS pixels;
  existing import, capture, bank and finance tests remain green.

## Finance, inventory, permissions, audit, data and failure behaviour

- The Finance & Accounting Intelligence Architecture remains authoritative.
- No import parser, duplicate rule, validation result, stock quantity, cost,
  bank amount, reconciliation figure, match result, journal, tax treatment,
  currency snapshot or report calculation changes.
- Opening-stock approval and existing bank-fee, transfer and invoice-match
  actions continue through their existing authorised services. No operational
  module gains a direct ledger write path.
- Existing server-derived tenant scope, permissions, read-only state and
  approval separation remain unchanged. UI visibility is never authority.
- Existing capture, import, matching, reconciliation, download and audit effects
  are unchanged. A status message never claims an action the API did not confirm.
- Existing API failures remain visible and are not retried automatically.
- No financial, tenant, document or personal data is sent to a new provider.

## Finance Readiness Questions

1. **Accounting event:** None added; this mission changes presentation only.
2. **Journal:** None added or modified.
3. **Legal entity:** Existing tenant scope remains unchanged; future canonical
   legal-entity limitations are not altered.
4. **Currency:** Existing account, import and report currency behavior is unchanged.
5. **Tax:** Existing tax and opening-stock behavior is unchanged.
6. **Audit event:** Existing service-owned audit behavior is unchanged.
7. **Reversal:** Not applicable because this mission adds no financial write.
8. **Explanation:** Existing previews, warnings, statuses and evidence remain visible.
9. **AI:** No AI is involved.
10. **Permission:** Existing server-derived import, bank, accounting and approval
    permissions remain authoritative.

## Localisation, mobile and AI

- Migrated copy is added to the typed English catalogue. ChiShona and
  isiNdebele activation remains gated on the localisation framework, native
  review and qualified finance terminology review.
- Controls tolerate text expansion and stack at 320 CSS pixels; native tables
  retain labelled local horizontal scrolling instead of widening the page.
- No AI is involved. Deterministic validation, stock, bank, accounting,
  permission and approval rules remain authoritative.

## Scope

- Import Centre capture upload, capture list and capture-review dialog.
- Import type/account/file controls, CSV schema guidance, preview summary and
  preview table.
- Existing bank-reconciliation summary, worksheet inputs and action group.
- Existing saved-reconciliation and recent-bank-line tables and action groups.
- Typed English catalogue, responsive CSS, permanent accessibility scanner and
  completion evidence.

## Out of scope

- Any API, schema, import parser, duplicate detection, stock, bank matching,
  reconciliation, download, accounting, tax, currency, permission, audit or
  approval behavior.
- New imports, bank feeds, OCR, automated matching, PDF reports, document
  delivery, filing or professional accounting approval.
- Replacing existing confirmation or split-allocation workflows.
- Schema/API migrations, new dependencies, production data operations,
  accessibility certification or legal/accounting/tax opinion.

## Acceptance criteria

- Mission Pack is committed before implementation.
- Selected controls expose stable names and descriptions.
- Capture review uses the shared modal focus and dismissal behavior.
- Selected tables remain native tables inside labelled, keyboard-scrollable
  regions and selected row actions expose meaningful group names.
- Success and error messages expose correct roles without changing requests or outcomes.
- Selected pages have no page-level horizontal overflow at 320/640 CSS pixels.
- Import validation, preview and commit requests, capture review, bank matching,
  reconciliation, downloads, permissions, audit and finance effects remain unchanged.
- Accessibility and design-token conformance, TypeScript, shell, invoice PDF,
  applicable import/capture/bank tests, production build, browser checks,
  `git diff --check` and remote quality gates pass.

## Rollback

Revert the scoped component, catalogue, CSS, scanner and documentation changes.
No schema, data, API, ledger, tax, inventory or production-database rollback is
needed.
