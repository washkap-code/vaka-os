# VAKA Finance Phase 0 - Financial Write Path Register

## Purpose

This document identifies paths that create, change, or indirectly affect financial data. It reflects current repository behavior as inspected on 2026-07-08.

## Definition of Financial Write Path

A financial write path includes any operation that creates or changes invoices, payments, expenses, journals, bank accounts, bank transactions, reconciliations, stock movements, purchase orders, product costs, tax rates, currency rates, accounts, audit-relevant finance settings, or billing records.

## Write Path Register

| # | User Action / API Route | Service | Tables Written | Journal Created? | Audit Event? | Tenant Checked? | Risk |
|---:|---|---|---|---:|---:|---:|---|
| 1 | `POST /auth/signup` | `signupTenant` | `tenants`, `users`, `roles`, `accounts`, `warehouses`, `subscriptions` | No | Yes/partial | Yes | Tenant is also legal entity. |
| 2 | `PATCH /settings/branding` | route handler | `tenants` | No | Yes | Yes | Tax/company fields live at tenant level. |
| 3 | `POST /bank-accounts` | route handler | `bank_accounts` | No | Yes | Yes | Ledger account optional; fallback bank account may be too simple. |
| 4 | `POST /imports/bank-statement/:id/commit` | `commitBankStatementImport` | `bank_transactions`, import tables | No | Yes | Yes | Import creates financial evidence but no reconciliation lock. |
| 5 | `POST /bank-transactions/:id/post-bank-fee` | `postBankTransactionFee` | `journal_entries`, `journal_lines`, `bank_transactions`, `audit_logs` | Yes | Yes | Yes | Hard-coded expense account code `6400`; exchange rate fixed at `1`. |
| 6 | `POST /bank-transactions/:id/match-transfer` | `matchBankTransactionsAsTransfer` | `journal_entries`, `journal_lines`, `bank_transactions`, `audit_logs` | Yes | Yes | Yes | Same-currency only; no explicit transfer object. |
| 7 | `POST /bank-transactions/:id/match-invoice` | `matchBankTransactionToInvoice` | `payments`, `journal_entries`, `journal_lines`, `invoices`, `bank_transactions`, `audit_logs` | Yes | Yes | Yes | Uses invoice rate snapshot; duplicate payment idempotency not explicit. |
| 8 | `POST /bank-transactions/:id/match-invoices` | `matchBankTransactionToInvoices` | `payments`, `journal_entries`, `journal_lines`, `invoices`, `bank_transactions`, `audit_logs` | Yes | Yes | Yes | Split posting source is bank transaction; per-invoice source idempotency is indirect. |
| 9 | `POST /bank-accounts/:id/reconciliations` | `prepareBankReconciliation` | `bank_reconciliations`, `audit_logs` | No | Yes | Yes | Prepared snapshot is mutable until approval; period locks absent. |
| 10 | `POST /bank-reconciliations/:id/approve` | `approveBankReconciliation` | `bank_reconciliations`, `audit_logs` | No | Yes | Yes | Approval does not lock underlying bank lines. |
| 11 | `POST /products` | route handler | `products`, `audit_logs` | No | Yes | Yes | Product contains default tax rate and cost. |
| 12 | `POST /imports/products/:id/commit` | `commitProductImport` | `products`, import tables | No | Yes | Yes | Imported tax/cost are product-level defaults. |
| 13 | `POST /warehouses` | route handler | `warehouses` | No | No | Yes | No audit event found for warehouse creation. |
| 14 | `POST /stock/adjust` | `adjustStock` | `stock_movements`, `stock_levels`, `journal_entries`, `journal_lines`, `audit_logs` | Yes | Yes | Yes | Service-level append-only; no DB trigger shown. |
| 15 | `POST /stock/opening` | route handler plus inventory/accounting services | `stock_movements`, `stock_levels`, `journal_entries`, `journal_lines` | Yes | Via stock? no explicit opening audit observed | Yes | Duplicate route logic overlaps import path. |
| 16 | `POST /imports/opening-stock/:id/commit` | `commitOpeningStockImport` | `stock_movements`, `stock_levels`, `products`, `journal_entries`, `journal_lines`, import tables | Yes | Yes | Yes | Good controls; product cost is overwritten to import cost. |
| 17 | `POST /purchase-orders` | route handler | `purchase_orders`, `purchase_order_line_items`, `audit_logs` | No | Yes | Yes | Vendor contact and line product tenant checks need continued validation. |
| 18 | `POST /purchase-orders/:id/receive` | `receivePurchaseOrder` | `stock_movements`, `stock_levels`, `products`, `journal_entries`, `journal_lines`, `purchase_orders`, `audit_logs` | Yes | Yes | Yes | Simple latest-cost valuation; no tax/landed cost/AP subledger. |
| 19 | `POST /exchange-rates` | route handler | `exchange_rates`, `audit_logs` | No | Yes | Yes | USD/ZWG enum; no approval/rate type/legal entity. |
| 20 | `POST /invoices` | `createDraftInvoice` | `invoices`, `invoice_line_items`, optional `deals`, `audit_logs` | No | Yes | Yes | Draft line tax rate is direct input. |
| 21 | `POST /invoices/:id/issue` | `issueInvoice` | `invoices`, `journal_entries`, `journal_lines`, `stock_movements`, `stock_levels`, optional `audit_logs` | Yes | Yes | Yes | No fiscal period/approval controls. |
| 22 | `POST /invoices/:id/payments` | `recordPayment` | `payments`, `journal_entries`, `journal_lines`, `invoices`, `audit_logs` | Yes | Yes | Yes | Duplicate source events not explicitly prevented. |
| 23 | `POST /invoices/:id/void` | `voidInvoice` | `journal_entries`, `journal_lines`, `stock_movements`, `stock_levels`, `invoices`, `audit_logs` | Yes when issued | Yes | Yes | Reversal relationship is not first-class. |
| 24 | `POST /expenses` | route handler | `expenses`, `journal_entries`, `journal_lines`, `audit_logs` | Yes | Yes | Partial | Category account tenant validation needs explicit verification. |
| 25 | `GET /bank-reconciliations/:id/report` | `getBankReconciliationReport` | `audit_logs` | No | Yes | Yes | Read report generation is audited; good evidence trail. |
| 26 | Billing cycle/internal | `runBillingCycle`, `markSubscriptionInvoicePaid` | `subscription_invoices`, `subscriptions`, `dunning_events`, `audit_logs` | No tenant ledger | Yes/partial | Yes | Platform billing is separate from tenant accounting ledger. |
| 27 | `GET /ai/read-models/business-summary` | `getBusinessSummary` | `audit_logs` | No | Yes | Yes | Read-only AI context; no action authority implemented. |

## Direct Ledger Writes

| File | Function | Direct Write? | Should Be Refactored? |
|---|---|---:|---:|
| `server/src/accounting.ts` | `postJournal` | Yes | No, this is the approved current posting service. |
| `server/src/invoicing.ts` | `issueInvoice`, `recordPayment`, `voidInvoice` | Through `postJournal` | No. |
| `server/src/inventory.ts` | `adjustStock`, `receivePurchaseOrder` | Through `postJournal` | No. |
| `server/src/imports.ts` | `commitOpeningStockImport` | Through `postJournal` | No. |
| `server/src/bank-reconciliation.ts` | fee/transfer/invoice match functions | Through `postJournal` | No. |
| `server/src/routes.ts` | `/stock/opening`, `/expenses` | Through dynamic `postJournal` import | Consider moving route-local posting logic into services. |

## Invoice Write Paths

- Draft invoice creation validates tenant-scoped contact, computes totals, inserts invoice and lines, optionally links a deal, and audits `invoice.drafted`.
- Invoice issue requires `DRAFT`, assigns immutable number, posts AR/Sales/VAT, posts COGS for stock-tracked lines, records stock movements, sets `ISSUED`, and audits `invoice.issued`.
- Payment allocation inserts payment, posts Bank/AR, updates `amountPaid` and status, and audits payment recording.
- Voiding blocks paid invoices, requires a reason, reverses invoice journals with new journals, offsets stock movements, marks `VOID`, and audits.

## Payment Write Paths

- Manual invoice payment uses invoice currency and invoice rate snapshot.
- Bank transaction matching creates payments from imported statement lines and marks bank transactions matched.
- Split bank matching creates multiple payments and one bank-match journal.

## Expense Write Paths

- Expense creation inserts `expenses`, posts debit to submitted category account and credit to BANK, then audits.
- Current risk: the category account is accepted from the request body and should be explicitly tenant-validated before enterprise migration.

## Inventory Write Paths

- Stock in: opening stock, PO receipt, imports.
- Stock out: issued stock-tracked invoice lines.
- Stock adjustment: `adjustStock` creates offsetting GL entry and stock movement.
- PO receipt: records stock movements, updates product cost price, posts Inventory/AP.

## Bank Reconciliation Write Paths

- Bank statement import stages and commits `bank_transactions` without ledger posting.
- Matching to invoices, posting fees, and transfer matching create journals and mark bank transactions matched.
- Reconciliation preparation snapshots totals and status.
- Reconciliation approval marks a prepared balanced reconciliation approved.

## Risk Summary

### Critical

- No future legal-entity or fiscal-period structure currently exists.
- No database-level proof found for journal/stock append-only immutability.

### High

- Currency enum is limited to USD and ZWG.
- Tax authority is product/line rate, not effective-dated tax rules.
- Source idempotency is indexed but not enforced as a unique posting contract.

### Medium

- Some posting logic remains in route handlers.
- Bank reconciliation approval does not lock all underlying source transactions.
- Reports expose some number-based calculations.

### Low

- Warehouse creation lacks an obvious audit event.
- Platform billing is separate from tenant ledger and should stay clearly labelled.
