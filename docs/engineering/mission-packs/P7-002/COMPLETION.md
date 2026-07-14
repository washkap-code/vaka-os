# P7-002 completion report — Immutable finance report snapshots

**Local completion date:** 2026-07-14
**Release status:** Awaiting remote review, migration CI/deployment and live verification

## Delivered

- Additive `finance_report_snapshots` schema and migration with canonical VAT or
  statutory report JSON, tenant-branding inputs, report/PDF/branding versions,
  parameters, creator, filename, media type, byte size and SHA-256.
- Database-level update/delete rejection, tenant-scoped idempotency uniqueness
  and revoked direct access for optional `anon`/`authenticated` roles.
- Confirmed `reports.read` APIs to create, list, inspect and retrieve one
  snapshot; tenant and all report/branding/financial values remain server-
  derived.
- Deterministic same-key replay, including after current tenant branding changes,
  and conflict on same-key/different-period reuse.
- `finance-report-pdf:<uuid>` document kind with provider-level tenant filtering,
  stored-input rendering and exact checksum/size verification before release.
- Atomic minimised creation audit and bounded authenticated-open audit evidence.
- Runtime schema gate and guarded test-database control installer.
- Authoritative finance, platform-kernel, database and changelog documentation.

## Finance and security boundary

Snapshot creation is document evidence, not an accounting event. It creates no
journal and changes no report, tax, currency, invoice, ledger, stock, numbering,
branding or notification source. VAT and management accounts remain technical
previews with their existing professional/legal-entity/AP limitations. AI has
no snapshot authority. No public token, object store or provider is involved.

## Verification evidence

- Guarded local test database preparation, additive schema, finance integrity
  controls, snapshot append-only controls and reference seed: passed.
- Focused VAT/statutory snapshot, report renderer, invoice snapshot, bounded-
  image and document-service regression: 6 files / 15 tests passed.
- Full server suite: 72 files passed, 1 skipped; 247 tests passed, 1 skipped.
- Explicit runtime-schema gate: deployment-ready against the guarded test DB.
- Server and web typechecks: passed.
- Production web build: passed (43 modules).
- Design-token, accessibility, shell, invoice-PDF, report-PDF and session-
  renewal gates: passed.
- Server and web production dependency audits: 0 vulnerabilities.
- `git diff --check`: passed.

## Migration and production boundary

Migration `0033_finance_report_snapshots.sql` was applied only to the guarded
local `vaka_os_test` database. No schema, DDL or data operation was run against
production. The runtime schema gate now requires the snapshot table before a
production build can be declared deployment-ready.

## Open gates

1. Restore GitHub authentication and complete review, remote CI and merge.
2. Review and apply the additive migration through the approved production
   release path, then verify authenticated create/replay/download evidence.
3. Define retention, legal hold, privacy erasure and archival treatment before
   snapshot lifecycle automation.
4. A future distribution mission must add recipient confirmation, consent or
   lawful basis, expiring/revocable single-snapshot links, provider delivery,
   idempotency, rate controls and delivery evidence. WhatsApp additionally
   requires approved Business Platform and template configuration.

## Rollback

Revert the routes, coordinator, document-adapter extension, schema mapping,
test-control installer and documentation. The additive append-only table may
remain dormant; do not drop production evidence without separate retention and
legal review. No accounting reversal or financial-data conversion is required.
