# VAKA Finance Phase 0 - Current State Audit

## Purpose

This document maps the current VAKA OS repository before any enterprise finance migration. It records observed behavior only; target architecture items are not claimed as implemented.

## Additive implementation note — 2026-07-13

The Phase 0 observations below remain historical evidence of the repository at
the time inspected. Subsequent approved missions added effective-dated country
configuration (P2-001), immutable invoice VAT treatment evidence (P2-002), and
a read-only posted-ledger VAT technical report (P2-003). P2-003 calculates
output/input/net VAT in exact cents for a selected period and exports
reconcilable CSV/PDF evidence. It remains explicitly not filing-ready because
supplier input-VAT, filing workflow, legal-entity isolation, fiscalisation and
qualified Zimbabwean tax/accounting approval are incomplete.

## Repository Summary

- Repository: `washkap-code/vaka-os`
- Server framework: Express with TypeScript
- Database: PostgreSQL
- ORM: Drizzle ORM
- Test framework: Vitest and Supertest
- Frontend framework: React, Vite, TypeScript, plain CSS
- Authentication: JWT, tenant context, lifecycle gate, RBAC permissions
- AI components: deterministic business-summary read model and synthetic AI evaluation harness; no production model/provider action layer found

## Files Inspected

- Root governance: `AGENTS.md`
- Foundation docs: `docs/00-foundation/VAKA-CONSTITUTION.md`, `docs/00-foundation/PRODUCT-PHILOSOPHY.md`, `docs/00-foundation/BRAND-POSITIONING.md`
- Technical standards: `docs/03-technical/CODING-STANDARDS.md`
- AI/product docs: `docs/02-product/VAKA-AI-BLUEPRINT.md`, `docs/05-ai/*`
- Schema and migrations: `server/src/db/schema.ts`, `server/drizzle/*.sql`
- Services: `server/src/accounting.ts`, `server/src/invoicing.ts`, `server/src/inventory.ts`, `server/src/imports.ts`, `server/src/bank-reconciliation.ts`, `server/src/reports.ts`, `server/src/billing.ts`, `server/src/ai/business-summary.ts`
- API/auth/core: `server/src/routes.ts`, `server/src/auth.ts`, `server/src/lib.ts`, `server/src/app.ts`, `server/src/index.ts`
- Seed/tests: `server/src/seed.ts`, `server/tests/*.test.ts`
- Frontend finance touchpoints: `web/src/App.tsx`, `web/src/api.ts`, `web/src/locales/app.en.ts`, `web/src/locales/home.en.ts`

## Application Structure

- Root files: repository instructions, server workspace, web workspace, foundation/product/technical docs.
- Server workspace: Express API, Drizzle schema, domain services, imports, reporting, billing, AI read models, tests.
- Web workspace: React/Vite app consuming API routes and English locale files.
- Database files: canonical Drizzle schema in `server/src/db/schema.ts`; incremental SQL migrations in `server/drizzle/`.
- Route files: finance routes are concentrated in `server/src/routes.ts`.
- Service files: accounting, invoicing, inventory, imports, bank reconciliation, reports, billing.
- Test files: critical trade cycle, bank import/reconciliation, bank invoice matching, product/opening-stock imports, AI read models/evaluation, settings, referrals, billing.
- Seed files: `server/src/seed.ts` seeds platform/application data.

## Existing Finance Tables

| Table | Purpose | Tenant Scoped | Financial Impact | Keep / Refactor / Replace |
|---|---|---:|---:|---|
| `tenants` | Workspace/company identity, base currency, tax identifiers | Yes | Yes | ALTER |
| `number_sequences` | Sequential invoice/PO/payment numbers | Yes | Yes | KEEP |
| `accounts` | Chart of accounts | Yes | Yes | ALTER |
| `exchange_rates` | Tenant exchange rates | Yes | Yes | MIGRATE |
| `invoices` | Customer invoice headers | Yes | Yes | ALTER |
| `invoice_line_items` | Invoice detail and tax rate snapshots | Via invoice | Yes | ALTER |
| `payments` | Invoice payments | Yes | Yes | ALTER |
| `journal_entries` | Journal headers | Yes | Yes | ALTER |
| `journal_lines` | Double-entry ledger lines | Via journal/account | Yes | ALTER |
| `expenses` | Expense records | Yes | Yes | ALTER |
| `bank_accounts` | Registered bank accounts | Yes | Yes | ALTER |
| `bank_transactions` | Imported bank statement lines | Via bank account | Yes | ALTER |
| `bank_reconciliations` | Prepared/approved reconciliation snapshots | Yes | Yes | ALTER |
| `products` | Sellable/purchasable items, costs, tax defaults | Yes | Yes | ALTER |
| `stock_levels` | Cached stock quantity | Via product/warehouse | Yes | KEEP |
| `stock_movements` | Append-only stock ledger | Yes | Yes | ALTER |
| `purchase_orders` | Purchase order headers | Yes | Yes | ALTER |
| `purchase_order_line_items` | Purchase order detail | Via PO | Yes | ALTER |
| `plans` | Platform subscription products | No | Billing | KEEP |
| `subscriptions` | Tenant subscription state | Yes | Billing | KEEP |
| `subscription_invoices` | VAKA billing invoices | Yes | Billing | KEEP |
| `dunning_events` | Billing follow-up events | Via subscription invoice | Billing | KEEP |
| `audit_logs` | Tenant audit log | Yes | Control | ALTER |
| `platform_audit_logs` | Platform audit log | Platform | Control | KEEP |
| `import_batches` | Import workflow state | Yes | Indirect | KEEP |
| `import_rows` | Import row staging | Via batch | Indirect | KEEP |

## Existing Operational Tables Affecting Finance

| Table | Operational Domain | Creates Accounting Effect? | Current Risk |
|---|---|---:|---|
| `contacts` | CRM customers/vendors | Indirect | Customer/vendor roles are not separate AR/AP subledgers. |
| `deals` | CRM pipeline | Indirect | Winning can link to invoice but not a governed accounting event model. |
| `products` | Inventory/catalogue | Yes | Product-level `taxRate` and latest-cost update are too simple for enterprise tax/valuation. |
| `warehouses` | Inventory locations | Indirect | No organisational-unit or branch linkage. |
| `import_batches` / `import_rows` | Data migration/imports | Yes for product/opening stock/bank transactions | Import controls are service-level; enterprise approvals/evidence can be expanded. |

## Existing Finance Services

| File | Function / Route | Financial Action | Risk |
|---|---|---|---|
| `server/src/accounting.ts` | `postJournal` | Creates journal header and lines, validates balance | No database-level balance constraint or source idempotency uniqueness. |
| `server/src/invoicing.ts` | `createDraftInvoice` | Creates draft invoice and lines | Tax rate supplied per line; no effective-dated tax authority. |
| `server/src/invoicing.ts` | `issueInvoice` | Assigns invoice number, posts revenue/VAT/COGS, stock out | Uses current product cost; no period/legal-entity controls. |
| `server/src/invoicing.ts` | `recordPayment` | Inserts payment, posts Bank/AR, updates invoice status | Source idempotency is not explicit. |
| `server/src/invoicing.ts` | `voidInvoice` | Reverses invoice journals and stock movements | Reversal relationship is in source metadata, not first-class schema. |
| `server/src/inventory.ts` | `recordStockMovement` | Appends stock movement and updates stock level | Append-only is service convention; DB-level update/delete prevention not shown. |
| `server/src/inventory.ts` | `adjustStock` | Posts stock adjustment journal and audit | Uses general expense account 6900 by code. |
| `server/src/inventory.ts` | `receivePurchaseOrder` | Stock in, updates product cost, posts Inventory/AP | No supplier subledger, tax split, landed cost, or valuation layer. |
| `server/src/imports.ts` | `commitOpeningStockImport` | Stock movements plus opening equity journal | Good controlled import path; still no legal entity/fiscal period. |
| `server/src/imports.ts` | `commitBankStatementImport` | Inserts bank transactions only | Correctly non-posting; relies on later match/post actions. |
| `server/src/bank-reconciliation.ts` | match/post functions | Match payments, fees, transfers to journals | Good tenant scoping; source idempotency and reconciliation lock model need expansion. |
| `server/src/routes.ts` | `/expenses` | Creates expense and bank-credit journal | Category account is client-provided and needs stronger tenant/account validation. |
| `server/src/routes.ts` | `/exchange-rates` | Creates exchange rate | Currency enum limited to USD/ZWG. |
| `server/src/reports.ts` | Reports | Ledger-derived reporting | Some report math returns JavaScript numbers, not decimal-safe presentation values. |
| `server/src/ai/business-summary.ts` | AI read model | Read-only deterministic context | Not a model provider/action layer; finance AI authority remains target architecture. |

## Existing Tests

| Test File | What It Covers | Gaps |
|---|---|---|
| `server/tests/critical.test.ts` | Journal balance validation, trade cycle, oversell rollback, multi-currency invoice, tenant isolation | No explicit immutability/idempotency tests. |
| `server/tests/bank-statement-imports.test.ts` | Bank import, reconciliation, fee posting, transfer matching, permissions | Does not prove fiscal close locks or source idempotency across all posting paths. |
| `server/tests/bank-invoice-matching.test.ts` | Invoice matching and split allocations | More duplicate-source and cross-tenant edge cases needed. |
| `server/tests/product-imports.test.ts` | Product import without stock posting | Does not validate tax engine target rules. |
| `server/tests/opening-stock-imports.test.ts` | Opening stock import and controls | No DB-level append-only protection. |
| `server/tests/business-summary.test.ts` | AI read model permissions, tenant isolation, audit minimisation | No production AI provider/tool execution. |
| `server/tests/ai-evaluation*.test.ts` | Synthetic AI safety/evaluation | Not connected to live finance actions. |

## Initial Findings

### Strengths

- Financial writes are mostly centralised through `postJournal`, `recordStockMovement`, and transactional domain services.
- Invoice issue, PO receipt, stock movement, COGS, payment, audit, and status updates are generally atomic.
- Bank statement imports do not post to the ledger automatically.
- Tenant scoping and RBAC are visible across finance routes.
- Tests cover major trade-cycle behavior and several tenant-isolation cases.

### Risks

- Currency is an enum limited to USD and ZWG.
- Money precision is mostly `NUMERIC(14,2)` with cent-based arithmetic; target enterprise precision is `NUMERIC(24,8)`.
- Tenant currently acts as company/legal entity; no group/legal-entity/organisational-unit model exists.
- Tax treatment is product/line rate driven, not effective-dated tax-rule driven.
- Journal lifecycle lacks status, approval, fiscal period, legal entity, reversal link, and idempotency key fields.
- Append-only controls appear service-level for journal lines and stock movements, not database-enforced.
- Finance AI is read-model/evaluation groundwork, not a governed AI action authority layer.

### Unknowns Requiring Further Inspection

- Production migration history and whether all deployed databases match the current Drizzle schema.
- Any downstream reporting/export consumers not present in this repository.
- Professional Zimbabwean accounting/tax/legal review status for default accounts and VAT treatment.
- Whether unpublished finance architecture documents exist outside this repository.
