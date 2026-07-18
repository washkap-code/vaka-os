# Migration Hub Core

This module provides registry-driven CSV imports for Customer, Supplier, and
Product records. It complements the existing project-based Migration Hub and
does not import opening balances or financial transactions.

## Pipeline

Each stage is an explicit, resumable API operation:

1. Upload parses a bounded CSV document and persists immutable source rows.
2. Map validates column targets against the canonical `MetadataRegistry`.
3. Validate coerces CSV values, applies registry rules, and detects natural-key
   duplicates (`email`, `taxNumber`, or `sku`).
4. Import writes all currently valid rows in one transaction and records
   row-level creation or update evidence.
5. Rollback first verifies that imported records are unchanged and have no
   dependent records. It then reverts the entire job in one transaction, or
   blocks the entire rollback with per-row reasons.

Every API is authenticated, tenant-scoped, and protected by the exact
`migration:run` permission. All lifecycle writes are audited. Only the
`migration.completed` event is published, after the import transaction commits.
Canonical audit entries are appended in one ordered database call so large
imports retain one tamper-evident record per object without per-row network
round trips.

## Safety boundaries

- Source files are limited to 10,000 data rows, 100 columns, and 2 MB decoded.
- Credentials, financial transactions, opening balances, and ledger records are
  outside this module.
- `update-existing` stores the pre-import record so rollback can restore it.
- `create-anyway` still honours database uniqueness constraints; Product SKU is
  schema-unique and therefore cannot be duplicated.

## Product and operations contract

- User and outcome: an authorised implementation operator can move up to
  10,000 master-data rows with visible row-by-row results and a safe inverse.
- Permission: `migration:run`; tenant identity is accepted only from the
  authenticated request context.
- Audit and data protection: raw and mapped rows remain tenant-owned; events
  contain only job/object identifiers and counts; canonical changes enter the
  tamper-evident universal audit chain.
- Failure behaviour: malformed input creates no job, an import failure commits
  no canonical rows, and a blocked rollback changes no canonical rows.
- Mobile and localisation: no UI is introduced in this mission. API clients
  may translate stable error codes/messages when a migration UI is delivered.
