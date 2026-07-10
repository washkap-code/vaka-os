# VAKA Finance Mission 2 - Phase 0 Verification

## Purpose

This document verifies the Phase 0 finance audit against the current codebase before any enterprise finance schema migration. It records code evidence, executable tests added, and infrastructure limits encountered during execution.

## Execution Status

- `npm run typecheck` in `server/`: PASS.
- `NODE_ENV=test DATABASE_URL="postgresql://vaka_test:vaka_test@127.0.0.1:5432/vaka_os_test" npm run test:db:prepare`: PASS.
- `NODE_ENV=test DATABASE_URL="postgresql://vaka_test:vaka_test@127.0.0.1:5432/vaka_os_test" PLATFORM_ADMIN_PASSWORD="local-test-admin-password-2026" npm run seed`: PASS.
- `NODE_ENV=test DATABASE_URL="postgresql://vaka_test:vaka_test@127.0.0.1:5432/vaka_os_test" npm run test:finance`: PASS, 17 tests.
- Existing accounting-oriented tests: PASS, 17 tests.
- Full `npm test` in `server/`: PASS, 25 files and 86 tests.
- Route-level Supertest execution is no longer blocked in the prepared local PostgreSQL environment.

## Files Inspected

- `AGENTS.md`
- `docs/finance/00-current-state-audit.md`
- `docs/finance/01-financial-write-paths.md`
- `docs/finance/02-schema-gap-analysis.md`
- `docs/finance/03-ledger-invariants.md`
- `docs/finance/04-migration-plan.md`
- `docs/finance/05-risk-register.md`
- `docs/finance/06-codex-next-steps.md`
- `docs/finance/decision-record-template.md`
- `server/src/db/schema.ts`
- `server/src/accounting.ts`
- `server/src/invoicing.ts`
- `server/src/inventory.ts`
- `server/src/imports.ts`
- `server/src/bank-reconciliation.ts`
- `server/src/reports.ts`
- `server/src/routes.ts`
- `server/src/auth.ts`
- `server/src/ai/business-summary.ts`
- `server/tests/*.test.ts`

## Audit Finding Verification

| Finding | Documentation Claim | Code Evidence | Verified? | Correction Needed? |
|---|---|---|---:|---:|
| Tenant currently acts as accounting/legal entity | Tenant contains company identity, base currency, tax identifiers; no legal entity model | `tenants` table has `companyName`, `baseCurrency`, `taxNumber`, `vatNumber`, `registrationNumber`; no `legal_entities` table | Yes | No |
| Supported currency enum is limited | Currency enum only supports USD and ZWG | `currency = pgEnum("currency", ["USD", "ZWG"])` | Yes | No |
| Current money precision | Money uses `NUMERIC(14,2)`; target is `NUMERIC(24,8)` | `const money = numeric(... precision: 14, scale: 2)` | Yes | No |
| Product-level tax rate behavior | Products store tax defaults | `products.taxRate` with default `15` | Yes | No |
| Invoice-line tax rate behavior | Invoice lines store tax rate and invoice input supplies it | `invoiceLineItems.taxRate`; `DraftLine.taxRate`; `computeTotals()` uses line tax rate | Yes | No |
| Journal structure | Journal header is simple and lacks enterprise lifecycle fields | `journal_entries` has tenant/date/memo/source/createdBy/createdAt only | Yes | No |
| Journal balancing enforcement | Balanced journals are service-enforced | `postJournal()` sums debit/credit and throws if unequal | Yes | No |
| Invalid journal line enforcement | Negative and both-sided lines rejected; single-line and zero-value journals rejected | `postJournal()` checks negative, both-side, line count, and total zero | Yes | Add nuance: zero-value line inside a non-zero journal is currently allowed by service logic. |
| Source posting behavior | Source index is non-unique; idempotency is not universal | `je_source` is an index, not unique; payment and expense paths have no idempotency key | Yes | No |
| Audit logging | Many material actions audit; not complete enterprise audit | `audit()` inserts to `audit_logs`; routes/services call audit for invoices, payments, stock, imports, bank reconciliation; warehouse creation has no observed audit | Yes | No |
| Tenant filtering | Most service queries filter by tenant | Invoicing, inventory, bank reconciliation, imports, reports generally include tenant filters | Partial | Strengthen finding: `postJournal()` does not verify that line account IDs belong to the journal tenant. |
| Bank reconciliation | Deterministic worksheet and approval functions exist | `getBankReconciliationWorksheet()`, `prepareBankReconciliation()`, `approveBankReconciliation()` use deterministic SQL and stored snapshot values | Code-verified; tests added | No |
| Stock movement append-only behavior | Append-only is service convention, not DB-enforced | `recordStockMovement()` inserts rows; schema has no update/delete block on `stock_movements` | Yes | No |
| AI access to financial information | AI read model is deterministic/read-only; no finance action agent exists | `getBusinessSummary()` reads tenant-scoped journal, invoice, inventory, CRM data based on permissions | Yes | No |

## Corrections To Phase 0

- The Phase 0 finding about expense account tenant validation is stronger than first documented: the lower-level `postJournal()` service accepts account IDs without checking that each account belongs to the posting tenant. The `/expenses` route exposes that risk because it passes `categoryAccountId` from the request into journal lines.
- Invalid line enforcement should distinguish whole zero-value journals from zero-value lines. Whole zero-value journals are rejected; zero-value lines inside an otherwise non-zero balanced journal are not explicitly rejected.
- Mission 2 could not provide route/API executable evidence in this sandbox because listener binding is denied. Existing repository Supertest tests are affected by the same environment restriction.

## Enforcement Classification

| Invariant / Control | Current Protection Layer | Evidence |
|---|---|---|
| Journal debit total equals credit total | SERVICE_ENFORCED | `postJournal()` balance check |
| Journal has at least two lines | SERVICE_ENFORCED | `postJournal()` line count check |
| Negative debit/credit rejected | SERVICE_ENFORCED | `postJournal()` negative amount check |
| Both debit and credit on same line rejected | SERVICE_ENFORCED | `postJournal()` both-side check |
| Zero-value journal rejected | SERVICE_ENFORCED | `postJournal()` total zero check |
| Zero-value line rejected | NOT_ENFORCED | No per-line zero check when total journal is non-zero |
| Source idempotency | PARTIAL / ROUTE_OR_STATE_ENFORCED | Invoice issue and PO receipt block via status; bank imports use source keys; payments/expenses/stock adjustments lack idempotency |
| Posted journal immutability | CONVENTION_ONLY | No update/delete route found; DB schema allows update/delete and journal line cascade from journal entry delete |
| Stock movement append-only | CONVENTION_ONLY / SERVICE_ENFORCED | Supported services insert offsetting movements; DB schema does not prevent update/delete |
| Tenant isolation on reads/writes | SERVICE_AND_ROUTE_ENFORCED in most paths; NOT_ENFORCED in journal line account ownership | Tenant filters common; `postJournal()` does not validate account tenant |
| FX snapshot preservation | SERVICE_ENFORCED | Invoice `rateToBase` and journal line `exchangeRate` are stored at posting time |
| Bank reconciliation determinism | SERVICE_ENFORCED | SQL worksheet and stored reconciliation snapshot |
| AI finance write boundary | NOT_IMPLEMENTED for writes; read boundary SERVICE_ENFORCED | `getBusinessSummary()` is read-only and permission-aware |

## Source Idempotency Matrix

| Source | Duplicate Attempt | Current Protection | Duplicate Journal Possible? | Severity |
|---|---|---|---:|---|
| Invoice issue | Issue same invoice twice | Business-state protection: only `DRAFT` invoices issue | No through service | Medium |
| Manual invoice payment | Submit same partial payment twice | Outstanding balance only; no idempotency key | Yes when outstanding remains | High |
| Expense | Submit same expense request twice | No idempotency key in route-local flow | Yes | High |
| PO receipt | Receive same PO twice | Business-state protection: `RECEIVED` blocks repeat | No through service | Medium |
| Stock adjustment | Submit same adjustment twice | No idempotency key; each adjustment treated as a new event | Yes | Medium |
| Bank statement import | Commit same batch twice / re-import same lines | Batch state plus `banktx_account_source` unique index | No for same source key | Medium |

## Audit Coverage Matrix

| Financial Action | Journal? | Audit Event? | Actor Recorded? | Source Recorded? | Before/After State? |
|---|---:|---:|---:|---:|---:|
| Draft invoice | No | Yes | Yes | Entity ID | No |
| Issue invoice | Yes | Yes | Yes | Invoice ID and number metadata | Partial |
| Payment receipt | Yes | Yes | Yes | Invoice ID | Partial |
| Void invoice | Yes when issued | Yes | Yes | Invoice ID and reason | Partial |
| Expense recorded | Yes | Yes | Yes | Expense ID | No |
| Stock adjustment | Yes when value > 0 | Yes | Yes | Product ID / movement source | Partial |
| PO receipt | Yes | Yes | Yes | PO ID | No |
| Bank statement import | No | Yes | Yes | Import batch and bank account | No |
| Bank fee posting | Yes | Yes | Yes | Bank transaction and journal ID | Partial |
| Bank transfer match | Yes | Yes | Yes | Bank transaction IDs and journal ID | Partial |
| Reconciliation prepare/approve/report | No | Yes | Yes | Reconciliation ID | Stored snapshot, not full before/after |
| Warehouse creation | No | No observed | No | No | No |

## AI Finance Boundary

- Financial tables read by the business-summary read model: `journal_entries`, `journal_lines`, `accounts`, `invoices`, `contacts`, `products`, `stock_levels`, and `deals`.
- Tenant scope is enforced in the read model SQL with `context.tenantId`.
- Permissions are section-level: `reports.read`, `accounting.read`, `inventory.read`, and `crm.read`.
- The read model does not write financial data, call posting services, or invoke external AI providers.
- Returned values are deterministic record/calculation sections, not model-generated ledger facts.
- Existing AI evaluation tests cover tenant isolation, permission compliance, action confirmation, and hallucination-style metrics with synthetic candidates.
- No VAKA CFO, finance agent, AI posting tool, or AI action authority layer is currently implemented.

## Mission 2 Test Files Added

- `server/tests/finance/helpers.ts`
- `server/tests/finance/journal-balancing.test.ts`
- `server/tests/finance/journal-invalid-lines.test.ts`
- `server/tests/finance/journal-idempotency.test.ts`
- `server/tests/finance/journal-immutability.test.ts`
- `server/tests/finance/tenant-isolation.test.ts`
- `server/tests/finance/stock-ledger-integrity.test.ts`
- `server/tests/finance/bank-reconciliation-determinism.test.ts`
- `server/tests/finance/fx-snapshot-integrity.test.ts`

## Verification Limits

Mission 2B produced executable PostgreSQL evidence. Remaining limits are product/control limits, not test-infrastructure limits: several current weaknesses are now proven and require remediation before enterprise finance migration.
