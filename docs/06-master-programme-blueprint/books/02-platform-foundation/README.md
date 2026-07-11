# Book Two - Platform Foundation

**Classification:** Engineering Construction Manual  
**Version:** 1.0 normalized edition  
**Definition:** Accepted target  
**Implementation:** Partial; see Book 5 and Mission Register

## 1. Programme objective

The Platform Foundation is reusable infrastructure used by every VAKA product. It owns contracts and engines, not ERP business outcomes. VAKA ERP, Mail, Network, Verify, Capital, Black Book, Studio, mobile clients, public APIs, AI services, integrations, and future products may not bypass tenant, identity, permission, audit, policy, or data-integrity boundaries.

The current modular monolith is the extraction baseline. Services move behind Platform contracts incrementally; no large rewrite is authorized.

## 2. Construction dependency graph

The source chat listed 15 phases. The normalized order respects already committed mission IDs and permits safe parallel work after dependencies pass:

| Capability | Required scope | Entry dependency | Acceptance gate |
|---|---|---|---|
| Container and configuration | typed DI, service registry, validated configuration, environment/secrets providers, bootstrap, lifecycle, health | engineering foundation | required services resolve explicitly; invalid production config fails closed |
| Identity | authentication, authorisation, RBAC, tenant/organisation context, sessions/devices, API keys, OAuth/SSO/MFA, identity audit/APIs/events/admin | container boundary | tenant and permission negative tests plus independent security test |
| Audit | immutable material-action evidence, catalogue, search/export/APIs, policies, retention, platform admin | identity | every catalogued sensitive action produces minimized, tenant-safe evidence |
| Events | versioned publish/subscribe, transactional outbox, replay controls, idempotency, retries, DLQ, monitoring | container, identity, audit | state and event cannot diverge; tenant-safe replay and failure tests pass |
| Notifications | in-product, email, SMS, push, WhatsApp adapters, queues, templates, consent, retries, provider management/history/analytics | identity, events, audit | approved providers meet reliability, consent, privacy, and failover tests |
| Documents | upload/download, storage, encryption, versions, metadata, malware scan, OCR draft, preview, signing adapters, retention/archive/restore | identity, audit, events | access/version/retention/restore tests and security review pass |
| Search | global/object/document/approved AI search, indexing, incremental updates, permission filters | identity, metadata, events | every supported object is indexed and cross-tenant/permission leakage tests pass |
| Metadata | object, field, relationship, validation, UI, workflow, AI, reporting metadata and APIs | container, identity | accepted metadata drives bounded behavior without replacing domain authority |
| Workflow | definitions, state engine, approvals, escalation, delegation, history, analytics | identity, audit, events, metadata | configured workflows preserve server rules, permissions, idempotency, and history |
| Rules | typed expression engine and domain/country/validation/approval rule packages | metadata, policy | approved rules are effective-dated, testable, explainable, and deployment-independent where safe |
| Policy | security, approval, retention, compliance and AI authority evaluation | identity, metadata, rules | consistent allow/deny decisions with reason, version, audit, and negative tests |
| Reporting | read models, dashboards, widgets, KPIs, schedules, exports, charts | metadata, search, documents, events | tenant-safe reconciled reports are available to approved modules |
| AI Context | context, prompts, tools, memory, conversations, recommendations, automation policy and governance | identity, policy, metadata, audit | each approved use case passes groundedness, authority, privacy, safety, cost, and failure gates |
| Developer Platform | versioned REST/events/webhooks; SDK/CLI/plugin capabilities only when approved | identity, policy, events, metadata | third parties extend through governed contracts without core modification or tenant bypass |
| Observability | structured logs, correlation, metrics, traces, performance/health, alerting, diagnostics | all operational services | every launch-critical flow meets SLO, privacy, alert, dashboard, and runbook requirements |

Identity and container were contradictory in the chat. Existing repository history resolves the sequence: P1-001 established the Kernel/container, P1-002 added Identity/Audit adapters.

## 3. Service construction standard

Every production Platform service provides, as applicable:

- typed contract/interface and implementation;
- DTOs and boundary validators;
- tenant, actor, permission, and policy requirements;
- error codes and safe messages;
- configuration and secret requirements;
- health, metrics, logs, and dependency declarations;
- versioned events and consumer/idempotency behavior;
- repository/provider adapters at the composition root;
- unit, integration, contract, tenant, permission, failure, performance, and security tests;
- service README, API/operations/user documentation, runbook, migration, and rollback;
- owner, consumers, data classification, retention, SLO, and availability status.

No service may silently use global tenant state, import another domain’s tables, expose raw provider behavior, or make financial/stock decisions outside approved domain services.

## 4. Quality gates

Target gates include zero TypeScript/static-analysis errors; passing unit, integration, contract, security, performance, resilience, accessibility and applicable localisation tests; high-risk review; current documentation; Mission Pack; Completion Report; and staged rollout/rollback evidence. The proposed 95% unit-coverage target is applied by risk and package and is not a substitute for integration or invariant tests.

## 5. Programme completion

Platform Foundation is complete only when every launch-scope Platform service is operational and consumed through its contract; duplicated infrastructure is removed after evidence; APIs/events are documented; observability, backup, recovery and security gates pass; and new modules can be added without bypassing Kernel controls.

The existence of a namespace or in-memory reference adapter is “foundation,” not production completion.

## 6. Mission discipline

Platform work is decomposed into reviewable missions. One mission normally produces one PR, review, merge, Completion Report, and traceability update. Existing IDs are permanent. Book 24 is the authoritative catalogue.
