# P7-002 — Immutable finance report snapshots

**Status:** Approved for implementation
**Programme:** 7 — Business communications and document delivery
**Priority:** P1 trust boundary for governed report delivery
**Depends on:** P1-007 document service; P2-003 VAT technical report; P2-006
statutory report pack; P2-008 branded finance report preview; P7-001 finance
document notification delivery

## Outcome

An authorised finance user can create an immutable, tenant-scoped PDF snapshot
of a VAT or management-accounts technical preview, list the snapshot evidence,
and retrieve the exact verified document later. Repeated requests with the same
idempotency key resolve to the same snapshot.

This creates the integrity boundary required before governed email or WhatsApp
delivery. It does not expose a public link, contact a provider, infer recipient
consent, certify a report, or make any report filing-ready.

## User, problem and measurable result

**User:** Owner, Administrator, Accountant or auditor with `reports.read`.

**Problem:** live report PDFs can be previewed and downloaded, but there is no
durable evidence of the exact report data, tenant identity, template and bytes
that would later be sent to a recipient. Regenerating a report after ledger or
branding changes may produce a different document.

**Result:** one explicitly confirmed, idempotent command captures the canonical
report and branding inputs, exact PDF checksum/size and creation evidence.
Authenticated retrieval rerenders from those immutable inputs and refuses any
checksum or size mismatch.

**Measure:** tests prove exact-byte replay, append-only enforcement, same-key
deduplication, changed-input conflict, permission and tenant isolation, audit
evidence, malformed identifier handling and no finance mutation.

## Target behaviour

1. Add an additive `finance_report_snapshots` table containing:
   - tenant and creator identity;
   - report kind and version;
   - PDF and branding template versions;
   - validated period parameters;
   - immutable canonical report and branding JSON;
   - deterministic filename, media type, byte size and SHA-256 checksum;
   - tenant-scoped idempotency key/fingerprint and creation time.
2. Enforce database-level append-only behavior. Application routes expose no
   update or delete command.
3. Create snapshots only from authenticated server tenant context and canonical
   VAT/statutory report services. Never accept tenant, entity, branding,
   currency, totals, rows, checksums, filenames or report JSON from the client.
4. Require `reports.read`, `confirm: true`, a validated `Idempotency-Key` and a
   bounded report-kind/period body.
5. Render once before insert, record exact byte size/checksum, and persist the
   snapshot plus `report.snapshot_created` audit evidence atomically.
6. Same tenant + same key + same fingerprint returns the existing descriptor;
   same key with changed kind/period fails with conflict.
7. Extend the tenant-aware document adapter with a qualified
   `finance-report-pdf:<snapshot-id>` kind. Retrieval rerenders only from stored
   report/branding inputs, verifies media type, size and checksum, and fails
   closed on integrity mismatch.
8. Add authenticated APIs to create, list, inspect and download one snapshot.
   Lists/descriptors exclude full report JSON, logo bytes and bearer secrets.
9. Record bounded `report.snapshot_opened` audit evidence for authenticated PDF
   retrieval. Do not put report rows, customer names, logo bytes or PDF bytes in
   audit metadata.
10. Keep current live JSON/CSV/PDF routes and P2-008 preview behavior unchanged.

## Finance readiness answers

1. **Accounting event:** none; snapshot creation is document evidence only.
2. **Journal:** none.
3. **Owner:** authenticated tenant provisional scope; canonical LegalEntity is
   still incomplete and remains visible in report warnings.
4. **Currency:** existing report currency and exact values are captured without
   recalculation.
5. **Tax:** no determination change; VAT remains a technical preview.
6. **Audit:** snapshot created/opened events contain IDs, versions, kind,
   period, checksum and size only.
7. **Reversal:** snapshots are evidence and cannot be reversed or edited; a new
   snapshot supersedes operational use without deleting history.
8. **Explanation:** stored kind, versions, period, creation identity, checksum
   and report warnings explain the artifact.
9. **AI:** AI cannot create, retrieve, approve, send or certify snapshots.
10. **Permission:** `reports.read`; narrower export/delivery permissions remain
    a future RBAC migration.

## Security, privacy and lifecycle

- Every insert/list/read filters by authenticated tenant; cross-tenant IDs
  return safe not-found responses.
- IDs are kind-qualified and UUID-validated at the document boundary.
- PDF text/logo safety remains governed by P2-008. Stored logo values remain
  bounded data images or safe fallback inputs; no retrieval performs a remote
  fetch.
- SHA-256 and byte-size verification detects stored-source/template drift or
  corruption before any bytes are returned.
- Idempotency prevents accidental duplicate evidence and is tenant scoped.
- Snapshot JSON remains inside the primary tenant database. No object store,
  browser storage, public token or provider receives it in this mission.
- Snapshots are append-only. Retention, legal hold, privacy erasure and archival
  policy require a separately reviewed lifecycle mission; no physical deletion
  endpoint is introduced here.
- Responses are private/no-store and retain global content-type hardening.

## Accessibility, mobile and localisation

- This mission exposes authenticated APIs and document descriptors only; P2-008
  remains the accessible mobile-responsive preview surface.
- Stable kind/version fields are code-owned and locale-independent.
- No new translated financial copy is enabled. English document warnings remain
  explicit pending qualified ChiShona/isiNdebele finance review.

## Failure behaviour

- Invalid period, missing confirmation/key or unsupported kind: reject before
  snapshot creation.
- Permission or tenant mismatch: return safe denial/not-found and no document.
- Same key with different input: conflict; never overwrite existing evidence.
- Report generation/tie-out failure: create no snapshot or creation audit.
- Insert/audit failure: roll back both.
- Rerender checksum/size mismatch: return no PDF and emit no misleading success.
- Snapshot failures never mutate report sources, invoices, journals, tax,
  stock, numbering, branding or notifications.

## Deliberate exclusions and next dependency

- No email, WhatsApp, SMS, push, attachment or public bearer link.
- No recipient/contact selection, consent inference or provider call.
- No delivery queue, retry, webhook, bounce/read receipt or analytics.
- No signing, professional approval, filing submission, legal-entity model,
  comparative period, cash-flow or consolidation change.
- The next delivery mission must add recipient confirmation, channel-specific
  consent/lawful basis, expiring/revocable single-snapshot links, idempotent
  provider adapters, delivery evidence and rate/abuse controls. WhatsApp also
  requires approved Business Platform configuration and template governance.

## Verification

- guarded additive migration and database append-only trigger proof;
- deterministic snapshot create/replay and changed-input conflict;
- exact PDF checksum/size replay for VAT and statutory types;
- report/document version and branding snapshot evidence;
- permission, cross-tenant, malformed-ID and missing-record negative tests;
- audit minimisation and no-ledger/no-source-mutation assertions;
- document-service regression, full server suite/typechecks, web build and
  dependency audits.

## Release and rollback

Release only after migration review, remote CI, deployment and authenticated
production evidence. Revert routes, snapshot coordinator, document-adapter
extension, schema mapping, tests and documentation. The additive append-only
table may remain dormant; do not drop production evidence without a separate
retention/legal review. No accounting or financial-data rollback is required.
