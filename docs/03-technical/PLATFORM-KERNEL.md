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
| `workflow` | versioned, permission-aware orchestration | durable approval engine plus compatible in-process reference runner |
| `notifications` | locale-aware delivery requests | P1-004 email/internal adapters composed; SMS/Push are non-transmitting placeholders |
| `documents` | tenant-scoped document storage/retrieval | P1-007 invoice-PDF/capture adapter composed |
| `search` | tenant- and actor-scoped discovery | P1-006 PostgreSQL Customer/Supplier/Invoice/Product adapter plus PB-003 flag- and country-scoped Black Book projection composed; broader enterprise search gated |
| `metadata` | extensible typed entity metadata | P1-008 compatibility provider plus eight-object schema registry composed; dynamic values and broad adoption gated |
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

## Workflow adoption seam (P1-003 Workflow Engine)

`WORKFLOW_SERVICE` is composed with a PostgreSQL store, `AUDIT_SERVICE` and the
shared `EVENT_BUS`. Definitions and instances are tenant-scoped; step authority
is evaluated through a request-bound `IdentityService`. The existing invoice
issue command is the first adopter and uses a transaction-scoped store/audit/
event adapter so workflow evidence and all existing financial effects remain
atomic. Other approval domains remain on the existing `ApprovalService` until
separately migrated with parity tests.

## Notification adoption seam (P1-004)

The composition root exposes `NOTIFICATION_SERVICE`, the single path for
outbound notification intent. Application callers use the normalised
channel/template/to/data/priority/object-reference command; compatibility
inputs are normalised before provider dispatch. Email delivery retains the
existing injected SMTP transport and byte-identical templates. Internal
notifications persist a tenant-bound user, priority, title/body, link, object
reference and read timestamp; SMS and Push record non-transmitted intent only.
Per-user category/channel preferences default enabled when no row exists.
Authenticated inbox endpoints enforce tenant and current-user scope for list,
unread, read and read-all operations. P7-001 adopts email/in-app delivery for explicitly confirmed, consented
invoice, customer-statement summary and payment-reminder commands. Typed
finance templates, idempotent domain claims and provider-only variable
redaction sit in the application adapter; the Platform namespace remains
independent of finance/database rules. Provider acceptance is not receipt,
read or payment, and automatic dunning/retry/webhook operations remain gated.
Tenant-scoped dedupe and read helpers live in the application adapter.
P5-004 is the first inventory adoption: low-stock breach generations are sent
as persisted `IN_APP` requests through this service. It does not activate
external email, SMS, WhatsApp or push delivery.

P1-003 workflow transition facts are subscribed in process. A started workflow
or an approved transition that leaves another active step resolves the stored
step permission and sends one deduplicated internal notification to each active
tenant user whose role carries it. Terminal workflow events have no pending
approver and intentionally create no inbox record.

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
P1-005 subscribers re-read affected records after committed customer, supplier,
invoice, payment, stock and import facts. PB-003 composes active Black Book
entries as a read-through result source: the provider derives the country from
the authenticated tenant and checks `blackbook.directory` without copying
global registry content into `search_documents`. Delivery remains best-effort;
durable indexing, deletion events, scale evidence and semantic search remain
gated.

## Metadata adoption seam (P1-008)

The composition root exposes `METADATA_SERVICE` backed by an immutable,
code-seeded provider. Company, Customer, Supplier, Invoice and Product
definitions record their current physical lineage, permissions, localisation
keys, navigation, search/result fields and fail-closed future-AI exposure.
`/metadata/objects` derives tenant and permissions from verified authentication
and returns no record values. P1-006 now obtains searchable-object permissions,
searchable fields and result descriptors from this registry while retaining
explicit, tenant-safe canonical queries. Metadata cannot select arbitrary
tables, execute rules or grant data access. Custom metadata writes, the target
Party/Organisation/LegalEntity model and any AI context builder remain gated.

The same composition root also exposes `METADATA_REGISTRY`, an immutable
schema-shape registry for Company, Customer, Supplier, Invoice, Payment,
Product, Employee and User. Its queries and strict payload validation are pure
and make no database calls. Field names are regression-pinned to the current
Drizzle definitions; exact decimal values remain strings. The registry is an
internal contract only: it does not alter `/metadata/objects`, search, existing
write validation, permissions, audit behaviour or UI generation.

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
