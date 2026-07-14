# HOTFIX 2026-07-14 — Invoice workspace reliability and actions

**Status:** Approved by the product owner for implementation  
**Programme:** 2 — Finance foundations  
**Type:** Focused production workflow and presentation repair  
**Depends on:** P2-002 tax evidence; P2-007 invoice detail and draft amendment;
P2-008 professional invoice documents; P7-001 governed email delivery

## Outcome

Authorised finance users can reliably select a tenant-owned customer when
creating or amending a draft invoice, open every invoice from the list, and use
the document actions appropriate to its lifecycle from inside the invoice
record. Invoice entry uses a modern, responsive, labelled layout without
changing any posting, tax, stock, payment, numbering or immutable-history rule.

## Problem and measurable result

- **Users:** Finance users with `accounting.read`; authorised invoice posters
  with `accounting.post`.
- **Problem:** The invoice form depends on the broader CRM contact endpoint and
  silently presents an empty customer selector when that request is unavailable.
  Document actions live only in a compact row menu, so opening a record does not
  expose preview, download, secure-link, email or WhatsApp choices. Repeated
  line controls rely on placeholders instead of a clear visual form hierarchy.
- **Result:** Customer choices load from a minimal accounting-authorised read
  model over the one canonical Contact entity; loading, failure and no-customer
  states are explicit; record-level actions are visible; and invoice create/edit
  controls remain legible at 320, 640 and desktop widths.
- **Measure:** Tenant/permission route tests, UI model tests, accessibility and
  design-token checks, typechecks and production build pass.

## Target behaviour

1. Add a tenant-scoped, read-only invoice-customer endpoint protected by
   `accounting.read`. It selects only active canonical contacts with
   `is_customer = true` and returns only the customer summary needed by invoice
   entry. It does not create a second customer entity or bypass tenant context.
2. Invoice create and draft amendment consume that endpoint and show distinct
   loading, request-failure and empty states. A failed request must never look
   like a successful empty customer list.
3. Keep invoice rows directly openable. Inside the record, show lifecycle- and
   permission-aware document actions:
   - preview and download for issued documents;
   - governed email delivery for issued or partially paid invoices;
   - secure link creation/management and email/WhatsApp link sharing for issued,
     partially paid or paid invoices;
   - issue, payment and void controls remain governed by the existing server
     lifecycle and permission rules.
4. Draft invoice fields remain amendable only with `accounting.post`. Issued,
   partial, paid and void records remain immutable and explain their locked
   state. No delete action is introduced.
5. Replace placeholder-only invoice-line presentation with persistent visible
   labels, grouped line cards, clear required/help text, modern focus states and
   responsive one-column small-screen behaviour. All new copy belongs to the
   typed English catalogue and remains localisation-ready.
6. Email delivery requires an explicit confirmation, a fresh idempotency key,
   the existing customer consent evidence and the existing finance delivery
   service. WhatsApp remains secure-link sharing; governed direct WhatsApp
   delivery is still planned and must not be presented as live.

## Finance readiness

1. **Accounting event:** None for reading, editing an unposted draft, previewing
   or sharing. Issue/payment/void retain their existing accounting events.
2. **Journal:** Unchanged existing balanced services; the UI and customer read
   model never write ledger records.
3. **Owner:** Current authenticated tenant/accounting-entity surrogate.
4. **Currency:** Existing invoice currency and snapshotted rate rules.
5. **Tax:** Existing effective-dated country-pack resolution on the invoice tax
   date; no rate is hard-coded by this repair.
6. **Audit:** Existing draft-update, issue, download/share/delivery, payment and
   void audit paths remain authoritative.
7. **Reversal:** Posted history remains immutable and correctable only through
   the existing controlled void/reversal paths.
8. **Explanation:** The record shows lifecycle, parties, dates, lines, totals,
   payments and locked-history guidance.
9. **AI:** No AI involvement.
10. **Permission:** `accounting.read` for list/detail/customer choices/PDF and
    `accounting.post` for draft writes and consequential actions.

## Acceptance criteria

- This mission pack is committed before implementation.
- An accounting user can list only active customer contacts in their own tenant
  without requiring broad CRM read access; cross-tenant records never appear.
- Customer loading/failure/empty states and action success/failure states are
  perceivable and do not fail silently.
- Every invoice opens a detail record. Draft edits are preserved; posted fields
  remain disabled and server-enforced immutable.
- Preview, download, governed email, secure link, email-link and WhatsApp-link
  actions are available inside the record only in valid lifecycle/permission
  states. Direct governed WhatsApp sending is not claimed.
- Inputs have visible labels, keyboard focus, adequate touch targets and no
  overlap at 320, 640 and desktop widths.
- Relevant server tests, server/web typechecks, web build, accessibility,
  design-token conformance and `git diff --check` pass.

## Production migration

None. This repair adds no table, column, index, constraint or production DDL.

## Rollback

Revert the invoice-customer read route and invoice workspace presentation. The
existing canonical contacts, invoice records, PDFs and controlled finance
services remain unchanged; no data rollback is required.
