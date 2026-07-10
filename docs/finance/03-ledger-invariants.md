# VAKA Finance Phase 0 - Ledger Invariants

## Purpose

Define the non-negotiable accounting truths that must hold before and after migration.

## Invariant 1 - Balanced Journals

For every journal:

`SUM(debit) = SUM(credit)`

Current behavior: `postJournal` checks balance before inserting.

## Invariant 2 - No Negative Debit or Credit Lines

Debit and credit values must not be negative.

Current behavior: `postJournal` rejects negative values.

## Invariant 3 - Line Must Not Be Both Debit and Credit

A line must not contain both a positive debit and a positive credit.

Current behavior: `postJournal` rejects such lines.

## Invariant 4 - Journal Must Have At Least Two Lines

Single-line journals are invalid.

Current behavior: `postJournal` requires at least two lines.

## Invariant 5 - Source Idempotency

The same source event must not create duplicate posted journals.

Current behavior: `journal_entries` has a non-unique source index. Some workflows prevent repeat actions by status or matched flags, but a universal idempotency key was not found.

## Invariant 6 - Posted Journal Immutability

Posted journals and lines must not be edited through normal service paths.

Current behavior: services create reversing or offsetting records. Database-level update/delete protection for `journal_lines` was not found.

## Invariant 7 - Reversal Integrity

A reversal journal must fully offset the original journal.

Current behavior: `voidInvoice` maps previous invoice journal lines with debit/credit swapped. No first-class reversal relationship field exists.

## Invariant 8 - Tenant Isolation

No query or write may mix tenant financial data.

Current behavior: finance services and routes generally use tenant-scoped queries from authenticated context. Some related child-table access relies on parent scoping and should remain tested.

## Invariant 9 - Subledger Reconciliation

AR, AP, bank, and inventory subledgers must reconcile to control accounts once the relevant modules are implemented.

Current behavior: AR, bank, inventory, AP, and stock workflows exist, but formal subledger reconciliation tables and close controls are not implemented.

## Invariant 10 - FX Snapshot Integrity

A posted journal must retain the exchange rate used at posting time.

Current behavior: invoices store `rateToBase`; journal lines can store `originalAmount`, `originalCurrency`, and `exchangeRate`.

## Current Test Coverage

| Invariant | Existing Test? | Test File | Gap |
|---|---:|---|---|
| Balanced journals | Yes | `server/tests/critical.test.ts` | Add direct test for successful balanced insert and persisted line totals. |
| Non-negative debit/credit | Yes | `server/tests/critical.test.ts` | Expand to credit-negative case. |
| No both-side line | Yes | `server/tests/critical.test.ts` | Good service-level coverage. |
| Minimum two lines | No explicit | None found | Add direct `postJournal` test. |
| Source idempotency | Partial | Status/matched tests in critical/bank tests | Add explicit duplicate-source tests or document current absence. |
| Posted immutability | No explicit | None found | Add service and database-level immutability tests after control design. |
| Reversal integrity | Partial | Invoice void behavior implied | Add test that reversal fully offsets original lines. |
| Tenant isolation | Yes/partial | `critical`, `business-summary`, import tests | Add finance-specific cross-tenant tests per write path. |
| Subledger reconciliation | Partial | Trade-cycle report tests | Add AR/AP/bank/inventory reconciliation tests. |
| FX snapshot | Partial | `critical.test.ts` | Add tests proving later rate changes do not alter posted history. |

## Tests to Add

| Test | Purpose | Priority |
|---|---|---|
| `journal-service.balancing.test.ts` | Prove journal balance, two-line minimum, non-negative, one-sided-line rules. | High |
| `journal-service.immutability.test.ts` | Prove posted journals and lines cannot be changed through approved service paths. | High |
| `journal-service.idempotency.test.ts` | Prove duplicate source events do not create duplicate journals or document current gap. | High |
| `tenant-isolation.finance.test.ts` | Prove every finance read/write scopes by authenticated tenant. | Critical |
| `bank-reconciliation.deterministic.test.ts` | Prove worksheet, approval, and report calculations are deterministic. | Medium |
| `stock-movements.append-only.test.ts` | Prove stock corrections use offsetting movements and history is preserved. | High |
| `fx-snapshot.integrity.test.ts` | Prove later exchange-rate updates do not rewrite posted journals. | High |
