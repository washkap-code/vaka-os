# VAKA Finance Phase 0 - Risk Register

## Purpose

Track accounting, compliance, engineering, and AI risks discovered during repository inspection.

## Risk Scale

### Severity

- Critical
- High
- Medium
- Low

### Status

- Open
- Mitigating
- Accepted
- Resolved

## Risk Register

| ID | Risk | Area | Severity | Evidence | Mitigation | Status |
|---|---|---|---|---|---|---|
| RISK-001 | Currency enum too restrictive | Currency | High | `currency` enum only allows `USD`, `ZWG` | Introduce currency master and compatibility adapters. | Open |
| RISK-002 | Product/invoice-line tax rates are authoritative in current flows | Tax | High | `products.taxRate`, `invoice_line_items.taxRate`, invoice line input | Add effective-dated tax engine before changing behavior. | Open |
| RISK-003 | Tenant equals legal entity | Entity model | Critical | `tenants` contains base currency and tax/company registration fields | Add groups/legal entities/org units additively. | Open |
| RISK-004 | Journal header too simple | Ledger | Critical | `journal_entries` lacks status, approval, fiscal period, legal entity, idempotency key, reversal link | Expand journal model after Phase 0 review. | Open |
| RISK-005 | Money precision below target | Precision | High | `money` helper is `NUMERIC(14,2)`; target is `NUMERIC(24,8)` | Plan precision migration and decimal-safe runtime calculations. | Open |
| RISK-006 | Append-only control may be service-level only | Ledger/inventory | Critical | No DB-level update/delete protection found for `journal_lines` or `stock_movements` | Add DB protections and tests after design approval. | Open |
| RISK-007 | AI financial authority undefined | AI finance | High | AI read model/evaluation exists; no governed AI action log/tool authority | Introduce AI action authority model before AI finance automation. | Open |
| RISK-008 | Source idempotency not universal | Posting | High | `je_source` is a non-unique index; workflows rely on status/matched flags | Add idempotency key and duplicate-source tests. | Open |
| RISK-009 | Fiscal period and close controls absent | Close/accounting | Critical | No fiscal calendar/period tables in schema | Add fiscal calendar/periods before enterprise close workflows. | Open |
| RISK-010 | Some reports use JavaScript numbers | Reporting | Medium | `reports.ts` converts aggregates with `Number()` | Return decimal strings or decimal-safe values for finance reporting. | Open |
| RISK-011 | Expense category account tenant validation needs hardening | Expenses | High | Baseline accepted request-supplied category/vendor IDs; current route validates tenant ownership, active EXPENSE type and vendor ownership before writes. | Keep regression tests and apply the same boundary rule to future financial routes. | Remediated |
| RISK-012 | Reconciliation approval does not lock underlying lines | Banking | Medium | Approval updates reconciliation record only | Add statement period locks or immutable reconciliation evidence set. | Open |
| RISK-013 | PO receipt lacks tax, landed cost, supplier subledger | Purchasing | High | `receivePurchaseOrder` posts Inventory/AP for goods only | Add AP subledger, tax treatment, and landed cost model. | Open |
| RISK-014 | Warehouse creation lacks observed audit event | Inventory | Low | `POST /warehouses` now creates `warehouse.created` audit evidence atomically with the warehouse row. | Keep audit coverage in inventory-governance regression tests. | Remediated |
| RISK-015 | Journal lines can reference accounts from another tenant | Tenant isolation | Critical | Baseline `tenant-isolation.test.ts` proved the defect; Mission 2D now rejects cross-tenant and mixed-tenant journal accounts atomically. | `postJournal()` validates every account exists, is active, and belongs to the posting tenant. | Remediated |
| RISK-016 | Zero-value journal lines are allowed inside non-zero journals | Ledger quality | Low | `postJournal()` now rejects a line with both debit and credit at zero; executable test coverage verifies it. | Keep the per-line rule in all future posting-service changes. | Remediated |
| RISK-017 | Journal entry deletion cascades journal line deletion | Ledger immutability | Critical | Baseline proved cascade deletion exposure; Mission 2D changed the FK to `ON DELETE RESTRICT` and added append-only triggers. | DB-level triggers reject journal update/delete and line update/delete; FK rejects header deletion with lines. | Remediated |
| RISK-019 | Stock movement history is mutable/deletable at database level | Inventory ledger | Critical | Baseline `stock-ledger-integrity.test.ts` proved direct update/delete exposure; Mission 2D update/delete probes now fail. | DB-level trigger rejects `stock_movements` update/delete while allowing offsetting movement inserts. | Remediated |
| RISK-020 | Repeated payment, expense, and stock adjustment requests can duplicate financial effects | Idempotency | High | Baseline `journal-idempotency.test.ts` proved duplicate effects; Mission 2E now requires keys on risky routes and rejects same-key/different-payload retries. | Mandatory client or safe server-derived idempotency identities, stored payload fingerprints, and tenant-scoped unique indexes protect targeted workflows. | Remediated |
| RISK-018 | Mission 2 executable verification blocked by local database availability | Test infrastructure | High | Previously blocked by `ECONNREFUSED`; Mission 2B now passes guarded schema prep, 17 finance tests, 17 existing accounting-oriented tests, and 86 full server tests against `vaka_os_test`. | Keep test database guard and rerun before remediation/Mission 3. | Resolved |

## Initial Expected Risks

### RISK-001 - Currency Enum Too Restrictive

Current model appears limited to USD and ZWG.

Mitigation: introduce currency master.

### RISK-002 - Product-Level Tax Rate

Current product model contains tax rate.

Mitigation: move authoritative tax logic to effective-dated tax engine.

### RISK-003 - Tenant Equals Legal Entity

Current tenant model contains company tax and base currency fields.

Mitigation: introduce groups and legal entities.

### RISK-004 - Journal Header Too Simple

Current journal header lacks enterprise posting lifecycle.

Mitigation: expand journal model.

### RISK-005 - Money Precision

Current money precision may not support enterprise and commodity-scale finance.

Mitigation: plan migration to higher precision.

### RISK-006 - Append-Only Control May Be Service-Level Only

Mitigation: add database-level protections and tests.

### RISK-007 - AI Financial Authority Undefined

Mitigation: introduce AI action authority model before AI finance automation.

### RISK-015 - Cross-Tenant Account Reference In Journal Lines

Current posting accepts line account IDs without checking that each account belongs to the journal tenant.

Mitigation: validate account ownership inside the approved posting service before inserting journal lines.

### RISK-018 - Test Database Availability

Mission 2 tests could not execute to assertion completion because no local PostgreSQL service was accepting connections.

Mitigation: document and automate test database startup before Mission 3.

## Mission 2B Evidence Classification

| Risk | Mission 2B Classification | Evidence |
|---|---|---|
| RISK-015 - Cross-tenant account reference in journal lines | EXECUTABLY_PROVEN | `tenant-isolation.test.ts` passed by proving the current cross-tenant account-reference weakness. |
| RISK-016 - Zero-value journal lines are allowed inside non-zero journals | EXECUTABLY_PROVEN | `journal-invalid-lines.test.ts` passed by proving the current zero-value line allowance. |
| RISK-017 - Journal entry deletion cascades journal line deletion | EXECUTABLY_PROVEN | `journal-immutability.test.ts` passed by proving cascade delete exposure inside a rolled-back probe. |
| RISK-018 - Test database availability | RESOLVED | Guarded schema prep and finance tests now execute successfully against `vaka_os_test`. |

## Mission 2D Remediation Classification

| Risk | Mission 2D Status | Evidence |
|---|---|---|
| RISK-015 - Cross-tenant account reference in journal lines | REMEDIATED | `postJournal()` now rejects invalid tenant account IDs before inserting headers/lines; finance tests prove no partial journal. |
| RISK-017 - Journal entry deletion cascades journal line deletion | REMEDIATED | `journal_lines` FK is now `ON DELETE RESTRICT`; update/delete triggers protect `journal_entries` and `journal_lines`. |
| RISK-019 - Stock movement direct mutation | REMEDIATED | `stock_movements_append_only` trigger rejects update/delete; offsetting corrections still insert. |
| RISK-020 - Targeted duplicate financial effects | REMEDIATED_BY_MISSION_2E | risky payment, expense, and stock-adjustment routes now require idempotency identities; same-key/different-payload retries are rejected by fingerprint checks. |
| RISK-016 - Zero-value journal lines | OPEN | Not remediated in Mission 2D because it is low severity and not required for critical integrity boundary. |

## Mission 2E Idempotency Classification

| Risk | Mission 2E Status | Evidence |
|---|---|---|
| RISK-020 - Targeted duplicate financial effects | REMEDIATED | `journal-idempotency.test.ts` now proves required keys, same-key replay safety, same-key/different-payload conflict rejection, and no duplicate journals or stock movements. |

## Risk Review Cadence

Risks must be reviewed:

- before migration;
- before any ledger refactor;
- before tax engine implementation;
- before AI finance implementation;
- before production launch.
