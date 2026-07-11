# VAKA Mobile Document Capture

**Status:** Capture inbox, encrypted payloads, and human review workflow implemented; object storage, OCR, and posting workflows remain planned.

## Outcome

Let a business capture an invoice, receipt, contact document or other source
document from a phone and keep the original evidence inside the correct tenant
for later review.

## Current implementation

- The Imports area accepts camera or file input on mobile browsers.
- PNG, JPEG and PDF captures are validated by media type, file signature and a
  1.5 MB decoded-size limit.
- Newly captured payloads are encrypted with authenticated AES-256-GCM before
  they are written to the database. Legacy plaintext rows remain readable only
  to support a controlled migration; production should configure a dedicated
  `CAPTURE_ENCRYPTION_KEY` and plan key rotation before object-storage cutover.
- Captures are tenant-scoped, attributed to the authenticated user, audit
  logged, and shown in a recent capture inbox.
- The original data is retrievable only through an authenticated,
  tenant-scoped endpoint.
- An authorised reviewer can open the original image/PDF, add an optional
  review note, and mark the evidence `REVIEWED` or `REJECTED`. Review decisions
  record the reviewer, timestamp, note, and an audit event; tenant boundaries
  are enforced on both the preview and review write.
- No OCR, AI extraction, invoice creation, accounting posting, stock movement
  or contact creation is claimed. Review is a human evidence-quality decision,
  not business-record creation.

## Next controlled phases

1. Add tenant-scoped encrypted object storage instead of keeping capture data
   in the database intake record.
2. Add malware/content scanning and retention controls.
3. Add OCR/classification as a reviewable, confidence-scored suggestion.
4. Require explicit user confirmation before creating contacts, invoices or
   financial/stock records.
5. Add duplicate detection, correction, rejection and audit evidence.
6. Add native camera queues and encrypted offline sync after conflict rules are
   approved.
