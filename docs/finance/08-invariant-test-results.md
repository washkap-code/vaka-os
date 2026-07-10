# VAKA Finance Mission 2B - Invariant Test Results

## Purpose

Record the Mission 2 finance invariant test coverage and the executable baseline observed after PostgreSQL was installed and a safe test database was prepared.

## Test Execution Summary

| Command | Result | Evidence |
|---|---|---|
| `cd server && NODE_ENV=test DATABASE_URL="postgresql://vaka_test:vaka_test@127.0.0.1:5432/vaka_os_test" npm run test:db:guard` | PASS | Guard accepted only the explicit test PostgreSQL URL and masked credentials. |
| `cd server && NODE_ENV=test DATABASE_URL="postgresql://vaka_test:vaka_test@127.0.0.1:5432/vaka_os_test" npm run test:db:prepare` | PASS | Drizzle pulled schema and applied changes to `vaka_os_test`. |
| `cd server && NODE_ENV=test DATABASE_URL="postgresql://vaka_test:vaka_test@127.0.0.1:5432/vaka_os_test" PLATFORM_ADMIN_PASSWORD="local-test-admin-password-2026" npm run seed` | PASS | Seeded subscription plans and platform admin into the test database. |
| `cd server && npm run typecheck` | PASS | TypeScript completed with no errors. |
| `cd server && NODE_ENV=test DATABASE_URL="postgresql://vaka_test:vaka_test@127.0.0.1:5432/vaka_os_test" npm run test:finance` | PASS | 8 finance files passed; 17 tests passed. |
| `cd server && NODE_ENV=test DATABASE_URL="postgresql://vaka_test:vaka_test@127.0.0.1:5432/vaka_os_test" npx vitest run --fileParallelism=false tests/critical.test.ts tests/bank-statement-imports.test.ts tests/bank-invoice-matching.test.ts tests/opening-stock-imports.test.ts` | PASS | 4 existing accounting-oriented files passed; 17 tests passed. |
| `cd server && NODE_ENV=test DATABASE_URL="postgresql://vaka_test:vaka_test@127.0.0.1:5432/vaka_os_test" npm test` | PASS | Full server suite passed; 25 files and 86 tests passed. |

## Mission 2 Test Classification

| Test File | Tests | Execution Result | Evidence Classification |
|---|---:|---|---|
| `bank-reconciliation-determinism.test.ts` | 2 | PASS | Executable |
| `fx-snapshot-integrity.test.ts` | 1 | PASS | Executable |
| `journal-balancing.test.ts` | 2 | PASS | Executable |
| `journal-idempotency.test.ts` | 3 | PASS | Executable; proves duplicate-effect gaps for partial payments, expenses, and stock adjustments. |
| `journal-immutability.test.ts` | 2 | PASS | Executable; proves direct DB mutability and cascade-delete exposure inside rolled-back probes. |
| `journal-invalid-lines.test.ts` | 2 | PASS | Executable; proves current zero-value line allowance. |
| `stock-ledger-integrity.test.ts` | 2 | PASS | Executable; proves stock reconciliation behavior and DB mutability exposure inside a rolled-back probe. |
| `tenant-isolation.test.ts` | 3 | PASS | Executable; proves service isolation strengths and cross-tenant account-reference weakness in `postJournal()`. |

## Invariant Results

| Invariant | Result | Protection Layer | Test Evidence | Severity |
|---|---|---|---|---|
| Journal balance | PASS | SERVICE_ENFORCED | `journal-balancing.test.ts`, `journal-invalid-lines.test.ts` | Critical |
| Journal has at least two lines | PASS | SERVICE_ENFORCED | `journal-invalid-lines.test.ts` | High |
| Negative debit rejected | PASS | SERVICE_ENFORCED | `journal-invalid-lines.test.ts` | High |
| Negative credit rejected | PASS | SERVICE_ENFORCED | `journal-invalid-lines.test.ts` | High |
| Both debit and credit on one line rejected | PASS | SERVICE_ENFORCED | `journal-invalid-lines.test.ts` | High |
| Zero-value journal rejected | PASS | SERVICE_ENFORCED | `journal-invalid-lines.test.ts` | Medium |
| Zero-value line rejected | FAIL | NOT_ENFORCED | `journal-invalid-lines.test.ts` proves a zero-value line can be posted inside a non-zero balanced journal. | Low |
| Invoice issue duplicate prevention | PASS | SERVICE_ENFORCED business state | `journal-idempotency.test.ts` | High |
| Payment duplicate prevention | PASS after Mission 2E | ROUTE/SERVICE_ENFORCED plus DATABASE_UNIQUE_INDEX | `journal-idempotency.test.ts` proves required keys, safe replay, conflict rejection, and no duplicate journal. | High |
| Expense duplicate prevention | PASS after Mission 2E | ROUTE_ENFORCED plus DATABASE_UNIQUE_INDEX | `journal-idempotency.test.ts` proves required keys, safe replay, conflict rejection, and no duplicate journal. | High |
| PO receipt duplicate prevention | PASS | SERVICE_ENFORCED business state | `journal-idempotency.test.ts` | High |
| Stock adjustment duplicate prevention | PASS after Mission 2E | ROUTE/SERVICE_ENFORCED plus DATABASE_UNIQUE_INDEX | `journal-idempotency.test.ts` proves required keys, safe replay, conflict rejection, and distinct-key adjustments remain allowed. | Medium |
| Bank import duplicate prevention | PASS | DATABASE_ENFORCED plus import state | `bank-reconciliation-determinism.test.ts`, `journal-idempotency.test.ts` | Medium |
| Posted journal immutability | FAIL | CONVENTION_ONLY | `journal-immutability.test.ts` proves direct DB update exposure and journal-entry cascade deletion inside rolled-back probes. | Critical |
| Tenant isolation | FAIL | SERVICE_ENFORCED in most paths; NOT_ENFORCED for journal account ownership | `tenant-isolation.test.ts` proves `postJournal()` can post tenant B journal lines to tenant A account IDs. | Critical |
| Stock movement append-only | FAIL | SERVICE_ENFORCED convention; not DB-enforced | `stock-ledger-integrity.test.ts` proves direct DB update/delete exposure inside a rolled-back probe. | Critical |
| Stock level reconciles to movement sum | PASS | SERVICE_ENFORCED | `stock-ledger-integrity.test.ts` | High |
| Bank reconciliation deterministic calculations | PASS | SERVICE_ENFORCED | `bank-reconciliation-determinism.test.ts` | Medium |
| FX snapshot integrity | PASS | SERVICE_ENFORCED | `fx-snapshot-integrity.test.ts` | High |
| Audit coverage | PARTIAL | SERVICE/ROUTE_ENFORCED | Matrix in `07-phase0-verification.md`; full before/after audit remains outside Mission 2 tests. | Medium |
| AI finance write boundary | PASS by code inspection | NOT_IMPLEMENTED for writes; SERVICE_ENFORCED for read model | `server/src/ai/business-summary.ts` inspection | Critical |

## Counts

- Mission 2 finance test files: 8
- Mission 2 finance tests: 17
- Finance tests passed: 17
- Finance tests failed by assertion: 0
- Finance tests blocked: 0
- Invariants passed or protected: 11
- Invariants failed or materially partial: 7

## Interpretation

Mission 2B established the first executable financial-kernel baseline. The test suite itself was healthy and repeatable against `vaka_os_test`, but the baseline proved critical remediation was required before enterprise finance migration: tenant-owned journal account validation and database-level immutability controls were not sufficient.

## Mission 2D Remediation Result

| Invariant | Baseline Result | Remediation Result | Protection Layer | Test Evidence |
|---|---|---|---|---|
| Tenant-owned journal accounts | FAIL | PASS | SERVICE_ENFORCED | `tenant-isolation.test.ts` rejects cross-tenant and mixed-tenant account references atomically. |
| Posted journal header immutability | FAIL | PASS | DATABASE_TRIGGER | `journal-immutability.test.ts` rejects direct header update/delete. |
| Posted journal line immutability | FAIL | PASS | DATABASE_TRIGGER | `journal-immutability.test.ts` rejects direct line update/delete. |
| Journal header cascade deletion | FAIL | PASS | FK_RESTRICT plus DATABASE_TRIGGER | Direct DB verification shows `ON DELETE RESTRICT`; deletion tests preserve lines. |
| Stock movement append-only | FAIL | PASS | DATABASE_TRIGGER | `stock-ledger-integrity.test.ts` rejects direct update/delete and allows offsetting movement. |
| Payment retry idempotency | FAIL | PASS when key supplied | SERVICE_ENFORCED plus DATABASE_UNIQUE_INDEX | `journal-idempotency.test.ts` proves duplicate payment key creates no second journal. |
| Expense retry idempotency | FAIL | PASS when key supplied | ROUTE/SERVICE_FLOW plus DATABASE_UNIQUE_INDEX | `journal-idempotency.test.ts` proves duplicate expense key returns original expense. |
| Stock adjustment retry idempotency | FAIL | PASS when key supplied | SERVICE_ENFORCED plus DATABASE_UNIQUE_INDEX | `journal-idempotency.test.ts` proves duplicate stock-adjustment key creates no second movement. |

Mission 2D verification:

- `npm run typecheck`: PASS.
- `npm run test:finance`: 17 passed, 0 failed.
- Existing accounting-oriented tests: 17 passed, 0 failed.
- Full server suite: 86 passed, 0 failed.

## Mission 2E Idempotency Result

| Invariant | Mission 2D Result | Mission 2E Result | Protection Layer | Test Evidence |
|---|---|---|---|---|
| Payment retry idempotency | PASS when key supplied | PASS; key required on risky route and service | ROUTE/SERVICE_ENFORCED plus DATABASE_UNIQUE_INDEX | `journal-idempotency.test.ts` proves missing key rejection, replay safety, conflict rejection, and no duplicate journal. |
| Expense retry idempotency | PASS when key supplied | PASS; key required on risky route | ROUTE_ENFORCED plus DATABASE_UNIQUE_INDEX | `journal-idempotency.test.ts` proves missing key rejection, replay safety, conflict rejection, and no duplicate journal. |
| Stock adjustment retry idempotency | PASS when key supplied | PASS; key required on risky route and service | ROUTE/SERVICE_ENFORCED plus DATABASE_UNIQUE_INDEX | `journal-idempotency.test.ts` proves missing key rejection, replay safety, conflict rejection, and no duplicate movement. |
