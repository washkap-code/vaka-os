# P1-005 — Event bus: emit domain events from existing write paths

**Status:** Approved — ready to build
**Programme:** 1 — Platform
**Type:** Infrastructure (additive, zero behaviour change)
**Depends on:** P1-002 (merged), P1-001 event-bus contracts

## Objective

Make important business actions observable by publishing **domain events**
through the kernel `EventBusContract` (from P1-001) at the exact points where
they already happen. Subscribers run in-process, synchronously after the
committing transaction, and are non-fatal: a subscriber error is logged and
never rolls back or fails the originating request. This is the backbone that
P3-003 (customer timeline), P5-004 (low-stock alerts), P6-003 (workbench) and
P1-008 (metadata/search indexing) consume.

This mission **emits** events and proves them with subscriber tests. It does
**not** build any consumer feature — those are their own missions. No user-
visible behaviour changes.

## Event catalogue (first set)

Emit these, each with a typed payload carrying only IDs + minimal scalar facts
(never whole records; consumers re-read within permissions):

| Event type | Emitted from | Payload (ids + scalars) |
|---|---|---|
| `invoice.issued` | invoicing issue path | `invoiceId, customerId, currency, totalCents, issuedAt` |
| `payment.recorded` | payment path | `paymentId, invoiceId, customerId, currency, amountCents` |
| `invoice.voided` | void path | `invoiceId, reason?` |
| `stock.moved` | inventory movement path | `movementId, productId, warehouseId, qtyDelta, kind` |
| `stock.adjusted` | adjustment path | `movementId, productId, warehouseId, qtyDelta` |
| `tenant.lifecycle_changed` | lifecycle transition | `tenantId, from, to` |

Event `type` strings are constants in one registry file so consumers never
hard-code literals.

## Design rules

- **Emit after commit.** Publish only once the DB transaction that created the
  fact has committed. Prefer an after-commit hook / post-transaction publish so
  a failed transaction emits nothing.
- **Tenant + actor on every event** (`tenantId`, `actorUserId`) from the
  verified context, using the existing `PlatformEvent` shape.
- **Subscribers are best-effort and isolated.** One subscriber throwing must not
  affect the request or other subscribers; errors are captured and logged
  (structured), optionally audited as `event.subscriber_failed`.
- **In-process only.** No Kafka/Redis/queue. The `EventBus` implementation from
  P1-001 (in-memory) is the transport; a future mission can swap the adapter
  without changing emit sites.
- **No payload PII beyond IDs and the scalars listed.** Consumers re-read.
- **Idempotency-friendly.** Each event has a stable `id`; re-emitting the same
  fact (e.g. retried request) should be safe for idempotent consumers — document
  the guarantee, don't enforce dedupe here.

## Deliverables

1. `server/src/platform/events/registry.ts` — event-type constants + payload
   TypeScript types for the catalogue above.
2. `server/src/platform/events/adapters/publisher.ts` — `emitDomainEvent()`
   helper that resolves `EVENT_BUS` from the kernel and publishes; plus an
   after-commit publish utility so emit sites schedule publication post-commit.
3. Emit calls inserted at the existing write paths (invoicing, inventory,
   lifecycle) — **additively**, next to the existing `audit()` calls, changing
   no control flow.
4. Composition: register `EVENT_BUS` token in `platform-runtime.ts` bound to the
   P1-001 in-memory `EventBus`; `buildPlatformKernel` returns a fresh bus per
   build (test isolation).
5. Tests: publishing/subscription; after-commit ordering (no emit on rollback);
   subscriber isolation (one throws, others still run, request unaffected);
   tenant/actor propagation; registry type-safety.

## Forbidden

- Changing any existing control flow, response, or transaction boundary.
- Introducing external message infrastructure.
- Emitting before commit or inside the committing transaction in a way that
  couples delivery to DB success.
- Building consumers (timeline/alerts/search) — separate missions.

## Test plan

- Unit: `emitDomainEvent` publishes to subscribers with correct type/payload;
  registry constants match payload types.
- After-commit: a simulated failed transaction emits nothing; a successful one
  emits exactly once.
- Isolation: a throwing subscriber is caught; sibling subscriber still receives
  the event; the originating call returns normally.
- Tenant/actor: events carry the verified tenant and actor.
- DB-backed integration (where a write path is exercised): issuing an invoice
  publishes `invoice.issued` with the right ids after the row is committed.

## Acceptance criteria

- `npm run typecheck` (server + web) clean.
- Full DB-backed suite green (`cd server && npm run test:db:prepare && npm test`);
  all existing finance/inventory tests unchanged and passing.
- New event tests pass; zero behaviour change to existing endpoints.
- CHANGELOG + a new `docs/03-technical/EVENT-CATALOGUE.md` documenting the events.

## Rollback

Revert the merge; emit calls are additive and side-effect-free when no
subscriber is registered. No schema or data changes.
