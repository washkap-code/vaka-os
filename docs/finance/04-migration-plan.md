# VAKA Finance Phase 0 - Controlled Migration Plan

## Purpose

Define the safest migration path from the current accounting model to the enterprise VAKA Finance architecture.

## Migration Principles

1. No destructive migration without backup.
2. No posted financial data may be lost.
3. Existing tenant balances must reconcile before and after migration.
4. Migration must be additive first.
5. Cutover must occur only after dual validation.
6. Existing behavior must remain deployable through compatibility adapters until replaced deliberately.

## Migration Layer A - Enterprise Structure

Add:

- groups;
- legal entities;
- organisational units;
- fiscal calendars;
- fiscal periods;
- currencies.

No existing columns should be removed in this layer.

## Migration Layer B - Backfill Defaults

For every existing tenant:

- create default group;
- create default legal entity;
- create default organisational unit where needed;
- assign tenant base currency;
- assign tax identifiers to legal entity;
- assign existing records to default legal entity.

## Migration Layer C - Journal Header Expansion

Add nullable or defaulted fields:

- legal entity;
- journal number;
- transaction date;
- accounting date;
- fiscal period;
- status;
- approval status;
- posted at;
- posted by;
- reversal relationship;
- idempotency key.

## Migration Layer D - Journal Line Expansion

Add:

- legal entity;
- transaction currency;
- functional currency;
- reporting currency;
- customer;
- supplier;
- project;
- department;
- branch;
- tax code;
- intercompany entity.

## Migration Layer E - Currency Refactor

Replace enum dependency gradually with currency master:

1. Seed `USD` and `ZWG`.
2. Add foreign-key-compatible columns alongside enum fields.
3. Backfill from enum values.
4. Update services to write both.
5. Validate dual reads.
6. Cut over reads to master table.
7. Remove enum dependency only after migration acceptance.

## Migration Layer F - Tax Refactor

Move from product/invoice-line tax rate to tax rule engine:

1. Add tax jurisdictions, tax codes, and tax rates.
2. Map existing product tax rates to default tax codes.
3. Store effective-dated rules.
4. Keep current invoice behavior until dual tax calculation matches expected output.
5. Require qualified tax review before production reliance.

## Migration Layer G - Compatibility Adapters

Keep old workflows operating while new posting engine is introduced. Existing routes should call adapters that translate current invoice, payment, expense, stock, and bank events into the new accounting event model.

## Migration Layer H - Dual Posting Validation

Compare old and new accounting outputs before cutover:

- journal balance;
- trial balance;
- AR ageing;
- bank balances;
- inventory valuation;
- tax totals;
- FX snapshots;
- audit events.

## Rollback Plan

- Take a database backup before every schema and backfill migration.
- Apply additive migrations first so rollback can disable new reads without deleting old data.
- Gate new finance behavior behind configuration flags.
- Keep reconciliation reports for before/after balances.
- Document manual recovery steps for failed backfills.

## Cutover Criteria

- all ledger invariants pass;
- all tests pass;
- trial balance unchanged;
- AR balances unchanged;
- bank balances unchanged;
- stock balances unchanged;
- tax calculations explainable;
- audit logs complete;
- professional accounting/tax review points are documented;
- rollback has been tested in a staging copy.
