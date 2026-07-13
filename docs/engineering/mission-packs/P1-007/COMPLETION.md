# P1-007 — Completion Report

**Implementation:** Complete for the approved bounded adapter scope
**Technical verification:** Complete
**Availability:** Existing invoice PDF and capture endpoints; no general document-management UI
**Operational gate:** External object storage, malware scanning and retention/recovery controls remain open
**Completed on:** 2026-07-13

## Delivered

- Kernel-composed `DOCUMENT_SERVICE` using the P1-001 contract and one
  PostgreSQL application adapter.
- Explicit tenant/actor write context, kind-qualified identifiers, stable
  descriptors, byte-size validation and SHA-256 content checksums.
- Provider-level fail-closed handling for unknown/malformed identifiers,
  cross-tenant reads, unauthenticated capture writes, invalid capture classes,
  disallowed media/signatures and oversized payloads.
- Invoice PDF retrieval from existing immutable issue snapshots through the
  document service, including authenticated downloads and opaque public share
  links.
- Capture binary create/detail storage through the document service while
  retaining AES-256-GCM protection, legacy read compatibility, the existing
  metadata/review table and current workflow permissions/audits.
- Existing HTTP status, body, PDF bytes, content headers, filenames, cache
  policy and capture data-URL behaviour preserved by parity tests.
- No new canonical business table and no duplicate document infrastructure.

## Verification evidence

- Guarded local test database preparation, finance integrity controls and
  reference-data seed: passed against `vaka_test`.
- Focused final document contract/composition/adapter/capture/invoice suite:
  6 files / 17 tests passed.
- Clean GitHub Actions PostgreSQL/foundation suite: 61 files / 202 tests passed,
  0 failures, 0 skipped (run `29248160767`).
- Server typecheck: passed locally and in CI.
- Web typecheck: passed locally and in CI.
- Web production build: passed locally and in CI.
- `git diff --check`: passed.

The first repeated local full-suite attempts encountered timeout-only failures
in unrelated billing, import, session and finance tests while the retained test
database and host were under load. No assertion failed. The isolated database
was reset and guarded preparation rerun; the required clean CI gate then passed
the unmodified standard suite in full. No timeout change is committed.

## Migration and production boundary

- No migration was added. The adapter reuses `invoice_document_snapshots` and
  `capture_documents` without changing their schema or stored formats.
- No `db:push`, migration, DDL, or other operation was run against the shared
  production Supabase project.
- Local schema preparation targeted only the guarded disposable `vaka_test`
  database.

## Behaviour and compatibility

- Finance users still require `accounting.read` to download invoice PDFs.
- Capture create/detail still requires `imports.create`; review still requires
  `imports.approve` and remains outside the binary storage contract.
- Anonymous invoice access still requires an opaque, hashed, unexpired and
  unrevoked share token before document retrieval.
- Existing invoice-download, share-link, capture-create and capture-review
  audit evidence remains authoritative; no duplicate read-audit stream was
  added.
- No accounting, tax, currency, ledger, stock, numbering, OCR, AI or customer
  communication behaviour changed.

## Open risks and gates

1. Capture data remains in PostgreSQL. Migration to external object storage
   requires approved encryption, malware scanning, retention, backup, recovery,
   access-link and reconciliation controls.
2. Current capture types remain limited to PNG, JPEG and PDF intake evidence;
   no OCR, classification, AI extraction or automatic business posting exists.
3. Invoice templates retain current English render copy. Governed translated
   templates and professional document terminology review remain separate work.
4. General attachments, deletion/retention automation, legal hold, attachment
   search, customer document portals and offline sync are not provided.

## Rollback

Revert the composition token, application adapter, route/share-link adoption,
contract extensions and tests. Restore the previous direct invoice/capture
helpers. Existing snapshot/capture rows and encryption remain compatible, so
rollback requires no data conversion or destructive migration.

## Next mission

P7-001 — notification delivery for finance documents through the P1-004
notification service, with locale templates, consent/opt-out and audited sends.
