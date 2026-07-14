# P6-016 Completion Report

**Date:** 2026-07-14
**Status:** Implementation complete; all local release gates passed; remote quality and production release pending

## Delivered

- Rebuilt the above-the-fold homepage as an asymmetric, product-led composition
  on desktop and an intentional evidence stack on tablet and mobile.
- Removed the 650px fixed-width/negative-translation mobile preview. The complete
  representative workspace now stays inside a 288px product surface at 320px.
- Added a native desktop Product disclosure for CRM, Finance, Inventory, Payroll
  and VAKA AI, with textual Available now, Coming soon and Concept preview states.
- Added an inline mobile availability summary without a pointer-only nested menu.
- Added a hero availability rail that makes available, planned and concept states
  visible before a visitor chooses a CTA.
- Replaced the legacy preview sidebar with horizontal keyboard tabs, executive
  metrics, an exact-value cash-position chart, customer and stock priorities,
  payroll not-live evidence and a non-operational VAKA AI concept card.
- Added Arrow Left/Right, Home and End selection with roving tab order to the
  representative preview while retaining the lower module explorer behaviour.
- Kept sign-in/signup callbacks and all current 30-day trial/package values intact.
- Corrected stale public capability copy: supported CSV imports, branded invoice
  preview/download, bank-statement reconciliation and owner session controls are
  now described as current; delivery providers, bank feeds, payroll and VAKA AI
  remain explicitly planned or not live.
- Extended the P6-015 regression gate and documented the new design-system
  disclosure, status, executive-proof and responsive patterns.

## Verification evidence

- Homepage regression gate and negative fixture: 4/4 tests passed.
- Web TypeScript: passed.
- Design-token conformance: passed with 236 governed tokens and no raw colour,
  font or motion values introduced.
- Accessibility conformance and negative fixture: passed.
- Shell/navigation permission tests: 13/13 passed.
- Invoice PDF regression tests: 3/3 passed.
- Production build: 46 modules; 463.51 kB main JavaScript / 124.36 kB gzip;
  108.55 kB CSS / 19.75 kB gzip; no size warning.
- Compared with P6-015, the redesign adds 3.28 kB JavaScript / 0.63 kB gzip and
  5.25 kB CSS / 0.77 kB gzip. No dependency was added.
- Product disclosure: five destinations rendered; Available now, Coming soon
  and Concept preview were visible; Escape closed the disclosure and restored
  focus through the native summary path.
- Keyboard tabs: Arrow Right selected Customers in the representative preview
  and CRM in the module explorer. One selected tab remained in each set.
- Access: Sign in reached the sign-in form and Open your free VAKA workspace
  reached Create your company.
- Accuracy: one visible illustrative-product label, one explicit VAKA AI not-live
  notice and three hero availability items were present.
- Reflow: document width equalled viewport width at 320, 640, 1024 and 1440 CSS
  pixels. The representative product surface measured x=16/width=288 at 320,
  x=72/width=880 at 1024 and x=670/width=698 at 1440.
- Primary CTA measured 50px high at mobile, tablet and desktop.
- Mobile menu exposed one named navigation with `aria-expanded="true"`.
- Language fallback retained `lang="en"`, stored the `sn` preference and
  announced that verified ChiShona and isiNdebele remain in review.
- Browser runtime contained one homepage and one hero, no Vite overlay, no
  console error and no page error.
- Focused desktop and mobile hero screenshots were visually reviewed after
  correcting compact-header wrapping and financial-value line breaks.
- `git diff --check`: passed.
- No server, API, schema, auth, finance, inventory, billing or data files changed.

## Product and finance invariants preserved

No tenant, permission, credential, plan, price, trial, entitlement, audit,
accounting, journal, tax, currency, stock, invoice, billing or production-data
behaviour changed. All displayed business figures are synthetic and visibly
labelled. VAKA AI performs no retrieval or action. Payroll remains not live.

## Design-system outcome

The design-system extension uses the existing public compatibility and semantic
tokens, documented disclosure/status variants, native disclosure behaviour,
textual non-colour status, roving-focus tabs, exact-value evidence and true
responsive stacking. This materially shaped the work: the redesign did not add
a separate visual language or one-off raw colours, fonts or motion values.

## Remaining limits and next wave

This is the first visible homepage design wave, not the final ten-section page.
P6-017 should consolidate lower-page problem/outcome/workflow sections, sharpen
representative outcome fragments, expand verified trust evidence and reduce the
page's overall length while preserving P6-015/P6-016 contracts. Native-reviewed
ChiShona/isiNdebele, approved legal/resource destinations, privacy-governed
analytics, field Core Web Vitals and formal WCAG certification remain gated.

## Release evidence

P6-016 remains unreleased until the GitHub quality gate, Vercel preview,
approved merge, post-merge main gate, Production deployment and exact live-bundle
verification pass. Rollback requires reverting only the scoped landing,
catalogue, CSS, test and documentation commits; no database rollback is required.
