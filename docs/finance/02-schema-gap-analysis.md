# VAKA Finance Phase 0 - Schema Gap Analysis

## Purpose

Compare the current VAKA schema against the target VAKA Finance & Accounting Intelligence Architecture.

## Current Schema Strengths

- Tenant-scoped finance records exist across accounting, invoicing, inventory, banking, imports, and billing.
- `journal_entries` and `journal_lines` provide a double-entry ledger model.
- `stock_movements` provides an append-oriented inventory ledger with cached `stock_levels`.
- Sequential document numbering exists through `number_sequences`.
- Exchange rate snapshots are stored on invoices and journal lines.
- Audit logs exist for many material finance actions.

## Gap Matrix

| Domain | Current State | Target State | Gap Severity | Proposed Action |
|---|---|---|---|---|
| Tenant/entity | Tenant holds company, tax, base currency | Tenant -> Group -> Legal Entity -> Organisational Unit | Critical | Add enterprise structure tables additively. |
| Currency | PostgreSQL enum `currency` with `USD`, `ZWG` | Currency master table with ISO support, rate types, effective dating | High | Introduce currency master and adapters. |
| Money precision | `NUMERIC(14,2)`, quantity `NUMERIC(12,3)`, rates `NUMERIC(18,6)` | Core ledger `NUMERIC(24,8)` | High | Inventory all money columns and migrate in controlled layers. |
| Ledger header | Tenant/date/memo/source/createdBy | Legal entity, status, period, approval, posting lifecycle, idempotency, reversal link | Critical | Expand journal headers additively. |
| Ledger lines | Account/debit/credit/original amount/currency/rate | Dimensions, tax, intercompany, multi-currency reporting fields | High | Add optional dimensions after legal entity model. |
| Tax | Product and invoice-line `taxRate` | Effective-dated tax jurisdictions/codes/rates/rules | High | Introduce tax tables before changing calculation behavior. |
| Inventory valuation | Latest product cost and stock movements | Valuation layers, FIFO/weighted average, landed cost | High | Add valuation model and dual validation. |
| Banking | Imported bank lines, matching, reconciliation snapshots | Evidence-backed matching, locks, approvals, confidence | Medium | Add reconciliation locks and matching evidence fields. |
| Audit | `audit_logs` with metadata | Append-only audit events with reason, before/after, session, actor, AI evidence | Medium | Extend audit schema or add `audit_events`. |
| Permissions | RBAC permissions array | RBAC + ABAC, approval limits, entity scope | Medium | Add policy model after legal entities/units. |
| AI finance | Read model and evaluation harness | Governed AI authority, proposed actions, approvals, audit | High | Add AI action log and tool policy before AI writes. |

## Tenant and Entity

### Current

`tenants` represents both workspace and company identity. It contains base currency, tax number, VAT number, registration number, and physical address.

### Target

Tenant -> Group -> Legal Entity -> Organisational Unit.

### Migration

Every existing tenant receives:

- default group;
- default legal entity;
- default organisational unit where needed.

## Currency

### Current

`currency` is a PostgreSQL enum with `USD` and `ZWG`. It is used in tenants, deals, exchange rates, invoices, payments, expenses, bank accounts, products, purchase orders, subscription plans/invoices, and journal line original currency.

### Target

Currency master table with ISO support, effective dates, rate types, source, approval, and legal/entity context where required.

### Migration

Map existing enum values into a currency master, keep compatibility adapters, then migrate references gradually.

## Money Precision

### Current

The schema uses:

- `money`: `NUMERIC(14,2)`
- `qty`: `NUMERIC(12,3)`
- `rate`: `NUMERIC(18,6)`

Runtime money arithmetic mostly uses integer cents and string values. Some reports convert aggregate values to JavaScript numbers.

### Target

`NUMERIC(24,8)` for core ledger and finance calculations.

### Migration Risk

Tables requiring precision review include `journal_lines`, `invoices`, `payments`, `expenses`, `bank_transactions`, `bank_reconciliations`, `products`, `stock_levels`, `stock_movements`, `purchase_orders`, `purchase_order_line_items`, `subscription_invoices`, and reporting queries.

## Ledger

### Current

`journal_entries` has tenant/date/memo/source/createdBy/createdAt. `journal_lines` has account/debit/credit/original amount/original currency/exchange rate. Balancing is enforced in `postJournal`.

### Target

Journal lifecycle, status, period, approval, legal entity support, idempotency key, reversal relationship, and posting metadata.

## Tax

### Current

Products have `taxRate`; invoice line items store `taxRate`. Invoice totals and VAT postings are calculated from line input.

### Target

Effective-dated tax rules, tax jurisdictions, tax codes, tax rates, customer/product treatment, exemption evidence, and professional review.

## Inventory

### Current

`stock_movements` records quantity delta and unit-cost snapshot; `stock_levels` caches quantity. PO receipt updates product `costPrice` to latest unit cost.

### Target

Valuation layers, FIFO/weighted average policy, landed costs, stock revaluation controls, and inventory subledger reconciliation.

## Banking

### Current

Bank accounts, imported bank transactions, matching to invoices/fees/transfers, reconciliation preparation/approval, and reports exist.

### Target

AI-assisted matching with confidence, evidence, reviewer actions, reconciliation locks, statement-period controls, and bank-feed provenance.

## Audit

### Current

Tenant `audit_logs` and platform `platform_audit_logs` exist. Metadata is JSONB.

### Target

Append-only audit events with before/after, reason, session, actor, source system, model/tool evidence where AI is involved, and retention policy.

## Permissions

### Current

RBAC uses role permissions arrays and server-side `requirePermission`.

### Target

RBAC + ABAC with legal entity/unit scope, approval limits, segregation of duties, and AI action authority.

## Required Migration Tables

- `groups`
- `legal_entities`
- `organisational_units`
- `currencies`
- `fiscal_calendars`
- `fiscal_years`
- `fiscal_periods`
- `accounting_events`
- `accounting_policies`
- `tax_jurisdictions`
- `tax_codes`
- `tax_rates`
- `audit_events`
- `ai_action_logs`
