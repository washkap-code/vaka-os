# P6-012 — Dashboard and Secondary Evidence Accessibility

**Status:** Approved for implementation
**Programme:** 6 — Application shell, navigation and workbench
**Type:** Frontend accessibility remediation and localisation adoption
**Depends on:** P6-003 Universal Workbench; P6-005 accessibility foundation; P3-004 controlled contact deletion; P2-007 invoice detail

## Outcome

Authorised tenant users can inspect dashboard pipeline, overdue-receivable and
low-stock evidence, controlled contact-deletion requests and invoice payment
history as clearly named, keyboard-accessible, mobile-safe native tables. No
workflow authority, financial history or deletion decision changes.

This is a bounded WCAG 2.2-oriented presentation wave, not an accessibility,
accounting, stock, legal or privacy certification.

## Current and target behaviour

- Selected dashboard and record-detail tables use visual headings but lack
  distinct programmatic region names and deliberate keyboard scroll access.
- Dense deletion/payment evidence can compress at narrow widths.
- Add typed English table names, labelled focusable local scroll regions and
  readable dense-table widths without widening the page at 320/640 CSS pixels.
- Preserve every chart's existing text alternatives, empty state, navigation
  permission, owner-only deletion approval and immutable payment evidence.

## User, business result and measure

- **Users:** Tenant owners and authorised finance, CRM, sales and stock users.
- **Problem:** Evidence that drives daily decisions and consequential approvals
  is harder to navigate when tables are unnamed or widen mobile pages.
- **Result:** Each selected table is separately identified and keyboard/mobile
  navigable while exact values and controls remain unchanged.
- **Measure:** Static/frontend gates pass; browser inspection names rendered
  regions; document width equals viewport at 320/640 CSS pixels; existing
  permissions, tenant boundaries and domain tests remain green remotely.

## Permissions, audit, data and failure behaviour

- Dashboard data remains limited to the authenticated tenant and existing
  visible navigation permissions.
- Contact deletion still requires CRM write authority; only the principal
  tenant owner may approve/reject a non-owner request. Existing reasons,
  confirmations, preservation of referenced history and audit remain unchanged.
- Invoice payment history stays read-only in the detail view; posted financial
  transactions cannot be edited in place.
- No new API, provider, telemetry, storage, export or personal-data path is
  introduced. Existing loading/empty/error behavior is unchanged.

## Finance, stock and deletion invariants

- Dashboard evidence is read-only and creates no accounting or stock event.
- Payment history is exact existing evidence; no journal, allocation, currency,
  tax or reversal behavior changes.
- Low-stock evidence does not adjust stock or initiate replenishment.
- Contact deletion remains soft/controlled, preserves referenced history and
  retains principal-owner approval authority.

## Finance Readiness Questions

1. **Accounting event:** None.
2. **Journal:** None created or changed.
3. **Legal entity:** Existing tenant scope; future entity limits unchanged.
4. **Currency:** Existing dashboard/invoice currencies and formatting remain.
5. **Tax:** No tax behavior changes.
6. **Audit:** Existing deletion/payment audit evidence remains unchanged.
7. **Reversal:** Posted corrections remain reversal/offset-only.
8. **Explanation:** Exact table headings, values, empty states and warnings remain.
9. **AI:** No AI is involved.
10. **Permission:** Existing dashboard, CRM, invoice and owner checks remain mandatory.

## Localisation and mobile

- New region names use typed English catalogue copy. ChiShona and isiNdebele
  activation remains gated on native and domain-terminology review.
- Dense evidence scrolls locally without document-level overflow at 320/640
  CSS pixels; existing charts retain exact visible values.

## Scope

- Universal Workbench pipeline, overdue-receivable and low-stock tables.
- Contact deletion-request/approval table.
- Invoice-detail payment-history table.
- Typed English copy, permanent accessibility contracts and completion evidence.

## Out of scope

- Dashboard calculations/charts, forecasting, CRM deletion policy, privacy
  erasure, invoice/payment/accounting behavior, new actions or bulk workflows.
- APIs, schemas, dependencies, production data, visual rebrand, certification
  or professional accounting/legal/privacy/localisation approval.

## Acceptance criteria

- Mission Pack is committed before implementation.
- Selected native tables are distinctly named focusable local regions and
  retain readable widths without page overflow at 320/640 CSS pixels.
- Tenant, permission, owner-approval, audit, finance, stock and immutable
  history behavior remains unchanged.
- Accessibility/design-token conformance, TypeScript, shell, invoice PDF,
  production build, browser checks, `git diff --check` and remote gates pass.

## Rollback

Revert the scoped components, catalogue, scanner and documentation. No schema,
data, API, finance, stock, deletion or production rollback is required.
