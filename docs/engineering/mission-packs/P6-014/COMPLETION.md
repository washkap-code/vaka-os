# P6-014 Completion Report

**Date:** 2026-07-14
**Status:** Implementation complete; all local release gates passed; remote quality and production release pending

## Delivered

- Replaced the capture-review overlay with the shared focus-managed modal,
  including named dialog semantics, initial focus, Escape dismissal, focus
  containment and restoration to the originating capture action.
- Preserved the duplicate capture-open request guard without natively disabling
  the focus-return target while its detail request is running.
- Associated bank registration, CSV upload, statement date and closing-balance
  controls with stable visible labels and linked the file input to its required
  CSV-column guidance.
- Added labelled, keyboard-focusable local scroll regions for captured
  documents, import preview rows, saved reconciliation reports and recent bank
  lines while preserving native table semantics.
- Added meaningful capture, reconciliation-row and bank-line action groups.
- Distinguished successful operations from validation/API failures with status
  and alert semantics and design-system success/error treatments.
- Converted import and reconciliation summaries into responsive design-system
  evidence cards and raised all Import workspace actions to the governed 44px
  minimum target.
- Added typed English accessible names and permanent conformance contracts for
  selected modal, field, table-region, feedback, action and touch-target rules.

## Verification evidence

- Web TypeScript: passed.
- Accessibility conformance check and negative fixture: passed.
- Design-token conformance: passed with 236 governed tokens.
- Shell/navigation permission tests: 13/13 passed.
- Invoice PDF regression tests: 3/3 passed.
- Web production build: 45 modules; 460.17 kB main JavaScript / 123.62 kB
  gzip; 103.30 kB CSS / 18.98 kB gzip; no size warning.
- Browser dialog verification: one named capture-review dialog; initial focus
  reached Close; Escape dismissed it and restored focus to the originating Open
  action; the capture action group was named.
- Import preview verification: the CSV control was labelled and described by
  required-column guidance; the preview table was a named region; confirmed
  import feedback was announced as status and an invalid file as alert.
- Bank-review verification: all four tested account/CSV/date/balance controls
  were labelled; worksheet results were announced as a named status; saved
  reconciliation and both positive/negative bank-line action groups were named.
- Browser reflow: document width equalled viewport width at 320 and 640 CSS
  pixels. Saved-reconciliation and bank-line tables retained 832-pixel local
  scroll surfaces inside 250-pixel mobile regions. Every visible Import action
  measured 44px high. No Vite overlay or console/page error occurred.
- Focused capture/import/bank/finance regressions: 9 files / 17 tests passed.
- Two files that timed out during the first resource-contended full-suite run
  passed in isolation: 2 files / 4 tests.
- Clean complete database-backed server rerun: 66 files passed, 1 intentionally
  skipped; 226 tests passed, 1 intentionally skipped.
- Server TypeScript and production runtime-schema compatibility: passed.
- `git diff --check`: passed.
- No server, schema or migration files changed.

## Finance, inventory and product invariants preserved

No server, schema, API, tenant, permission, audit, import parser, duplicate
rule, stock quantity, cost, bank amount, match result, reconciliation figure,
journal, tax, currency, report, download, approval or production-data behavior
changed. Opening-stock, bank-fee, transfer and invoice-match actions continue
through their existing authorised services. No accounting event or journal is
created by this presentation-only mission.

## Remaining limits

This is not OCR, a bank feed, automated matching, filing-ready reporting,
accessibility certification or accounting/tax/legal opinion. ChiShona and
isiNdebele activation, native finance terminology review, a broader Safari/
VoiceOver/device matrix and qualified professional approval remain gated.

## Release evidence

P6-014 remains unreleased until its GitHub quality gate, Vercel preview,
approved merge, post-merge main gate, Production deployment and live-bundle
verification pass. Release evidence will be retained in the PR and deployment
records. Rollback requires only reverting the scoped frontend and documentation
commits; no database rollback is required.
