# P2-008 - Professional invoice documents and compact invoice actions

**Status:** Approved by the product owner for implementation  
**Programme:** 2 - Finance foundations  
**Type:** Invoice presentation, document settings and immutable render evidence  
**Depends on:** P1-007 document service; P2-002 VAT evidence; P2-007 invoice detail; P6-001 design system

## Outcome

Authorised business users can scan invoice values without a wall of action
buttons and can issue a polished, tenant-branded A4 invoice containing the
seller, customer, payment and tax-identification information captured at issue.
The document remains faithful to authoritative invoice values and does not
change when company or customer settings are edited later.

This mission establishes the shared VAKA document layout foundation for later
management accounts, annual accounts and operational reports. It applies that
foundation to invoices only; it does not claim that every report has already
been migrated.

## User, problem and measurable result

- **Users:** Tenant finance users and invoice recipients.
- **Problem:** Eight inline row actions consume the invoice table, values wrap
  or become hard to scan, and the current PDF is a cramped text stream without
  professional sections, remittance details or useful page composition.
- **Result:** Each row exposes one keyboard-accessible Actions disclosure, the
  table reserves readable widths for identifiers and amounts, and issued PDFs
  render as professional A4 business documents with stable legal, customer and
  remittance evidence.
- **Measure:** UI, snapshot, tenant, permission, PDF-structure, multi-page,
  browser-build and visual-render checks pass without changing any invoice
  totals, journals, tax determination, stock movement or lifecycle rule.

## Target behaviour

1. Replace the inline action-button cluster with one accessible row Actions
   disclosure. Preserve all existing action permissions and lifecycle states.
2. Give the invoice table deliberate column widths, non-wrapping monetary
   values, controlled horizontal scrolling and a compact small-screen treatment.
3. Extend company document settings with optional customer-facing payment
   instructions and bank/remittance details. Only `settings.manage` may update
   them, and the update remains tenant-scoped and audited.
4. Treat a non-empty VAT number as the tenant's explicit instruction to show
   VAT registration identification on newly issued documents. This changes no
   VAT determination, rate, amount or ledger behaviour.
5. At issue, snapshot seller address/registration/tax/VAT, structured customer
   address and registration/tax details, bank/remittance details and payment
   terms with the existing immutable invoice facts.
6. Render new snapshots with template `invoice-document-v3` as an A4 document
   using shared document tokens: safe tenant accent, consistent margins,
   typographic hierarchy, bordered party/metadata panels, line-item grid,
   totals, payment/terms sections, page numbering and the restrained VAKA
   attribution footer.
7. Continue rendering existing v1/v2 snapshots safely. Missing optional fields
   produce a clean layout rather than placeholders or failures.
8. Repeat table headings and preserve readable footers when line counts require
   more than one page. Text must be escaped, bounded and wrapped without overlap.
9. Use authoritative stored totals and line evidence; the renderer must never
   independently recalculate accounting or tax.

## Finance readiness

1. **Accounting event:** None for settings or rendering. Invoice issue remains
   the existing accounting event.
2. **Journal:** Unchanged existing balanced issue journal.
3. **Legal entity:** Current tenant/accounting-entity surrogate; future legal
   entity isolation remains open.
4. **Currency:** Existing snapshotted invoice currency and values; presentation
   only.
5. **Tax:** Existing country-pack treatment/rate/amount evidence; VAT number
   display is identification only and requires professional market review.
6. **Audit:** Existing issue/PDF audit plus `settings.branding_updated` for
   document-setting changes.
7. **Reversal:** Not applicable to presentation settings. Issued invoices remain
   immutable and existing void/reversal controls are unchanged.
8. **Explanation:** The PDF states invoice identity, dates, currency, parties,
   lines, VAT evidence, totals, payment details and template version context.
9. **AI:** No AI involvement.
10. **Permission:** `accounting.read` for PDF access, `accounting.post` for
    existing invoice actions and `settings.manage` for company document fields.

## Trust, data, localisation and failure behaviour

- Tenant identity is always derived from authenticated server context.
- Bank details are customer-facing commercial payment instructions and are
  snapshotted only when explicitly configured; internet-banking credentials,
  secrets and access tokens are never accepted.
- Server validation bounds all new text. PDF generation failure does not change
  invoice, ledger, stock, delivery or payment state.
- English is the reviewed document language for this mission. New application
  copy is added to the typed catalogue; ChiShona and isiNdebele document
  templates remain gated for qualified terminology/layout review.
- Mobile users retain the essential number, customer, status and total context
  with keyboard/touch-operable row actions.
- Zimbabwean tax and statutory presentation remains subject to qualified
  accounting/tax review and is not presented as professional approval.

## Design-system extension

### Invoice action menu

- Reuses the existing VAKA dropdown primitive with end alignment.
- Default, hover, focus-visible and disabled action states remain textual.
- The trigger has a row-specific accessible name and a minimum touch target.

### Enterprise document system v1

- **Colour:** Tenant-safe accent plus stable ink, muted, line and surface roles.
- **Typography:** Document title, section label, body, table and caption roles.
- **Spacing:** A4 margin, section gap, cell inset and fixed footer-safe area.
- **Patterns:** Brand header, metadata grid, address block, financial table,
  totals card, remittance/terms panel and page footer.
- **Accessibility:** Selectable text, meaningful reading order, sufficient
  contrast, no colour-only information and clear column labels.

Later report missions must reuse these roles rather than create unrelated PDF
visual languages.

## Acceptance criteria

- This mission pack is committed before implementation.
- The invoice list uses one Actions disclosure per row and retains every current
  lifecycle/permission restriction.
- Company document settings are tenant-scoped, bounded, permission-protected
  and audited.
- New issued snapshots contain exact seller, customer, remittance and terms
  evidence and remain unchanged after settings/customer edits.
- Cross-tenant PDF access remains unavailable.
- New PDFs use A4 dimensions, professional boxes/margins, wrapped text, repeated
  multi-page headers, page numbers and the required VAKA footer.
- A real representative PDF is generated, rendered to PNG and visually reviewed
  at every page with no clipping, overlap, broken glyph or unreadable value.
- Existing finance snapshot, issue, payment, void, stock and journal tests pass;
  server typecheck/tests, web typecheck/build, accessibility and `git diff
  --check` pass.

## Rollback

Revert the UI, renderer and optional settings/snapshot fields. Nullable database
columns may remain unused for forward compatibility. Existing immutable JSON
snapshots and issued invoices remain valid; accounting, tax, stock, payment and
numbering data require no rollback.
