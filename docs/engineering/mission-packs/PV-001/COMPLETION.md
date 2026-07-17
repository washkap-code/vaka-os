# PV-001 — Completion report

**Date:** 2026-07-17 · **Branch:** `feature/pv-001-verification-vault` · **Lane:** Cowork
**Status:** Implemented and verified in scratch Postgres. Ships dark behind `verify.centre`.

## 1. Files created

- `docs/engineering/mission-packs/PV-001/README.md` (spec, written before code)
- `server/drizzle/0046_verification_vault.sql`
- `server/src/verification-vault.ts`
- `server/tests/verification-vault.test.ts`
- this report

## 2. Files modified

- `server/src/db/schema.ts` — `verification_evidence` table + `VERIFICATION_EVIDENCE_TYPES`
- `server/src/lib.ts` — permissions `verify.read`, `verify.manage` (Owner/Admin via spread; Accountant +read)
- `server/src/routes.ts` — five routes under `/verification/evidence*`, all `requireFeature("verify.centre")` + RBAC
- `server/tests/tenant-isolation-endpoint-manifest.ts` — five new endpoints registered (LP-002 gate)
- `docs/engineering/SESSION-HANDOFF.md`
- Hygiene (separate commit): removed tracked Finder artifact `server/src/platform/workflow/approvals 4.ts` (stale pre-PW-002 duplicate, unreferenced)

## 3. Behaviour changes

None for any existing tenant: flag default-OFF, API fails closed with `FEATURE_DISABLED`, table ships empty. With the flag ON: typed evidence registration pinning PD-001 workspace document versions; append-only lifecycle ACTIVE → SUPERSEDED (renewal chain) | WITHDRAWN (reasoned); singleton identity-class types enforced by partial unique index; derived expiry states (CURRENT / EXPIRING_SOON ≤30d / EXPIRED / NO_EXPIRY) computed at read time; summary counts in list responses. Nothing asserts "verified" — that is PV-002.

## 4. Tests executed (scratch Postgres, embedded 18.4)

- verification-vault: **15/15** (build-dark fail-closed; version pinning; cross-tenant + archived document rejection; validity-window validation; singleton 409; renewal chain + terminal immutability incl. DB CHECK defence-in-depth; type-locked renewal; reasoned withdrawal; expiry derivation + list summary; tenant isolation on list/detail; Accountant read-not-write; audit rows for all three write actions)
- Regression: document-workspace + document-approvals 13/13 · critical + feature-flags 20/20 · **tenant-isolation-regression (LP-002 gate) 13/13 with the manifest additions** · finance journal-balancing/immutability/tenant-isolation 7/7
- Server typecheck clean. No web changes (PB-001/PN-001 precedent; UI arrives with PV-002).
- Structural gate: migration chain **0000→0046 replayed == current Drizzle model, zero drift** across tables/columns/constraints/indexes/enums (catalog diff; triggers/functions unaffected by 0046 and covered by the 2026-07-16 three-way proof).

## 5. Verification status

All green. No push performed (sandbox has no credentials); owner pushes `feature/pv-001-verification-vault` via GitHub Desktop and merges after CI gates.

## 6. Risks / notes

- **Migration 0046 taken by this mission** — next free is **0047** (ledger updated). Apply `0046_verification_vault.sql` to production (`vaka-os-prod`, idempotent, empty table + role backfill only) before enabling `verify.centre` for any tenant.
- Renewal uses a two-step within one transaction (sentinel withdrawal → insert successor → flip to SUPERSEDED) because the ACTIVE singleton index and the superseded-pointer CHECK cannot both be satisfied in one statement ordering. Invisible outside the transaction; documented in code.
- Expiry notifications deliberately deferred to a PW-003 automation rule mission.
- Coordination: PB-003 (Black Book UI) was issued to the Codex lane in parallel with explicit instructions to take no migration.

## 7. Recommended next mission

PV-002 — verification review workflow (platform-staff queue on PW-001, badge issue/revoke, full audit) + the tenant/staff UI for both PV missions.
