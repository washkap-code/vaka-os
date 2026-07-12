# Book Seven - Platform Services

**Version:** 1.0  
**Definition:** Accepted service-contract catalogue  
**Implementation:** P1 Kernel foundation plus incremental adapters

## 1. Service contract

Every service exposes a narrow typed interface, explicit tenant/actor scope, permissions, version, configuration, dependencies, health, metrics, events, errors, consumers, data classification, retention, SLO, tests, documentation, migration, rollback and owner. Provider adapters are registered at the composition root.

Platform services may orchestrate reusable infrastructure but may not bypass domain services or write operational modules’ authoritative tables.

## 2. Identity Service

Establishes actor, tenant, legal entity/operating context, role permissions, session and device. Target extensions include MFA, step-up, API clients, OAuth/OIDC/SSO, recovery, session rotation, device trust, segregation of duties and identity lifecycle. Platform-admin access is explicit, separately audited, minimal, and never implicitly grants tenant scope.

## 3. Container, configuration and secrets

Typed DI composes services without global service-location in business code. Configuration is typed, environment-aware and validated at startup. Secrets remain external, rotated, least-privileged and absent from logs/config APIs. Health distinguishes liveness, readiness and dependencies.

## 4. Audit Service

Records append-only evidence for a governed catalogue of material/sensitive actions. It supports tenant/platform partitions, correlation, actor and reason, minimized metadata, access controls, search/export, retention/legal hold and forensic integrity. Audit failure behavior is specified per action; high-risk writes fail safely when required evidence cannot be recorded.

## 5. Event Service

Uses a transactional outbox for durable domain events, versioned envelopes, idempotent consumers, bounded retries, DLQ, observability and controlled replay. Events never replace transactions required for finance/stock/billing/numbering/audit atomicity.

## 6. Notification Service

Normalizes in-product, email, SMS, push and WhatsApp delivery. It owns locale-aware templates, consent/opt-out, provider routing, credential isolation, rate limits, queues, retries, deduplication, delivery history, redaction, analytics and safe degradation. Domain modules request communications; providers do not own business state.

## 7. Document Service

Owns tenant-scoped object storage, upload/download authorization, hashes, versions, metadata, encryption, malware scanning, OCR as untrusted draft, previews, signature adapters, retention/legal hold, archive/restore, backup and evidence. Signed/issued documents snapshot historical content and branding.

## 8. Search Service

Indexes approved canonical objects and document metadata through tenant- and permission-aware projections. It supports incremental updates, deletion/retention propagation, ranking, filters, pagination, observability and rebuild. Search authorization is evaluated at query/result time; index membership never grants access.

## 9. Metadata Service

Registers canonical objects, fields, relationships, types, validation references, UI hints, workflow/rule hooks, reporting semantics, AI exposure and localisation keys. Metadata extends behavior within governed limits; it cannot redefine finance, stock, security or statutory invariants.

## 10. Workflow, rules and policy

- Workflow runs versioned state machines, approvals, delegations, escalation and history with concurrency/idempotency.
- Rules evaluates typed, sandboxed, effective-dated expressions owned by the relevant domain/country pack.
- Policy returns explainable versioned authority decisions for security, approval, retention, compliance and AI actions.

All three are deterministic, testable, observable and protected from arbitrary code execution.

## 11. Reporting Service

Provides reconciled read models, measures/dimensions, widgets, dashboards, scheduled output and exports. Reports declare as-at time, currency, filters, source lineage and reconciliation. Large exports run as tenant-safe jobs and are auditable.

## 12. AI Context Service

Builds the minimum permission-approved context for a named use case; registers prompts/tools/evidence; applies privacy, retention, injection and authority policy; records material model/tool versions; and fails without blocking deterministic VAKA workflows. It does not offer raw database access.

## 13. Developer and Studio services

Expose approved versioned APIs, events and webhooks with credentials, scopes, quotas, idempotency, sandbox, documentation, deprecation and support. SDK, CLI, plugins and builders are added through missions after needs and security boundaries are accepted.

## 14. Observability and security services

Correlation, structured redacted logs, metrics, traces, SLOs, alerts, diagnostics, feature flags, configuration evidence, vulnerability/incident signals and operational dashboards cover every launch-critical flow. Security is a cross-cutting control, not a single perimeter service.

## 15. Completion matrix

Each service advances through contract -> reference adapter -> production adapter -> first consumer -> migration coverage -> observability/operations -> security/performance evidence -> GA. The current repository contains Platform namespaces and focused tests for many contracts, but durable providers and universal consumption remain incomplete.
