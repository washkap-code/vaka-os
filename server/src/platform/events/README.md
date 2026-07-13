# Events Platform Contract

Events provide stable, tenant-aware domain-event contracts. P1-005 composes the
in-memory bus and publishes typed invoice, payment, stock and tenant-lifecycle
facts after their database transactions commit. Subscriber failures are
isolated and do not fail sibling subscribers or the originating request.

This adapter is best-effort and process-local. It has no replay, retry,
dead-letter or cross-process durability. Workflows that depend on guaranteed
delivery require a transactional outbox and idempotent consumers. The governed
catalogue is `docs/03-technical/EVENT-CATALOGUE.md`.
