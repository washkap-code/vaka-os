# Audit Platform Contract

`AuditService.record()` preserves the existing `audit_logs` adapter contract.
Migration 0051 attaches an in-transaction database mirror to that authoritative
append, so every service record also enters the universal `audit_log` ledger.
Finance continues to own its existing audit behavior and table; the mirror does
not replace or mutate finance evidence.

Universal records contain tenant, actor type, action, canonical object
reference, changed-field snapshots, source and request IP. The append function
serializes writers per tenant and hashes `prev_hash + canonical record content`
with SHA-256. Direct canonical CRUD evidence must use `autoAuditMutation()` so
it is written inside the owning business transaction.

`audit_log` is append-only at database level: UPDATE/DELETE grants are revoked
and a trigger rejects either statement. The platform verification endpoint is
the supported integrity check; break-glass forensic tampering must be treated
as an incident and will make verification fail.
