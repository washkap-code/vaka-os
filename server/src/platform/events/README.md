# Events Platform Contract

Events provide stable, tenant-aware domain-event contracts. The in-memory bus
is a reference adapter for tests and local composition; production workflows
should use a transactional outbox before relying on asynchronous delivery.
