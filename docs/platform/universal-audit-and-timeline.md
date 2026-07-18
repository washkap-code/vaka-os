# Universal Audit and Timeline

**Mission:** P1-006  
**Status:** Implemented technical foundation  
**Migration:** `0051_platform_universal_audit.sql`

## Outcome and boundaries

The universal audit ledger gives an authorised user one object history without
weakening the existing finance evidence path. Finance continues to write its
authoritative `audit_logs` rows. A database trigger mirrors those rows into
`audit_log` in the same transaction. The mirror does not change posting,
approval, tax, currency, stock or reversal behavior.

Company, Customer, Supplier, Product and Employee mutation paths add a second,
canonical record containing only changed metadata-registry fields. This covers
existing create/update/delete paths, including supported imports and contact
soft deletion. Objects without a delete operation do not gain one.

## Integrity model

Each tenant has an independent chain. `vaka_append_audit_log()`:

1. takes a transaction-scoped advisory lock derived from the tenant ID;
2. resolves the current unreferenced chain tip;
3. hashes `prev_hash + canonical record content` with SHA-256; and
4. appends the new row before releasing the transaction lock.

`audit_log` rejects UPDATE and DELETE through both revoked public grants and a
database trigger. The table comment and migration are the authoritative
operational control. A platform administrator with
`platform.tenant_audit.read` can call:

`GET /api/v1/platform/audit/verify?tenantId=<uuid>`

The response reports validity, checked row count, first broken record and a
bounded failure reason. It never returns record content or hash material. A
failed check is an incident signal; operators should preserve the database and
logs before attempting recovery.

## Universal Timeline API

`GET /api/v1/objects/:type/:id/timeline?page=1&pageSize=25`

Supported types are Company, Customer, Supplier, Invoice, Payment, Product,
Employee and User. Type matching is case-insensitive; IDs remain UUIDs. Results
are reverse chronological and merge:

- universal audit entries;
- persisted platform events;
- workflow actions joined through their tenant-scoped instance;
- notification facts for the same object reference.
- linked mail messages, but only when the caller also holds `mail.read` (or
  `mail.manage`) and can access the owning mailbox.

Notification bodies, variables and recipients are not returned. Audit
before/after data is restricted to fields the metadata registry marks as API
exposed. Event payloads are reduced to approved identifiers and minimal status,
amount, currency, step, quantity and change facts.
Mail entries expose the subject, direction, read state and internal
thread/account identifiers; message bodies, addresses and attachments remain
behind the mailbox endpoints.

## Permission matrix

| Object | Required permission |
| --- | --- |
| Company | `settings.manage` |
| Customer | `crm.read` |
| Supplier | `inventory.read` |
| Invoice, Payment | `accounting.read` |
| Product | `inventory.read` |
| Employee | `payroll.read` |
| User | `users.manage` |

Every source query also includes the authenticated tenant ID. A cross-tenant or
missing object returns not found. Financial object history is never returned
without `accounting.read`.

## Rollback and operations

The down migration can discard only records derived from the legacy audit
table. It refuses rollback after canonical `source = 'auto'` evidence exists,
because that history has no authoritative predecessor. Restore testing must
verify both audit continuity and chain integrity.

`test:db:prepare` reapplies the function and trigger controls after Drizzle
schema push so development/test databases match migration-built databases.
Production deploys must use the ordered migration chain; Drizzle push is not a
production migration mechanism.

Open follow-on work includes retention/legal hold, governed export, correlation
IDs, platform-partition unification, alerting for failed verification, and a
permission-aware UI timeline.
