# Platform Kernel Foundation (P1-001)

**Status:** Foundation contracts added; existing application wiring unchanged
**Mission:** P1-001 Platform Kernel Foundation
**Version:** 1.0

## Purpose

The Platform Kernel establishes reusable infrastructure boundaries for VAKA's
current ERP capabilities and future CRM, HR, Projects, Marketplace, Mail,
Black Book, and country-pack modules. It is an additive extraction seam, not a
rewrite and not a claim that every service is live in production.

## Namespaces

| Namespace | Contract responsibility | P1-001 implementation posture |
|---|---|---|
| `identity` | actor, tenant, session, and permission context | adapter contract only |
| `audit` | structured material-action evidence | injected sink contract |
| `events` | tenant-aware domain events and subscriptions | P1-005 post-commit in-process adapter composed; durable delivery gated |
| `workflow` | named orchestration handlers | in-process reference runner |
| `notifications` | locale-aware delivery requests | P1-004 email/in-app adapters composed; SMS/WhatsApp are non-transmitting placeholders |
| `documents` | tenant-scoped document storage/retrieval | P1-007 invoice-PDF/capture adapter composed |
| `search` | tenant- and actor-scoped discovery | P1-006 PostgreSQL Customer/Invoice/Product adapter composed; broader enterprise search gated |
| `metadata` | extensible typed entity metadata | P1-008 immutable canonical registry composed; dynamic values and broad adoption gated |
| `shared` | clocks, identifiers, logging, JSON-safe values | injected runtime helpers |
| `types` | reusable type helpers and tenant-scope assertions | small contract utility |
| `container` | explicit constructor dependency injection | memoised value/factory container |

Every namespace contains `README.md`, `index.ts`, `interfaces.ts`, `types.ts`,
`errors.ts`, `service.ts`, and focused tests under `tests/`.

## Dependency rules

1. Platform services depend on contracts and injected providers.
2. Business modules may depend on Platform contracts, not the reverse.
3. Provider adapters belong at a composition root and must not be hidden in a
   service constructor.
4. Tenant and actor scope are explicit in identity, audit, document, search,
   metadata, notification, workflow, and event contracts.
5. No Platform service writes directly to ERP tables or bypasses domain
   services, permissions, audit, or financial invariants.
6. Events used for durable cross-module work require a transactional outbox,
   idempotent consumers, retry policy, and dead-letter handling before
   production adoption.

## Compatibility boundary

P1-001 does not change:

- Express routes or API responses;
- authentication, JWTs, sessions, or RBAC behaviour;
- PostgreSQL schema or migrations;
- accounting, inventory, billing, invoicing, or reporting behaviour;
- existing document/capture storage paths; or
- frontend/UI behaviour.

The current services remain the source of truth. Future extraction work must
introduce one adapter at a time, prove parity with existing tests, and retain a
rollback path.

## Dependency injection

`container/ServiceContainer` supports typed symbol tokens, singleton values,
and memoised factories. It is deliberately not a service locator for business
code: constructors should receive the narrow contract they require. The
container is available for future composition roots but is not globally
instantiated by the existing application during this mission.

## Security and privacy requirements

- Never infer tenant identity from user input when an authenticated context is
  available.
- Providers must enforce tenant scope on reads, writes, caches, indexes,
  events, files, exports, and AI context.
- Audit metadata must be minimised and must not contain secrets or unnecessary
  personal data.
- Document and notification providers must validate content, consent,
  retention, and access before delivery.
- Search providers must not expose records merely because a query matches.
- Platform administrators require explicit, separately audited access.

## Future migration sequence

1. Add composition-root registration without changing call sites.
2. Wrap the existing audit writer and identity context behind adapters.
3. Add parity tests for each migrated service and tenant boundary.
4. Introduce an outbox-backed event adapter before asynchronous workflows.
5. Migrate to external object storage only after encryption, malware scanning,
   retention, backup, and recovery controls are approved.
6. Remove duplicate module infrastructure only after production evidence and a
   documented rollback window.

## Notification adoption seam (P1-004)

The composition root exposes `NOTIFICATION_SERVICE`. New notification-producing
modules resolve or receive this service rather than importing provider code.
Email delivery uses an injected, provider-neutral HTTPS transport; in-app
notifications are persisted; SMS and WhatsApp record non-transmitted intent
only. P7-001 adopts email/in-app delivery for explicitly confirmed, consented
invoice, customer-statement summary and payment-reminder commands. Typed
finance templates, idempotent domain claims and provider-only variable
redaction sit in the application adapter; the Platform namespace remains
independent of finance/database rules. Provider acceptance is not receipt,
read or payment, and automatic dunning/retry/webhook operations remain gated.
Tenant-scoped dedupe and read helpers live in the application adapter.
P5-004 is the first inventory adoption: low-stock breach generations are sent
as persisted `IN_APP` requests through this service. It does not activate
external email, SMS, WhatsApp or push delivery.

## Event adoption seam (P1-005)

The composition root exposes `EVENT_BUS`. Existing invoice, payment, stock and
tenant-lifecycle write paths queue typed facts beside their transactional work;
the publisher releases those facts only after a successful commit. Subscriber
errors are isolated and event payloads carry stable identifiers, tenant/actor
context and minimal scalar facts. This is a best-effort, process-local seam,
not durable messaging. See `EVENT-CATALOGUE.md` for the governed contract and
explicit operational limits.

## Search adoption seam (P1-006)

The composition root exposes `SEARCH_SERVICE` backed by a tenant-owned,
rebuildable PostgreSQL index. An authenticated `/search` route supplies verified
actor, tenant and permissions; the provider applies tenant and entity-read
permission filters again. Canonical records remain authoritative. Lazy tenant
reconciliation indexes pre-existing Customers, Invoices and Products, while
P1-005 subscribers re-read affected records after committed customer, invoice,
payment, stock and import facts. Delivery remains best-effort; durable indexing,
deletion events, scale evidence, semantic search and user-facing global search
remain gated.

## Metadata adoption seam (P1-008)

The composition root exposes `METADATA_SERVICE` backed by an immutable,
code-seeded provider. Company, Customer, Invoice and Product definitions record
their current physical lineage, permissions, localisation keys, navigation,
search/result fields and fail-closed future-AI exposure. `/metadata/objects`
derives tenant and permissions from verified authentication and returns no
record values. P1-006 now obtains searchable-object permissions, searchable
fields and result descriptors from this registry while retaining explicit,
tenant-safe canonical queries. Metadata cannot select arbitrary tables, execute
rules or grant data access. Custom metadata writes, the target
Party/Organisation/LegalEntity model and any AI context builder remain gated.

## Document adoption seam (P1-007)

The composition root exposes `DOCUMENT_SERVICE` over the existing immutable
invoice issue snapshots, immutable finance-report snapshots and encrypted
capture payloads. Authenticated invoice downloads, opaque public invoice share
links, finance-report snapshot retrieval, and capture create/detail paths
consume this service without changing their HTTP contracts. Kind-qualified
identifiers, explicit tenant/actor scope and provider-level tenant filters fail
closed across document domains. P7-002 rerenders finance documents only from
captured report/branding inputs and verifies stored byte size and SHA-256 before
release. It does not create a public report link or provider delivery. Capture
list/review remains its existing workflow; external object storage, malware
scanning, OCR, retention automation and general document management remain
gated.
