# HOTFIX-2026-07-13 — Reliable invoice PDF download and preview

**Status:** Approved by the product owner for immediate implementation  
**Type:** Production invoice-document delivery repair  
**Depends on:** P1-007 document service; immutable issued invoice snapshots

## Incident and outcome

An authorised tenant user downloaded `INV-00001`, but Safari retained an
incomplete `invoice-INV-00001.pdf.download` file and reported it was invalid.
Issued invoice PDF bytes must be validated before use, downloads must not revoke
their browser object URL before the browser has consumed it, and users must be
able to preview the exact same immutable document before downloading it.

## Target behaviour

1. Fetch the existing authenticated invoice PDF endpoint with the current bearer
   token; do not add a second rendering or financial calculation path.
2. Require a successful response, `application/pdf` content type and `%PDF-`
   signature before exposing bytes to preview or download.
3. Construct a fresh browser PDF Blob from the verified bytes.
4. For downloads, attach a safe `.pdf` filename and defer object-URL revocation
   long enough for Safari and other browsers to consume it.
5. Add a keyboard-operable Preview button for issued invoices. Display the exact
   verified PDF in a modal `iframe` with title, close and download actions.
6. Revoke preview object URLs on close, replacement and component unmount.
7. Preserve the existing server permission, tenant, immutable snapshot, audit,
   cache and finance boundaries.
8. Add a restrained footer to every currently generated VAKA PDF page:
   `Powered by VAKA OS · www.vakaos.com`. It must remain subordinate to tenant
   identity and report content while being legible and consistently positioned.

## Scope and safety

- Frontend PDF fetch/validation helper, focused unit tests, invoice-list preview
  and reliable download lifecycle.
- Typed English copy and responsive modal styling.
- Optional response hardening headers that do not change financial content.
- Shared footer treatment across invoice, VAT technical-preview and statutory
  report-pack renderers; future document renderers inherit this standard.

No invoice totals, ledger entries, issue lifecycle, tax, stock, snapshot content,
share links, communications, permissions, schema or production data may change.

## Acceptance

- Invalid/error/HTML payloads cannot be saved or previewed as PDFs.
- Valid `%PDF-` bytes preview and download with an `.pdf` filename.
- Download object URLs are not revoked synchronously.
- Preview cleanup is deterministic and the document remains tenant-authorised.
- Invoice and every report page contain the VAKA OS website footer without
  covering tenant branding, totals, evidence rows or page numbering.
- Focused tests, web/server typechecks, web build, token conformance and existing
  invoice-document tests pass in an available DB environment.

## Rollback

Revert the helper, preview UI and header hardening. Existing immutable snapshots
and invoice download endpoint remain intact; no data rollback is required.
