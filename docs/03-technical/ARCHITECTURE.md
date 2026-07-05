# VAKA Technical Architecture

**Status:** Architecture direction
**Owner:** Engineering
**Last reviewed:** 2026-07-04

## 1. Purpose

VAKA is a multi-tenant SaaS operating system for African businesses, launching first in Zimbabwe.

This document defines how the platform should evolve while preserving working behavior and the integrity of customer, financial, inventory, and audit records.

## 2. Architecture principle

The current repository is a compact TypeScript modular monolith:

- React and Vite frontend;
- Express API;
- PostgreSQL;
- Drizzle ORM;
- domain services for accounting, inventory, invoicing, billing, and reporting; and
- Vercel/server and Docker deployment paths.

This is a valid starting point.

Do not perform a large rewrite merely to adopt a fashionable architecture. Split services only when measured scale, isolation, deployment, reliability, ownership, or regulatory needs justify the operational cost.

## 3. Target qualities

VAKA must be:

- strongly tenant-isolated;
- secure and private by design;
- API-first;
- auditable;
- modular;
- mobile-responsive;
- ready for future mobile apps;
- translation-ready;
- resilient under variable connectivity;
- observable;
- recoverable;
- AI-aware; and
- configurable for multiple African countries.

## 4. Logical architecture

```text
Public Web / Tenant Web / Future Mobile Apps
                    |
             Versioned API Layer
                    |
 Authentication · Tenant Context · Permissions · Validation
                    |
 -----------------------------------------------------------
 | CRM | Finance | Inventory | Payroll | HR | POS | Buying |
 | Reporting | Portals | Admin | Settings | Compliance     |
 -----------------------------------------------------------
                    |
        Domain Services and Transactions
                    |
     PostgreSQL · Object Storage · Event Outbox
                    |
 -----------------------------------------------------------
 | Notifications | Payments | Banks | ZIMRA | VAKA AI     |
 | Search | Analytics | Support | Country Adapters         |
 -----------------------------------------------------------
```

## 5. Architectural style

### Modular monolith first

Each module should have:

- owned domain types and rules;
- application services;
- API routes/contracts;
- persistence access;
- permission definitions;
- audit events;
- tests; and
- documented dependencies.

Modules may share platform capabilities but must not reach arbitrarily into one another’s tables or UI state.

### Extract only with evidence

A module may become a separate service when:

- it requires independent scaling or availability;
- it has a distinct security boundary;
- deployment coupling causes material risk;
- a team can own it independently;
- asynchronous processing dominates;
- provider/runtime requirements differ; or
- regulation/data residency requires separation.

## 6. Multi-tenancy

Tenant context is mandatory for every tenant-owned operation.

- Derive tenant identity from authenticated server state.
- Never trust a client-supplied tenant ID as authority.
- Scope reads, writes, caches, files, events, logs, search indexes, exports, and AI context.
- Validate every related record belongs to the same tenant.
- Return safe not-found/forbidden responses without revealing another tenant’s data.
- Add database constraints and PostgreSQL row-level security where appropriate as defence in depth.
- Test cross-tenant access for every new resource and workflow.

Platform administration must use an explicit, strongly protected path.

## 7. Identity and permissions

- Central authentication establishes user, tenant, session, and platform role.
- Role-based permissions are enforced server-side.
- UI visibility is not security.
- Sensitive operations may require approval, step-up authentication, or segregation of duties.
- External portal users receive narrower identities than staff users.
- AI tools use the same permission model.
- Permission and role changes are audited.

## 8. Data and transactions

PostgreSQL remains the preferred system of record because it is already used and supports:

- ACID transactions;
- exact numeric types;
- relational integrity;
- row locking;
- JSON where justified;
- indexing and reporting;
- row-level security; and
- reliable backup/recovery tooling.

Related business effects must be atomic. Financial and stock history remains append-only. Corrections use reversals or offsets.

See `DATABASE-PRINCIPLES.md`.

## 9. API-first platform

All product clients use stable APIs:

- web application;
- future iOS/Android applications;
- customer and supplier portals;
- approved integrations;
- professional partner workspaces using explicit client grants;
- background jobs; and
- VAKA AI tools.

Business rules belong in server-side services, not duplicated in clients.

See `API-PRINCIPLES.md`.

## 10. Frontend and mobile

The web frontend must:

- remain responsive from small mobile screens upward;
- use accessible semantic components;
- externalise translated content;
- separate API/domain data from presentation;
- support loading, empty, error, offline, retry, and permission states;
- avoid desktop-only tables and navigation; and
- keep payloads suitable for variable networks and modest devices.

Future mobile apps should reuse the same API contracts and domain rules. Mobile requirements must not force business logic into device clients.

The target mobile clients are downloadable iOS and Android applications with
secure device sessions, camera/document capture, barcode/QR support, push
notifications, encrypted minimal offline data, and idempotent queued drafts.
OCR output remains an unposted draft until an authorised server-side workflow
validates and approves it.

## 11. Localisation and country packs

English, ChiShona, and isiNdebele are launch languages.

Country-specific rules belong in explicit country packs:

- currency;
- tax;
- payroll;
- statutory identifiers;
- charts of accounts;
- documents;
- payments/banking;
- fiscalisation;
- language/terminology; and
- effective dates.

Zimbabwe is the first country pack, not a permanent hard-coded default.

## 12. Events and automation

Use synchronous transactions for invariants requiring immediate consistency.

Use events for appropriate asynchronous work:

- notifications;
- analytics;
- integrations;
- search indexing;
- scheduled reporting;
- dunning delivery;
- document generation; and
- non-critical AI enrichment.

Prefer a transactional outbox so database state and emitted events cannot disagree.

Every event should include:

- stable event ID;
- tenant ID;
- event type/version;
- actor;
- entity reference;
- occurred-at time;
- correlation/idempotency data; and
- minimal payload.

Consumers must be idempotent, observable, retryable, and tenant-safe.

## 13. AI-aware modules

Modules expose bounded, permission-aware tools rather than unrestricted database access.

AI:

- may explain and recommend;
- must use authoritative deterministic calculations;
- must state uncertainty;
- requires confirmation for consequential actions;
- must be auditable;
- must fail without blocking the core product; and
- must not weaken tenant or privacy boundaries.

See `AI-ARCHITECTURE.md`.

## 14. External integrations

Use adapters for:

- payments;
- banks;
- WhatsApp/SMS/email;
- ZIMRA/fiscalisation;
- file/object storage;
- identity providers;
- analytics;
- AI providers; and
- country-specific services.

For Zimbabwe, the payment-adapter catalogue should evaluate Paynow as an
initial aggregator, direct EcoCash through its official developer programme,
InnBucks through its merchant programme, and additional licensed providers only
after official technical and commercial verification. Provider callbacks pass
through signature verification, an idempotent inbox, a normalised payment state
model, and deterministic allocation/posting services.

Provider code must not leak throughout domain modules. Adapters require timeouts, retries, idempotency, monitoring, and safe degradation.

Professional partner portfolios are not ordinary tenant queries. Cross-tenant
client access requires an explicit, revocable client grant checked on every
request and background task. Referral attribution never grants data access.
Commission and payout records use versioned rules, append-only ledgers,
idempotent subscription events, approval, and reconciliation.

Bank connectivity begins with versioned statement-file parsers and a
provider-neutral transaction/reconciliation contract. Contracted APIs,
host-to-host feeds, SFTP, or regulated aggregators plug into that contract when
available. Browser scraping, stored internet-banking credentials, and SMS
interception are prohibited. Read-only ingestion must be proven before any
outbound bank-payment capability is considered.

## 15. Reliability, backups, and recovery

- Define service objectives for critical workflows.
- Use health checks that include required dependencies.
- Add structured logs, metrics, traces, and correlation IDs.
- Back up PostgreSQL and object storage.
- Encrypt backups and restrict access.
- Store recovery copies in an appropriate separate failure domain.
- Test restoration on a schedule.
- Define RPO and RTO by service tier.
- Document incident, failover, and reconciliation procedures.

A backup is not proven until restoration succeeds.

## 16. Deployment

Environments must be isolated:

- local;
- development;
- test;
- staging;
- production.

Use:

- versioned migrations;
- environment validation;
- secret management;
- reproducible builds;
- automated quality gates;
- staged rollout;
- rollback plans; and
- production observability.

Serverless database connections require managed pooling or equivalent control.

## 17. Architecture decision records

Significant decisions require an ADR documenting:

- context;
- decision;
- alternatives;
- security/privacy impact;
- tenant impact;
- migration;
- rollback;
- operational cost; and
- consequences.

Examples include service extraction, authentication redesign, offline sync, AI provider, country-pack framework, and event infrastructure.
