# P6-007 — Operational Record Accessibility and Reflow

**Status:** Approved for implementation
**Programme:** 6 — Application shell, navigation and workbench
**Type:** Frontend accessibility remediation and design-system adoption
**Depends on:** P6-001 design system; P6-005 legacy field and modal patterns

## Outcome

Tenant users can create and review sales deals, products and purchase orders
with keyboard, touch, zoom and assistive technology using the same governed
field, dialog and local-table patterns established by P6-005. The selected
workflows remain usable at 320 CSS pixels without changing their business,
stock, tax, posting or permission behavior.

This mission follows the latest W3C-recommended WCAG 2.2 baseline and uses
native HTML table semantics for tabular records. It is a bounded follow-on
wave, not a whole-product accessibility certification.

## Current behaviour

- Deal, product and purchase-order create overlays use separate unnamed or
  partially named modal implementations without consistent focus containment,
  Escape close, scroll locking or opener focus return.
- Visible field labels in these overlays are not programmatically associated
  with their controls. Repeating purchase-order inputs rely on placeholders.
- Errors are visible but are not consistently exposed as alerts.
- Product and purchase-order tables are not consistently labelled,
  keyboard-scrollable local regions.
- Purchase-order lines use a desktop action row that does not deliberately
  stack at 320 CSS pixels.
- User-facing copy in the selected legacy sections remains embedded in the
  component instead of the typed English catalogue.

## Target behaviour

1. Reuse `LegacyField` and `LegacyModal`; do not introduce a competing form or
   modal abstraction.
2. Give the three create dialogs visible titles, programmatic names, initial
   focus, contained Tab/Shift+Tab, Escape close, background scroll lock and
   opener focus return.
3. Associate every selected label, hint and error with its control. Repeating
   purchase-order line controls include the line number in their names.
4. Expose recoverable create errors with `role="alert"` and clear stale errors
   when a dialog is opened or successfully closed.
5. Present product and purchase-order tables in labelled, focusable local
   scrolling regions while preserving native table semantics.
6. Stack purchase-order line controls and dialog actions at 320 CSS pixels
   without widening the page or hiding primary actions.
7. Move new and migrated user-facing copy into the typed English catalogue,
   keeping machine values and API payloads locale-independent.
8. Extend the permanent accessibility conformance scanner so loss of the
   selected dialog, label, line-name, table-region and reflow contracts fails
   locally and in CI.

## User and measurable business result

- **User:** Sales, inventory and procurement users creating operational records
  on desktop or mobile with pointer, keyboard or assistive technology.
- **Problem:** Unassociated labels and inconsistent overlays make core record
  creation harder to understand and operate, especially on narrow screens.
- **Result:** All selected controls have persistent accessible names; dialogs
  behave consistently; data tables remain locally navigable; forms reflow at
  320 CSS pixels.
- **Measure:** Static negative-self-testing contracts pass; browser inspection
  finds no unnamed selected controls; keyboard focus behavior passes; document
  width equals viewport width at 320 and 640 CSS pixels; existing gates remain
  green.

## Permissions, audit, data and failure behaviour

- Existing server-derived tenant and permission checks are unchanged. UI
  visibility does not become an authority boundary.
- Deal creation and stage movement keep their current API and audit behavior.
- Product creation, opening stock, stock adjustment and reorder rules retain
  existing permissions and services. This mission does not alter stock values.
- Purchase-order create and receive behavior, atomic stock/ledger effects,
  immutable posted history, tax configuration and audit evidence are unchanged.
- No credential, customer, product, supplier, stock or financial value is sent
  to a new provider or written by the accessibility layer.
- Existing recoverable API errors remain visible and are not replaced with a
  generic accessibility-specific message.

## Localisation, mobile and AI

- Migrated copy is added to the typed English catalogue. ChiShona and
  isiNdebele activation remains gated on the localisation framework and
  qualified language review.
- Forms tolerate text expansion and use a single readable column at 320 CSS
  pixels; native tables retain a labelled local horizontal scroll region.
- No AI is involved. Deterministic deal, product, purchase, stock, tax and
  accounting rules remain authoritative.

## Scope

- Sales Pipeline deal-create overlay and selected page copy.
- Products list, product-create overlay and reorder-rule overlay adoption.
- Purchase Orders list and purchase-order-create overlay.
- Typed English catalogue, responsive CSS, accessibility/design-token scanner
  coverage, roadmap/design-system documentation and completion evidence.

## Out of scope

- Deal editing, bulk actions, forecasting or sales automation.
- Product editing, stock workflow redesign, replacement of audited prompts or
  new inventory/accounting behavior.
- Purchase-order editing, approval tiers, supplier bills, payment workflows or
  changes to receiving/posting.
- Reports, Billing, Imports, Settings and Platform Admin; these remain later
  measured accessibility waves.
- New dependencies, schema/API migrations, production data operations, visual
  rebrand, accessibility certification or professional conformance opinion.

## Acceptance criteria

- Mission Pack is committed before implementation.
- Selected controls and dialogs expose correct names, roles and values.
- Dialog keyboard/focus/scroll behavior matches the governed P6-005 pattern.
- Selected page-level content uses typed catalogue copy.
- Product and purchase-order tables are native tables inside labelled,
  keyboard-scrollable regions.
- Selected pages have no page-level horizontal overflow at 320/640 CSS pixels.
- Deal, product, PO, stock, tax, permission and accounting behavior is unchanged.
- Accessibility and design-token conformance, TypeScript, shell and invoice PDF
  regressions, web production build, browser checks, `git diff --check` and
  remote quality gates pass.

## Rollback

Revert the scoped component/catalogue/CSS/scanner/documentation changes. No
schema, data, API, stock, tax, ledger or production-database rollback is needed.
