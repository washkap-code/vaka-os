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
| `events` | tenant-aware domain events and subscriptions | in-memory reference bus for tests |
| `workflow` | named orchestration handlers | in-process reference runner |
| `notifications` | locale-aware delivery requests | P1-004 email/in-app adapters composed; SMS/WhatsApp are non-transmitting placeholders |
| `documents` | tenant-scoped document storage/retrieval | injected store contract |
| `search` | tenant- and actor-scoped discovery | injected provider contract |
| `metadata` | extensible typed entity metadata | injected provider contract |
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
5. Migrate document storage only after encryption, malware scanning, retention,
   backup, and recovery controls are approved.
6. Remove duplicate module infrastructure only after production evidence and a
   documented rollback window.

## Notification adoption seam (P1-004)

The composition root exposes `NOTIFICATION_SERVICE`. New notification-producing
modules resolve or receive this service rather than importing provider code.
Email delivery uses an injected, provider-neutral HTTPS transport; in-app
notifications are persisted; SMS and WhatsApp record non-transmitted intent
only. Existing invoice and statement call sites are deliberately unchanged
until P7-001. Tenant-scoped dedupe and read helpers live in the application
adapter, while the Platform namespace remains independent of the database.
