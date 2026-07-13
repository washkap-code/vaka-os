# P6-010 — Controlled Imports and Capture Accessibility

**Status:** Implementation complete; local frontend and browser gates passed; remote quality and production release pending behind P6-008 and P6-009
**Programme:** 6 — Application shell, navigation and workbench
**Type:** Frontend accessibility remediation and localisation adoption
**Depends on:** P6-001 design system; P6-005 legacy field and modal patterns; P1-007 document service adoption; existing import and bank-reconciliation services

## Outcome

Authorised tenant users can capture and review source evidence, preview staged
CSV imports, register masked bank accounts, inspect reconciliation evidence and
operate existing controlled import/bank actions with keyboard, touch, zoom and
assistive technology. Selected workflows remain usable at 320 CSS pixels
without changing any stock, accounting, bank, permission or audit behaviour.

This mission follows the W3C-recommended WCAG 2.2 baseline and WAI-ARIA dialog
and table guidance. It is presentation remediation, not a migration-engine,
bank-connectivity, accounting or accessibility certification claim.

## Current behaviour

- Capture review uses a separate legacy overlay without the governed focus,
  Escape, scroll-lock or opener-return behaviour.
- Bank-account and reconciliation inputs include visible labels that are not
  consistently associated with their controls.
- Capture, import-preview, reconciliation and bank-feed tables are not
  consistently labelled or keyboard-scrollable local regions.
- Dense import/bank tables can compress rather than retain a readable local
  scroll surface at narrow widths.
- Success and failure feedback is visually shared and not consistently exposed
  with alert/status semantics.

## Target behaviour

1. Reuse `LegacyField` and `LegacyModal`; do not introduce competing form or
   modal abstractions.
2. Give capture review a visible/programmatic title, initial and contained
   focus, Escape close, scroll lock and opener focus return.
3. Associate selected bank, CSV and reconciliation labels and help with their
   controls.
4. Present selected native tables as labelled, focusable local scroll regions;
   dense evidence retains a readable minimum width.
5. Announce recoverable errors as alerts and successful capture/import/
   reconciliation feedback as status without exposing source evidence or bank
   identifiers to new logs or analytics.
6. Keep selected surfaces free of page-level horizontal overflow at 320 and 640
   CSS pixels.
7. Add required accessibility/table labels to typed English copy and extend the
   permanent conformance scanner.

## User and measurable business result

- **Users:** Authorised owners, administrators, import preparers/approvers,
  finance users and evidence reviewers.
- **Problem:** High-consequence staged data and bank evidence is harder to
  review safely when fields, dialogs, tables and feedback lack consistent
  accessible semantics.
- **Result:** Selected inputs and evidence are named; capture review uses the
  governed dialog; tables remain locally navigable; narrow-screen users retain
  the same warnings, evidence and actions.
- **Measure:** Static contracts pass; browser inspection finds no unnamed
  selected controls; dialog keyboard behaviour passes; table regions are named;
  document width equals viewport at 320/640 CSS pixels; existing import,
  inventory, bank, finance, permission and audit gates remain green remotely.

## Permissions, audit, data and failure behaviour

- Server permissions remain authoritative and separate:
  `imports.create`, `imports.approve`, `inventory.write`,
  `bank_accounts.read`, `bank_accounts.configure`,
  `bank_statements.import`, `bank_transactions.read`,
  `bank_transactions.match`, `bank_reconciliation.prepare`,
  `bank_reconciliation.approve`, `accounting.read` and `accounting.post`.
- Capture evidence remains tenant-scoped, encrypted through the document
  service, human-reviewed and non-posting. No OCR, AI extraction or automatic
  record creation is added.
- Existing preview/commit boundaries, row validation, duplicate handling,
  transactional rollback, replay prevention and audit evidence are unchanged.
- Existing API failures remain visible. Consequential operations are never
  retried automatically.
- No source document, CSV content, bank identifier, transaction or financial
  value is sent to a new provider, log or analytics path.

## Finance and stock invariants

- Contact/product imports retain their existing non-ledger behaviour; product
  imports do not create stock.
- Opening-stock approval retains its existing atomic service path: refuse
  pre-existing stock, append `OPENING` movements, update simple cost, post a
  balanced Inventory / Opening Balance Equity journal and audit, or roll back
  the full operation.
- Bank statement commit remains an unreviewed, duplicate-resistant, non-posting
  feed. It never marks an invoice paid or moves money.
- Invoice matching, split matching, bank fees and internal transfers retain
  existing exact-currency checks, confirmation, approved posting services,
  journal links and audit events.
- Reconciliation preparation remains a snapshot; approval remains blocked
  unless balanced with no unreviewed lines. Existing known limits—no period
  lock and no complete source-line lock—are not disguised or expanded.
- Posted journal lines and stock movements remain append-only; corrections
  remain reversal/offset-only.

## Finance Readiness Questions

1. **Accounting event:** None added. Existing opening-stock or bank actions may
   create their existing events only after the same authorised confirmation.
2. **Journal:** No journal shape changes; existing approved services remain the
   only posting paths.
3. **Legal entity:** Existing tenant scope remains; future legal-entity limits
   are unchanged.
4. **Currency:** Existing exact USD/ZWG and account/invoice snapshot rules remain.
5. **Tax:** Existing country-pack treatment is unchanged.
6. **Audit:** Existing capture/import/bank/reconciliation events remain intact.
7. **Reversal:** Existing posted corrections remain reversal/offset-only.
8. **Explanation:** Preview rows, warnings, worksheet totals and source links
   remain visible.
9. **AI:** No AI is involved.
10. **Permission:** Existing server-derived granular permissions above remain
    mandatory.

## Localisation and mobile

- New accessibility and table labels use typed English copy. ChiShona and
  isiNdebele activation remains gated on native review and qualified finance/
  banking terminology review.
- Forms stack and actions wrap at 320 CSS pixels; dense evidence scrolls only
  within labelled local regions.
- Native camera/file inputs remain available; no offline final posting,
  reconciliation approval or bank credential storage is introduced.

## Scope

- Recent-capture table and capture-review dialog.
- Import kind, masked bank-account registration and CSV selection fields.
- Import preview, saved reconciliation and recent bank-feed tables.
- Reconciliation statement inputs and selected feedback semantics.
- Typed English accessibility copy, responsive CSS, permanent conformance
  scanner and completion evidence.

## Out of scope

- Replacing existing bank match/split/fee/transfer prompts or confirmations;
  those require a separate validated consequential-action design.
- New import formats, mapping engine, OCR/AI, object-storage migration,
  bank-specific parser, bank feed, original bank-file retention or payments.
- Changes to import validation, commit, stock/accounting, matching,
  reconciliation, permission, audit, encryption or retention behaviour.
- Schema/API migrations, new dependencies, production data operations,
  accessibility certification or professional finance/security approval.

## Acceptance criteria

- Mission Pack is committed before implementation.
- Selected fields, dialog, messages and table regions expose correct names,
  roles, states and focus behaviour.
- Selected pages have no page-level overflow at 320/640 CSS pixels; dense
  evidence uses labelled local scrolling.
- All existing capture, import, inventory, bank, accounting, permission, audit,
  tenant, encryption and rollback behaviour is unchanged.
- Accessibility/design-token conformance, TypeScript, shell, invoice PDF,
  relevant DB-backed domain tests, production build, browser checks,
  `git diff --check` and remote gates pass.

## Rollback

Revert the scoped component, catalogue, CSS, scanner and documentation changes.
No schema, data, API, stock, ledger, bank, capture or production-database
rollback is needed.
