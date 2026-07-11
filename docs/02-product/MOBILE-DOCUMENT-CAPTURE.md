# VAKA Mobile Document Capture

**Status:** Capture inbox foundation implemented; OCR and posting workflows remain planned.

## Outcome

Let a business capture an invoice, receipt, contact document or other source
document from a phone and keep the original evidence inside the correct tenant
for later review.

## Current implementation

- The Imports area accepts camera or file input on mobile browsers.
- PNG, JPEG and PDF captures are validated by media type, file signature and a
  1.5 MB decoded-size limit.
- Captures are tenant-scoped, attributed to the authenticated user, audit
  logged, and shown in a recent capture inbox.
- The original data is retrievable only through an authenticated,
  tenant-scoped endpoint.
- Captures remain `CAPTURED`; no OCR, AI extraction, invoice creation,
  accounting posting, stock movement or contact creation is claimed.

## Next controlled phases

1. Add encrypted object storage instead of keeping capture data in the initial
   database intake record.
2. Add malware/content scanning and retention controls.
3. Add OCR/classification as a reviewable, confidence-scored suggestion.
4. Require explicit user confirmation before creating contacts, invoices or
   financial/stock records.
5. Add duplicate detection, correction, rejection and audit evidence.
6. Add native camera queues and encrypted offline sync after conflict rules are
   approved.
