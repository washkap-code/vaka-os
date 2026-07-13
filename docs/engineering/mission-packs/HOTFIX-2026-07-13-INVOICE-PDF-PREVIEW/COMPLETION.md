# HOTFIX-2026-07-13 — Completion Report

**Implementation:** Complete on branch  
**Verification:** Focused gates passed; DB-backed document assertions pending CI  
**Availability:** Release pending merge and production deployment  
**Completed on:** 2026-07-13

## Delivered

- A typed invoice-PDF client that requires a successful `application/pdf`
  response and validates the `%PDF-` signature before use.
- Safe invoice-number filenames and clear rejection of HTML, JSON error or
  malformed payloads.
- Safari-safe downloads that defer object-URL revocation instead of invalidating
  the browser transfer synchronously.
- An authenticated, responsive invoice preview modal using the same immutable
  issued PDF bytes, with explicit Download and Close actions.
- Deterministic preview object-URL cleanup on close, replacement and unmount.
- PDF response hardening with exact content length and `nosniff`.
- A restrained `Powered by VAKA OS | www.vakaos.com` footer on invoice, VAT
  technical-preview and statutory report-pack PDF pages.
- Regression assertions for authenticated/public invoice PDFs and both report
  renderers.

No financial values, tax rules, postings, stock movements, invoice lifecycle,
snapshot inputs, tenant scope, permissions, share links or delivery state changed.

## Verification

- Invoice-PDF client tests: 3 passed, 0 failed.
- Web typecheck: passed.
- Web production build: passed; 35 modules transformed.
- Server typecheck: passed.
- `git diff --check`: passed.
- Full PostgreSQL document/report assertions remain assigned to GitHub CI because
  the guarded local PostgreSQL service is unavailable in this workspace.

## Rollback

Revert the hotfix implementation commit. Existing immutable invoice snapshots
remain valid and no schema/data rollback is required.
