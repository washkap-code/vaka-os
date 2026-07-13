# P1-007 — Document Service Adapter

**Status:** Technically verified; external storage and broad document management gated
**Programme:** 1 — Platform Kernel and shared services
**Type:** Tenant-scoped application adapter and compatibility migration
**Depends on:** P1-001 document contract; P1-002 identity/audit adapters

## Outcome

Invoice PDF retrieval and capture-payload storage use one composed Platform
Kernel document service. Existing authenticated invoice PDF, public invoice
share-link, and capture endpoints retain their current HTTP behaviour while the
underlying binary-document access is moved behind a tenant-aware contract.

This completes the Programme 1 adapter seam. It does not create a general
document-management product, external object storage, OCR, malware-scanning
service, new invoice template, or a new canonical Invoice/Customer/Company
table.

## Current behaviour

- P1-001 defines an injected `DocumentService`/`DocumentStore` seam, but the
  contract is not composed or consumed by application paths.
- Issued invoice render inputs are immutable rows in
  `invoice_document_snapshots`; `getInvoicePdf` queries and renders them
  directly.
- Capture payloads are validated at the HTTP boundary and encrypted into the
  tenant-owned `capture_documents` table. Capture routes query and decrypt the
  payload directly.
- Authenticated invoice PDF downloads require `accounting.read`; capture
  create/read requires `imports.create`; capture review requires
  `imports.approve`. Existing material writes and downloads are audited.
- Public invoice PDFs are reachable only through opaque, hashed, expiring and
  revocable share tokens.

## Target behaviour

1. Strengthen the kernel document contract so every write receives explicit
   tenant/actor access context and every descriptor has a stable document kind
   plus optional classification.
2. Register `DOCUMENT_SERVICE` at the application composition root using one
   PostgreSQL-backed application store.
3. Use opaque, kind-qualified kernel identifiers for `invoice-pdf` and
   `capture` documents so equal database UUIDs cannot cross document domains.
4. Resolve invoice PDFs from the immutable tenant-scoped issue snapshot and
   preserve the existing PDF bytes, template version, filenames and endpoint
   headers.
5. Store and retrieve capture binary payloads through the kernel service while
   retaining the existing `capture_documents` table, encryption format,
   validation limits, metadata, review workflow and API response shapes.
6. Keep list/review state in the capture workflow; the document service owns
   binary persistence/retrieval, not capture lifecycle decisions.
7. Fail closed on unknown document kinds, malformed identifiers, missing
   tenant/actor context, empty content, descriptor/content size mismatch, and
   cross-tenant reads.
8. Preserve public share-link validation before invoking document retrieval;
   an opaque link remains the authority boundary for anonymous access.

## User and measurable business result

- **User:** Finance users downloading issued invoices and authorised staff
  capturing source evidence.
- **Problem:** Two live document paths bypass the shared kernel contract,
  encouraging future modules to duplicate file access and tenant controls.
- **Result:** Both paths consume the same service without visible workflow
  change.
- **Measure:** Existing endpoint parity tests pass; focused adapter tests prove
  tenant isolation, kind separation, encrypted capture persistence and
  immutable invoice rendering.

## Security, privacy and failure behaviour

- Tenant and actor context comes from verified authentication for protected
  endpoints. No tenant identifier is accepted from request input.
- The application store independently scopes every database lookup by tenant.
- Cross-tenant and unknown-kind reads return no document; they do not disclose
  resource existence.
- Capture input remains zod-validated and signature/size checked before the
  service is called. Stored payloads remain AES-256-GCM protected with the
  existing environment-provided secret and legacy plaintext read compatibility.
- Public invoice access remains limited to the current opaque share-token
  workflow; the document service does not make anonymous documents generally
  addressable.
- The adapter does not add provider secrets, remote URLs, logs containing
  document bytes, or unrestricted file access.
- Existing capture create/review and invoice download/share-link audits remain
  authoritative. Binary reads do not create a second competing audit stream.
- Malware scanning and approved object-storage retention/recovery controls are
  still required before accepting broader or untrusted file classes.

## Finance and data invariants

- Invoice PDFs continue to render only from the immutable issue snapshot.
- No posted ledger, invoice, journal, payment, tax, stock, numbering or balance
  behaviour changes.
- No duplicate canonical business table is introduced.
- Capture evidence remains intake-only: it does not trigger OCR, accounting,
  inventory or AI actions.
- No migration is expected; the existing additive document/capture schema is
  retained.

## Localisation, accessibility and mobile

- Existing endpoint payloads and PDF template copy remain unchanged; this
  adapter mission adds no user-facing copy.
- Capture remains usable by the existing camera-friendly PWA flow and returns
  the same data URL contract.
- Translated invoice templates and a broader accessible document-management UI
  remain separate missions. No locale is inferred from identity or content.

## Scope

- Kernel document contract hardening and validation tests.
- PostgreSQL application document store for invoice PDF and capture payloads.
- Composition-root `DOCUMENT_SERVICE` registration with test injection.
- Adoption by authenticated/public invoice PDF and capture create/detail paths.
- Endpoint parity, tenant-isolation, failure and composition tests.
- Platform-kernel documentation, master-plan status, changelog and Completion
  Report.

## Out of scope

- New document tables, duplicate invoice/capture tables or destructive schema
  changes.
- New or changed PDF/capture endpoint behaviour.
- Object-storage migration, signed object URLs, CDN delivery, virus scanning,
  OCR, classification, attachment search, retention automation or legal hold.
- Invoice/statement/reminder sending; P7-001 owns notification adoption.
- Template redesign, customer portal expansion, AI extraction or mobile offline
  synchronisation.

## Acceptance criteria

- Mission pack is committed before implementation.
- `DOCUMENT_SERVICE` is composed from the kernel contract; application callers
  do not recreate a parallel document service.
- Invoice PDFs and capture binary writes/reads pass through the composed service.
- Existing endpoint status, response body, content type, disposition, cache
  headers, encryption and audit behaviour remain compatible.
- Tenant A cannot retrieve Tenant B invoice or capture content through direct or
  indirect identifiers.
- Capture input validation and encrypted-at-rest evidence remain covered.
- Unknown kinds, malformed IDs, empty bytes and size mismatches fail safely.
- No migration or production database operation is introduced.
- Full guarded DB suite, server/web typechecks and web production build pass.

## Rollback

Revert composition, route/share-link adoption, adapter, contract extensions,
tests and documentation. The existing `invoice_document_snapshots` and
`capture_documents` rows and encryption format remain compatible, so the
previous direct helpers can be restored without data migration. No production
table or column needs removal.
