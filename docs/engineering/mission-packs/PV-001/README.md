# PV-001 — Verification evidence vault

**Status:** In implementation (this pack precedes code, per EEOS rule)
**Programme:** PV — Verify (Master Build Plan Part II §16, Wave 2)
**Depends on:** PD-001 (documents workspace), FLAG-001/002 (build-dark flags)
**Gate:** T only (PV-002 carries the P-gate for verification policy)
**Branch:** `feature/pv-001-verification-vault`
**Migration:** `0046_verification_vault.sql` (reserved in the ledger by this pack)

## Outcome

A tenant-side verification evidence vault: businesses register the documents
that prove who they are (incorporation certificate, tax clearance, CR14,
proof of address, director ID, VAT registration, licences, insurance), with
validity windows, expiry surfacing and renewal chains. Ships dark behind the
existing `verify.centre` flag.

PV-001 is deliberately the *vault only*. Platform-staff review, badge issue
and revocation are PV-002 (Workflow-powered); badges surfacing in the
directory are PV-003. Nothing in PV-001 asserts that a business "is verified".

## Design decisions

1. **No duplicate storage.** Evidence bytes live in the PD-001 documents
   workspace. An evidence row references `workspace_documents.id` and pins the
   document's `current_version` at registration (the PD-002 version-pinning
   precedent). Replacing a file is a workspace version + an evidence renewal.
2. **Append-only lifecycle.** Evidence rows are never edited in place.
   `ACTIVE → SUPERSEDED` (renewal, with `superseded_by` chain) or
   `ACTIVE → WITHDRAWN` (audited, with reason). Terminal rows are immutable —
   enforced in service AND by DB CHECK.
3. **Singleton types.** One ACTIVE row per tenant for identity-class evidence
   (incorporation, tax clearance, CR14, proof of address, VAT registration);
   multiple ACTIVE rows allowed for LICENCE / INSURANCE / DIRECTOR_ID / OTHER.
   Enforced by a partial unique index.
4. **Derived expiry, not stored.** `CURRENT` / `EXPIRING_SOON` (≤30 days) /
   `EXPIRED` are computed at read time from `expires_at` — no cron, no state
   to drift. Reminder automation belongs to PW-003 rules later.
5. **Server-first.** Web UI arrives with PV-002's review queue (the
   PN-001→PN-002 precedent) so tenant UX and staff UX land together.

## Data (migration 0046, additive + idempotent)

`verification_evidence`
- `id`, `tenant_id → tenants`, `document_id → workspace_documents`,
  `document_version` (≥1, pinned), `evidence_type` (CHECK: INCORPORATION_CERTIFICATE,
  TAX_CLEARANCE, CR14_DIRECTORS, PROOF_OF_ADDRESS, DIRECTOR_ID,
  VAT_REGISTRATION, LICENCE, INSURANCE, OTHER), `issuer` (1–160),
  `reference_number` (≤80, nullable), `notes` (≤500, nullable),
  `valid_from` / `expires_at` (dates, nullable; CHECK expires_at > valid_from),
  `status` (CHECK: ACTIVE / SUPERSEDED / WITHDRAWN), `superseded_by`
  (self-FK; CHECK: set iff status = SUPERSEDED), `withdrawn_reason`
  (CHECK: set iff status = WITHDRAWN), `created_by → users`, timestamps.
- Partial unique index: one ACTIVE per (tenant, evidence_type) for singleton
  types. Indexes on (tenant, status) and (tenant, expires_at).
- Role backfill (0039 precedent): Owner/Admin gain `verify.read` +
  `verify.manage`; Accountant gains `verify.read`.

## API (all behind `requireFeature("verify.centre")`, fail-closed)

- `GET  /verification/evidence` (`verify.read`) — list with derived expiry
  state and summary counts; `?status=` filter (ACTIVE/SUPERSEDED/WITHDRAWN/ALL).
- `GET  /verification/evidence/:id` (`verify.read`) — detail + supersession chain.
- `POST /verification/evidence` (`verify.manage`) — register: validates the
  workspace document exists in-tenant and is ACTIVE, pins its version.
- `POST /verification/evidence/:id/renew` (`verify.manage`) — transactional:
  new ACTIVE row, old row → SUPERSEDED with pointer.
- `POST /verification/evidence/:id/withdraw` (`verify.manage`) — reasoned.

Audit actions: `verification.evidence_added`, `verification.evidence_renewed`,
`verification.evidence_withdrawn`.

## Non-negotiables verified by tests

Build-dark fail-closed before flag · permission gates read/manage ·
cross-tenant document reference rejected · singleton uniqueness (409) ·
renewal chain integrity · terminal-row immutability (service + DB) ·
derived expiry states · tenant isolation on list/detail · audit evidence on
every write.

## Explicitly out of scope

Platform review queue, badges, revocation (PV-002); directory surfacing
(PV-003); expiry notifications (PW-003 rule); external registry checks.
