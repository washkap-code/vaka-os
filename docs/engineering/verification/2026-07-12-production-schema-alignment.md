# Production Runbook — Admin reset + schema alignment (2026-07-12)

**Database:** Supabase project `vaka-platform` (`kjabilwcdwpncthbskvy`)
**Operator:** VAKA Architecture Office (Cowork), at owner request
**Nature:** Additive, non-destructive. No existing rows modified except one admin account. GENFIN tables untouched.

## Context

The owner could not log in. Root causes found:
1. The only platform admin was `platform-admin@jonomi.digital`, not the owner's email.
2. Production schema had drifted **behind** the deployed code — the login path requires `user_sessions`, which did not exist; several feature tables and the finance idempotency columns were also missing.

## Changes applied

### 1. Admin credential reset
- Repointed the existing platform-admin user (`id 0099b53f…`) `email → waskap@me.com`, set a fresh bcrypt(12) password, `must_change_password = true`, `status = active`.
- Revocation of prior sessions was a no-op (table did not yet exist).
- **Owner must change the temporary password on first login.**

### 2. Missing tables added (additive, `CREATE TABLE IF NOT EXISTS`)
- `user_sessions` (blocks login without it)
- `bank_reconciliations`, `capture_documents`, `invoice_document_snapshots`, `invoice_share_links`, `platform_backup_manifests`

### 3. Missing finance columns + indexes
- `payments`, `expenses`, `stock_movements`: `idempotency_key`, `idempotency_fingerprint`
- Partial unique indexes `(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL`

### 4. Finance integrity controls (migration `0007`)
- `journal_lines → journal_entries` FK set to `ON DELETE RESTRICT`
- `prevent_financial_history_mutation()` + `BEFORE UPDATE OR DELETE` append-only triggers on `journal_entries`, `journal_lines`, `stock_movements`

## Verification

- VAKA object count now matches the code exactly: **40 tables, 398 columns**.
- Append-only triggers confirmed present on the three finance tables.
- Column diff against the code-truth schema (local Postgres provisioned from the current `schema.ts`): **0 differences**.

## Critical constraint recorded

This database is **shared with the GENFIN production app** (30+ `genfin_*` tables with real data) and RLS is disabled. Therefore:
- **Never run `drizzle-kit push` / `db:push` against this database** — it would attempt to drop the `genfin_*` tables. All VAKA migrations here must be hand-applied and additive.
- The correct long-term fix is to move VAKA to its own database — see `docs/engineering/DATABASE-SEPARATION-PLAN.md`.
