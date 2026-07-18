# Events Platform Contract

Events provide stable, tenant-aware domain-event contracts. P1-005 composes the
in-memory bus and publishes typed invoice, payment, stock and tenant-lifecycle
facts after their database transactions commit. Subscriber failures are
isolated and do not fail sibling subscribers or the originating request.

P1-003 adds typed workflow transition facts. Transaction-scoped workflow
publishers enqueue these through the same post-commit boundary, so rolled-back
domain work publishes no workflow event.

This adapter is best-effort and process-local. It has no replay, retry,
dead-letter or cross-process durability. Workflows that depend on guaranteed
delivery require a transactional outbox and idempotent consumers. The governed
catalogue is `docs/03-technical/EVENT-CATALOGUE.md`.
