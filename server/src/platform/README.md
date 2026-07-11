# Platform Kernel

The Platform Kernel is an additive boundary for reusable VAKA infrastructure.
It provides contracts and small, dependency-injected service adapters for
identity, audit, events, workflows, notifications, documents, search, and
metadata.

P1-001 deliberately does not wire these services into the existing Express
routes or business modules. Existing authentication, audit, finance,
document, and database behaviour remains authoritative until a later migration
has an approved contract, tests, and rollback plan.

## Dependency direction

Platform services depend on contracts and injected providers. ERP and future
modules may depend on Platform contracts; Platform must not import ERP route,
ledger, or UI code. Provider adapters should be added at composition roots,
not hidden inside service implementations.

## Status

This is a foundation, not a claim that every Platform capability is live in
production. The in-memory event, workflow, and metadata adapters are testable
reference implementations only.
