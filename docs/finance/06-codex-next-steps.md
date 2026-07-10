# VAKA Finance Phase 0 - Codex Next Steps

## Purpose

Define the next safe engineering tasks after Phase 0 audit.

## Do Not Start Until

- current-state audit is reviewed;
- financial write paths are accepted;
- schema gaps are reviewed;
- ledger invariants are accepted;
- migration plan is approved;
- risk register is accepted.

## Recommended Next Sequence

### Step 0 - Restore Executable Test Infrastructure

Before Mission 3, provide a running PostgreSQL test database so the Mission 2 finance tests can complete.

Mission 2B added a safety guard and finance test scripts, then successfully executed the Mission 2 finance baseline against local PostgreSQL database `vaka_os_test`.

Required commands to rerun before and after remediation:

```bash
cd server
NODE_ENV=test DATABASE_URL="postgresql://vaka_test:vaka_test@127.0.0.1:5432/vaka_os_test" npm run test:db:prepare
NODE_ENV=test DATABASE_URL="postgresql://vaka_test:vaka_test@127.0.0.1:5432/vaka_os_test" PLATFORM_ADMIN_PASSWORD="local-test-admin-password-2026" npm run seed
NODE_ENV=test DATABASE_URL="postgresql://vaka_test:vaka_test@127.0.0.1:5432/vaka_os_test" npm run test:finance
```

### Step 1 - Verify Mission 2E Remediation Before Mission 3

Mission 2D remediated the critical integrity boundary. Mission 2E closed the remaining material idempotency risk:

- risky payment, expense, and stock-adjustment API routes now require idempotency keys;
- same-key/same-payload retries do not duplicate financial effects;
- same-key/different-payload retries are rejected as conflicts;
- bank reconciliation payment creation records safe server-derived idempotency identities;
- rejected financial-integrity attempts are not yet fully audited.

Before Mission 3, rerun the guarded full verification stack and review `docs/finance/12-critical-remediation-evidence.md` and `docs/finance/13-idempotency-remediation-evidence.md`.

### Step 2 - Complete Existing Ledger Verification

Add tests for:

- journal balancing;
- minimum journal line count;
- no negative debit/credit;
- no line with both debit and credit;
- tenant isolation;
- duplicate source prevention or documented current gap;
- stock movement append-only behaviour;
- bank reconciliation deterministic calculations;
- FX snapshot immutability.

Mission 2B executed the finance tests successfully. Keep them as the baseline and update expectations only when approved remediation intentionally changes behavior.

### Step 3 - Add Enterprise Structure Tables

Do not start this step until the remaining non-idempotency audit and enterprise-structure risks are accepted or addressed.

Add:

- groups;
- legal entities;
- organisational units;
- fiscal calendars;
- fiscal periods;
- currencies.

This must be additive and must not change existing posting behavior.

### Step 4 - Backfill Default Legal Entity

Create a migration/backfill script that gives every existing tenant one default group, legal entity, fiscal calendar, and currency mapping.

### Step 5 - Expand Journal Header

Add lifecycle fields without breaking current flows:

- legal entity;
- journal number;
- status;
- fiscal period;
- approval status;
- posted metadata;
- reversal link;
- idempotency key.

### Step 6 - Expand Exchange Rate Model

Add rate types, approval, source, effective dating, and entity context.

### Step 7 - Add Tax Configuration Tables

Add tax engine tables without replacing current behavior yet.

### Step 8 - Introduce Accounting Events

Add event table and compatibility adapters for invoice, payment, expense, stock, bank, and purchase events.

### Step 9 - Build New Posting Service

New posting engine must run in parallel before cutover. It must prove equal or intentionally different output with documented reasons.

## Next Prompt After Audit

Use a new Codex prompt only after reviewing the Phase 0 documents and Mission 2 verification documents:

```text
You are working in the `washkap-code/vaka-os` repository.

Read `AGENTS.md` and all documents in `docs/finance`.

Your task is to rerun the Mission 2 finance invariant tests with PostgreSQL available, then remediate approved critical weaknesses before any enterprise finance schema migration.

Do not change production accounting behaviour.
```

## Recommended Professional Review

- Zimbabwean accounting review of default chart of accounts and VAT treatment.
- Tax review of future effective-dated tax engine.
- Security review of tenant/legal-entity scoping.
- Data protection review of AI finance action logs and evidence retention.
