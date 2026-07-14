# VAKA Database Principles

**Status:** Technical standard
**Owner:** Engineering and Data
**Last reviewed:** 2026-07-04

## 1. System of record

PostgreSQL is VAKA’s preferred transactional system of record and is already used by the repository.

Adopt another database only for a specific workload with documented need, ownership, backup, security, consistency, and operational consequences.

## 2. Tenant isolation

- Every tenant-owned root record carries a non-null `tenant_id`.
- Queries derive tenant context from authentication.
- Reads and writes include tenant scope even when IDs are globally unique.
- Related records must belong to the same tenant.
- Unique constraints are tenant-scoped where the value is tenant-specific.
- Foreign-key design should enforce tenant consistency where practical.
- PostgreSQL row-level security should be evaluated as defence in depth.
- Administrative cross-tenant queries use explicit privileged paths.
- Tests attempt direct and indirect cross-tenant access.

Tenant isolation applies to migrations, exports, backups, replicas, analytics, search, files, events, and AI retrieval.

## 3. Ownership and boundaries

Each module owns its tables and write rules.

- Other modules use services or documented read models.
- Avoid ungoverned cross-module writes.
- Shared tables have explicit owners.
- Reporting queries must not mutate operational state.
- AI receives bounded views/tools, never unrestricted credentials.

## 4. Identifiers

- Prefer UUIDs for externally visible records.
- Do not treat UUIDs as authorisation.
- Business document numbers are separate from internal IDs.
- Issued numbers are tenant-scoped, sequential where required, immutable, and allocated atomically.

## 5. Money and quantities

- Use PostgreSQL `NUMERIC` or exact integer minor units.
- Never use binary floating point for authoritative calculations.
- Store currency with monetary values where ambiguity is possible.
- Snapshot exchange rates at transaction time.
- Store original amount/currency and base amount as required.
- Define rounding per business rule and currency.
- Use exact quantity precision suitable for inventory units.
- Convert to JavaScript `number` only for non-authoritative presentation where safe.

## 6. Ledger integrity

Financial and stock ledgers are append-only.

- Posted journal entries balance.
- Stock movements retain direction, quantity, cost, reason, source, actor, and time.
- Corrections create reversals/offsets.
- Destructive mutation of posted history is prohibited.
- Related CRM, finance, stock, numbering, and audit effects occur in one transaction.
- Database permissions/triggers may reinforce append-only behavior.

## 7. Audit logging

Audit records should include:

- tenant;
- actor/user/service;
- action;
- entity type and ID;
- timestamp;
- correlation/request ID;
- material before/after or structured metadata;
- reason for consequential corrections; and
- source channel.

Do not place passwords, tokens, unnecessary personal data, or full sensitive payloads in audit metadata.

Audit logs require retention, access control, export, and tamper-resistance policies.

## 8. Schema design

- Use clear, consistent names.
- Make nullability intentional.
- Prefer database constraints for invariant facts.
- Use enums cautiously when values must vary by country or effective date.
- Index tenant/filter/order columns used by real queries.
- Avoid unbounded JSON when relational structure matters.
- Store timestamps with time zone; define business date separately where required.
- Store country and locale codes using approved standards.
- Effective-date tax, payroll, currency, and compliance rules.

## 9. Migrations

- Every production schema change uses a committed versioned migration.
- Do not rely on direct schema push in production.
- Migrations are reviewed, tested on representative size, and reversible or recoverable.
- Destructive changes use expand/migrate/contract.
- Backfills are restartable, observable, tenant-safe, and rate-controlled.
- Application compatibility is maintained during staged rollout.
- Migration state is monitored.

## 10. Concurrency and idempotency

- Use transactions and locks for shared balances, sequences, stock, and state transitions.
- Avoid read-modify-write races.
- Financial, POS, payroll, integration, and event commands use idempotency keys where retries are possible.
- Enforce uniqueness at the database when it represents a true invariant.
- Test concurrent operations.

## 11. Events and outbox

When state changes must publish events:

- write domain state and outbox record in one transaction;
- publish asynchronously;
- retain event ID, tenant, type/version, aggregate, actor, and timestamp;
- minimise sensitive payload;
- make consumers idempotent;
- support retry and dead-letter handling; and
- monitor delivery lag/failure.

Events do not replace transactions for immediate invariants.

## 12. Privacy and retention

- Classify personal, financial, payroll, authentication, and sensitive business data.
- Collect only required data.
- Define retention per record type and market.
- Separate operational deletion from immutable legal/audit retention.
- Treat generated finance-report snapshots as append-only integrity evidence;
  preserve tenant, source/template versions, exact checksum and creation actor.
  Retention, legal hold and privacy erasure require an explicit reviewed
  lifecycle rather than an ad-hoc delete path.
- Support lawful export/correction/deletion processes.
- Mask data in non-production environments.
- Restrict production access and record privileged access.

## 13. Backups and recovery

- Automated PostgreSQL backups and point-in-time recovery where supported.
- Encrypted backups with least-privileged access.
- Separate failure domain/region consistent with legal requirements.
- Object/file backups included.
- Documented RPO and RTO.
- Regular restore drills.
- Reconciliation after restore/failover.
- Retention and secure disposal.

Restore tests must validate tenant isolation, ledger balance, document integrity, and application compatibility.

## 14. Performance and scale

- Measure before denormalising.
- Use query plans and production-like data.
- Paginate large reads.
- Prevent N+1 queries.
- Use connection pooling suitable for deployment topology.
- Add read models/materialised summaries only with reconciliation rules.
- Partition only with demonstrated need.
- Archive according to policy without making audit history inaccessible.

## 15. Country expansion

Do not hard-code one market’s:

- currencies;
- taxes;
- payroll bands;
- identifiers;
- document formats;
- chart of accounts;
- fiscalisation state; or
- retention rules

into shared core logic.

Use versioned, effective-dated country configuration and validated adapters.
