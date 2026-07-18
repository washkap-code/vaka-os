# Platform Kernel

The Platform Kernel is an additive boundary for reusable VAKA infrastructure.
It provides contracts and small, dependency-injected service adapters for
identity, audit, events, workflows, notifications, documents, search,
metadata, and the composition boundary used by VAKA Mail.

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

This remains a foundation, not a claim that every Platform capability is live
in production. Events, workflows, notifications, audit/timeline and metadata
have PostgreSQL-backed application adapters in their respective completed P1
missions. VAKA Mail is an internal, default-off consumer of those services;
its provider, operations and release gates are recorded in
`docs/platform/mail-core.md`.
