# VAKA OS Master Programme Blueprint

**The Operating System for African Business**  
**Designed in Zimbabwe. Built for Africa.**

**Edition:** 1.0  
**Effective:** 2026-07-11  
**Classification:** Internal engineering programme baseline

> This is a complete target blueprint, not a claim that every capability is implemented or available. Source authority and status rules are defined in the governance section.

---

<div style="page-break-after: always"></div>

<!-- source: docs/06-master-programme-blueprint/00-governance/DOCUMENT-CONTROL.md -->

# Document control

**Document:** VAKA OS Master Programme Blueprint  
**Edition:** 1.0  
**Classification:** Internal engineering programme baseline  
**Status:** Active  
**Effective:** 2026-07-11  
**Owner:** VAKA leadership  
**Custodian:** Architecture Office  
**Review cadence:** At each architecture-changing ADR and at least quarterly

## Purpose

This blueprint defines what VAKA OS must become and the controlled method used to build, verify, release, operate, and commercialise it. It is designed to let humans and AI coding agents execute small missions without inventing product scope or architecture.

## Controlled change

- Frozen architecture changes require an accepted ADR.
- Product behavior changes require an approved PRD or Mission Pack with measurable acceptance.
- Accounting changes additionally require finance authority, reversal, audit, currency, tax, legal-entity, and professional-review answers.
- Country, legal, tax, privacy, security, and localisation assertions require qualified market review before GA.
- The source Markdown is reviewed and version controlled. The combined Markdown and PDF are regenerated; they are never hand-edited.

## Review and approval roles

| Decision | Required accountable role |
|---|---|
| Constitution or frozen architecture | VAKA leadership |
| Platform or data architecture | Architecture and Security |
| Accounting/tax/currency | Finance authority plus qualified professional review |
| Identity, tenant, privacy, security | Security and Privacy owners |
| Country or language enablement | Country owner plus professional/native review |
| AI tool or autonomy | AI Governance, Security, Product, affected domain owner |
| Production launch | Product, Engineering, Security, Operations, and required professionals |

Roles are responsibilities, not claims that a staffed department currently exists.

## Record retention

ADR history, Mission Packs, test evidence, release approvals, professional sign-offs, migrations, reconciliation, incident records, and generated manifests are retained according to the approved retention policy. Financial and stock history is never "rolled back" by deleting posted records.

<div style="page-break-after: always"></div>

<!-- source: docs/06-master-programme-blueprint/00-governance/STATUS-AND-CLAIM-LEGEND.md -->

# Status and claim legend

Every capability, module, service, integration, country pack, mission, and launch gate has four independent statuses.

## Definition

`not-assessed` -> `captured` -> `draft` -> `proposed` -> `accepted` -> `superseded`

Definition describes the quality and authority of the specification. It does not describe code.

## Implementation

`not-assessed` -> `not-implemented` -> `partial` -> `implemented` -> `retired`

Implemented means the accepted scope exists in code/configuration and required migrations have completed. It does not imply verification or availability.

## Verification

`not-run` -> `blocked` or `failed` -> `passed` -> `externally-approved`

Passed must identify the exact tests, environment, version/commit, date, and reviewer. External approval is separate and applies only where required.

## Availability

`planned` -> `internal` -> `preview` -> `pilot` -> `GA`, with `disabled` and `retired` terminal or temporary states.

Availability is a Product/Release decision. Code in `main` is not automatically customer-facing.

## Required evidence

Each status record includes capability ID, owner, controlling source, target outcome, current-state evidence, dependencies, Mission Packs, test evidence, professional review, last-reviewed date, known gaps, and availability decision.

## Prohibited unsupported claims

Do not label VAKA or a capability "complete", "enterprise-grade", "Microsoft-level", "SAP-level", "certified", "compliant", "secure", "production-ready", or "live" without a defined benchmark and evidence. This blueprint may set those as target standards; only release evidence may assert achievement.

<div style="page-break-after: always"></div>

<!-- source: docs/06-master-programme-blueprint/00-governance/ARCHITECTURE-FREEZE-REGISTER.md -->

# Architecture Freeze Register

**Status:** Active  
**Authority:** `knowledge-system/18-decisions/ADR-002-architecture-freeze.md`

| Freeze domain | Frozen boundary | Change control |
|---|---|---|
| Product | VAKA OS, Platform, ERP, Intelligence, Network, Verify, Capital, Mail, Black Book, Studio | Leadership-approved successor ADR |
| Kernel | Identity, Metadata, Workflow, Rules, Policy, Event Bus, Documents, Search, AI Context, Notifications, Security, Engineering Process | Architecture ADR and migration/rollback |
| Knowledge | PRDs, Mission Packs, ADRs, Enterprise Data Dictionary, Business Ontology, Canonical Information Model, Development Process | Governance ADR |
| Delivery | ChatGPT -> Knowledge System -> Mission Packs -> Codex -> GitHub -> Testing -> Release | Engineering governance ADR |
| Tenancy | Server-derived tenant and permission scope for every tenant-owned path | Constitutional change plus security review |
| Finance | Immutable posted history, double entry, exact arithmetic, approved posting services, reversal-only correction | Finance authority and professional review |
| Inventory | Append-only stock movements, oversell refusal, atomic linked effects | Domain and architecture review |
| AI | Permission-scoped, read-only first, deterministic controls, confirmation and audit for consequence | AI Governance and domain approval |

## Freeze interpretation

Frozen means a durable architectural contract. It does not freeze defects, stop incremental improvement, force every target capability into one release, or select unproven implementation technology. It also does not convert planned products into current functionality.

## Exception process

An exception request must state the affected frozen item, customer outcome, evidence, alternatives, tenant/security/data/finance impact, compatibility and migration plan, operational cost, rollout, rollback, and decision owner. Time-limited exceptions include an expiry and remediation mission.

<div style="page-break-after: always"></div>

<!-- source: docs/06-master-programme-blueprint/00-governance/CONTRADICTION-NORMALISATION-LOG.md -->

# Contradiction and normalisation log

| ID | Source tension | Normalized rule |
|---|---|---|
| N-001 | `docs/` and the Knowledge System both claimed sole authority. | ADR-001: Knowledge System is control plane; `docs/` is specification/evidence plane. |
| N-002 | Book Two places Identity before Container, then tactical examples place Container first. | Existing P1-001 Kernel/Container and P1-002 Identity/Audit IDs remain authoritative. Future work follows dependencies. |
| N-003 | Illustrative mission IDs collide with committed mission IDs. | ADR-004 reserves committed IDs permanently; examples are superseded. |
| N-004 | Book Three programme numbers conflict with the current Master Build Plan. | Book 24 owns the canonical namespace; product families and missions use stable IDs plus dependencies. |
| N-005 | "Platform contains no business logic" conflicts with shared rules/tax/country engines. | Platform owns engines/contracts; domain and country owners own approved rule content. |
| N-006 | "All services communicate through events" conflicts with atomic finance/stock requirements. | Synchronous transactions enforce invariants; durable outbox events drive post-commit work. |
| N-007 | "Every operation is audited" risks noise and excess personal data. | A governed audit catalogue covers material and sensitive actions with minimised metadata and retention. |
| N-008 | "Every module exposes AI" conflicts with read-only-first, safe failure. | AI exposure is per approved use case; deterministic product workflows never depend on model availability. |
| N-009 | The chat's 95% unit coverage and mandatory scans were worded as current gates. | They are target gates until tooling and evidence exist; current CI limitations stay visible. |
| N-010 | Documentation was said to follow code, while Mission Packs must precede it. | Requirements/decisions precede code; API/user/ops/release/completion evidence ships with code. |
| N-011 | One-day maximum later became three days. | One day preferred; three days maximum unless an approved decomposition exception exists. |
| N-012 | Aspirational teams were described as an existing organisation. | Team names define accountable functions, not current headcount. |
| N-013 | Product names included Marketplace/Store and later Studio. | ADR-003: Marketplace belongs to Network; Store is a Platform commercial catalogue; Studio is the frozen builder product. |
| N-014 | "Complete without external consultants" conflicts with mandated professional review. | Customer operation may become self-service only after qualified approvals; professional assurance is never bypassed. |
| N-015 | Page count was presented as a proxy for enterprise quality. | Evidence, traceability, controls, tests, operational proof, and outcomes determine quality. |

<div style="page-break-after: always"></div>

<!-- source: docs/06-master-programme-blueprint/books/01-executive-programme-definition/README.md -->

# Book One - Executive Programme Definition

**Version:** 1.0  
**Definition:** Accepted baseline  
**Implementation:** Partial, measured by the capability register  
**Availability:** Existing ERP foundation only; future products remain planned unless separately released

## 1. Programme mandate

VAKA means "build" in Shona. VAKA OS is **The Operating System for African Business**, designed in Zimbabwe and built for responsible expansion across Africa.

The programme exists to help African businesses run, understand, govern, and improve their operations through one trusted system. It connects customers, money, stock, people, work, communications, evidence, and intelligence without turning them into disconnected applications or duplicate records.

## 2. Version 1 outcome

VAKA Version 1 is successful when a launch-market business can:

- establish an isolated organisation and invite users with least-privilege roles;
- manage customer, sales, purchasing, inventory, and financial workflows end to end;
- preserve exact, auditable, reversible financial and stock history;
- understand cash, receivables, payables, stock, sales, risks, and required actions;
- produce and retain trustworthy business documents and exports;
- work effectively on common mobile and desktop devices under variable connectivity;
- use approved English, Shona, and Ndebele experiences without changing business rules;
- receive permission-aware AI explanations and recommendations that never replace deterministic controls;
- onboard, migrate, learn, obtain support, and retain ownership of its data; and
- continue operating safely when an integration, provider, or model is unavailable.

Version 1 does not require every long-horizon VAKA product to be GA on the first Zimbabwe launch day. It requires a governed architecture and mission path for every frozen product family, plus release evidence for the explicitly declared launch scope.

## 3. Product portfolio

The frozen portfolio comprises VAKA OS, Platform, ERP, Intelligence, Network, Verify, Capital, Mail, Black Book, and Studio. Their canonical responsibilities are defined in ADR-003. All products share Platform identity, tenancy, permissions, audit, documents, search, notifications, metadata, events, policy, workflow, AI context, and operational controls.

No product may create a second authoritative Customer, Supplier, Product, Invoice, User, Organisation, or Ledger for convenience. Extensions attach to the Canonical Information Model.

## 4. Non-negotiable qualities

VAKA is multi-tenant, secure, scalable, AI-first, mobile-responsive, and localisation-ready. Trust, auditability, data protection, permissions, reliability, backup, recovery, export, and understandable failure are product capabilities.

The decision hierarchy is:

1. safety, law, data protection, and tenant isolation;
2. accounting, inventory, and audit integrity;
3. customer trust and reliable access to customer data;
4. measurable customer outcomes;
5. accessibility, mobile usability, and localisation;
6. maintainability and operational resilience;
7. delivery speed.

## 5. Programme success measures

Success is measured through outcomes and evidence, not feature count or page count:

- activation and time to first trustworthy transaction;
- workflow completion time and error/rework rate;
- financial/stock reconciliation exceptions;
- tenant/permission/security incidents;
- availability, latency, recovery, deployment, and change-failure measures;
- mobile/accessibility/localisation acceptance;
- AI groundedness, unsafe-action, permission-leakage, usefulness, latency, and cost;
- migration accuracy and customer data-export success;
- adoption, support burden, retention, and customer confidence;
- gate and documentation completeness.

Targets are defined per release and cannot be invented retrospectively.

## 6. Governance

Leadership owns the Constitution and Architecture Freeze. Product owns outcomes and availability. Architecture owns boundaries and technical decisions. Domain owners own business rules. Security, Privacy, Finance, Operations, AI Governance, Country, Localisation, and Customer Success owners approve their gates. Mission Packs are the execution envelope; they never override controlling sources.

## 7. Current-state declaration

As of 2026-07-11, the repository contains a working TypeScript/Express/PostgreSQL and React/Vite foundation with CRM, invoicing/accounting, inventory, billing, reporting, tenant scoping, RBAC, audits, append-only ledger patterns, USD/ZWG handling, white-label controls, mobile capture foundations, CI foundations, and early Platform Kernel contracts.

It does not yet prove the complete platform, every ERP module, every frozen product, complete multilingual delivery, full native/offline support, production AI, every country/industry pack, every integration, enterprise operations, certification, or GA readiness. Books 5 and 24 keep that gap visible and executable.

## 8. Executive acceptance

Book One is accepted when leadership confirms the mission, portfolio, Version 1 outcome, decision hierarchy, status model, and professional-review boundaries. It does not sign off implementation.

<div style="page-break-after: always"></div>

<!-- source: docs/06-master-programme-blueprint/books/02-platform-foundation/README.md -->

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

No service may silently use global tenant state, import another domain's tables, expose raw provider behavior, or make financial/stock decisions outside approved domain services.

## 4. Quality gates

Target gates include zero TypeScript/static-analysis errors; passing unit, integration, contract, security, performance, resilience, accessibility and applicable localisation tests; high-risk review; current documentation; Mission Pack; Completion Report; and staged rollout/rollback evidence. The proposed 95% unit-coverage target is applied by risk and package and is not a substitute for integration or invariant tests.

## 5. Programme completion

Platform Foundation is complete only when every launch-scope Platform service is operational and consumed through its contract; duplicated infrastructure is removed after evidence; APIs/events are documented; observability, backup, recovery and security gates pass; and new modules can be added without bypassing Kernel controls.

The existence of a namespace or in-memory reference adapter is "foundation," not production completion.

## 6. Mission discipline

Platform work is decomposed into reviewable missions. One mission normally produces one PR, review, merge, Completion Report, and traceability update. Existing IDs are permanent. Book 24 is the authoritative catalogue.

<div style="page-break-after: always"></div>

<!-- source: docs/06-master-programme-blueprint/books/03-enterprise-construction-master-plan/README.md -->

# Book Three - Enterprise Construction Master Plan

**Version:** 1.0 normalized edition  
**Definition:** Accepted programme model  
**Implementation:** Tracked per mission and release

## 1. Purpose

This book defines the complete construction map from the current codebase to a production VAKA OS portfolio. Programmes are capability groupings with dependency gates, not promises of calendar duration. Each programme decomposes into epics, features, missions, tasks, changes, verification, releases, and measurable outcomes.

## 2. Programme map

| Programme | Outcome | Major scope | Programme exit |
|---|---|---|---|
| P0 Engineering Foundation | Reproducible, governable delivery | repositories, Knowledge System, standards, Mission Packs, CI/CD, reviews, security, release, DoR/DoD | teams/agents deliver small changes consistently with evidence |
| P1 Platform Foundation | Shared enterprise services | frozen Kernel capabilities, developer boundary, observability | modules consume Platform contracts without duplicated infrastructure |
| P2 Enterprise Finance | Trustworthy accounting and financial operations | GL, AR, AP, banking/cash, budgets, assets, tax/VAT, multi-currency, reporting, treasury, consolidation, AI boundaries, migrations | approved launch scope independently satisfies finance acceptance and professional review |
| P3 Customer Operations | Complete customer lifecycle | CRM, leads, opportunities, quotes, orders, invoices, marketing, activities, portals, analytics, AI sales | one canonical customer lifecycle is auditable end to end |
| P4 Procurement and Supply Chain | Controlled source-to-pay | suppliers, requisitions, RFQ, PO, receiving, contracts, performance, approvals, portal | controlled purchasing integrates inventory and AP atomically |
| P5 Inventory and Warehousing | Accurate stock and fulfilment | warehouses/locations/bins, append-only movements, batches/serials, counts, transfers, consumption, valuation, AI inventory | stock is traceable, reconciled, oversell-safe, and finance-integrated |
| P6 Human Capital | Governed workforce operations | people, recruitment, leave, attendance, payroll, performance, learning, organisation, self-service | approved HR scope is secure, private, localised, and professionally reviewed where needed |
| P7 Projects and Operations | Plan-to-deliver control | projects, tasks, resources, time, budgets/costs, manufacturing, construction, maintenance | operational work connects commitments, stock, people, and finance |
| P8 Communications | Object-linked business communication | VAKA Mail, shared mailboxes, calendar, tasks, messaging, meetings, templates, campaigns, customer communication | approved users can communicate with consent, retention, audit, and provider resilience |
| P9 Business Network | Safe business ecosystem | Network, directory, marketplace/discovery, events, referrals, communities, Black Book, Verify touchpoints | governed discovery/collaboration works without cross-tenant leakage or unsafe trust claims |
| P10 Enterprise Intelligence | Permission-aware business intelligence | health, digital twin, forecasting, risk, recommendations, knowledge, analytics, AI workflows and domain assistants | each use case meets evidence, authority, safety, cost and outcome gates |
| P11 Platform Expansion | Additive markets and ecosystems | country/industry packs, Studio, public APIs, SDK/plugins, partners, government/payment/bank integrations, mobile/desktop/offline | a new approved market/extension is added without core fork or trust regression |

Book 24 provides stable mission namespaces where legacy P6-P10 mission IDs already exist; this programme map does not renumber committed work.

## 3. Dependencies and parallelism

Engineering Foundation and the relevant Platform controls precede production domain use. Finance invariants precede any module that posts accounting. Procurement precedes controlled receiving and three-way match; inventory foundations precede manufacturing consumption; identity/policy/events precede communications and network interactions; metadata/policy/evaluation precede AI actions.

Independent safe foundations may progress in parallel. A release may not skip its own gates because another programme has advanced.

## 4. Milestones

Every programme passes four evidence-bearing milestones:

- **A - Foundation:** outcome, authority, canonical model, architecture, interfaces, Mission Packs, tests and migration/rollback design.
- **B - Implementation:** domain rules, services, UI, APIs/events, permissions, audit, localisation and operational instrumentation.
- **C - Validation:** unit/integration/invariant/tenant/security/performance/accessibility/localisation/AI/compliance tests and professional review.
- **D - Production:** staged deployment, monitoring, backup/recovery, support, training, release evidence, customer readiness and observed outcomes.

## 5. Programme definition of complete

A programme is complete only for a named release scope. Its accepted capabilities are implemented, verified, approved, deployed, supported, documented, recoverable, and producing their intended customer outcomes. Unreleased sub-capabilities remain visible and do not block a deliberately narrower release unless they are declared launch-critical.

The overall VAKA portfolio remains an evolving product; "programme complete" never means change or assurance stops.

## 6. Global completion conditions

The initial comprehensive build reaches portfolio baseline when every frozen product has accepted architecture and executable missions; the declared Zimbabwe release passes all gates; Platform and ERP launch scope is operational; AI state is honest; migration/support/training/operations exist; and later products have approved boundaries without being marketed as live.

Security, performance, scalability, legal, tax, accounting, privacy and localisation certifications or approvals are recorded only when actually obtained.

<div style="page-break-after: always"></div>

<!-- source: docs/06-master-programme-blueprint/books/04-engineering-execution-framework/README.md -->

# Book Four - Enterprise Engineering Execution Framework

**Version:** 1.0 normalized edition  
**Definition:** Accepted engineering policy

## 1. Engineering principles

1. Deliver continuously in small, reversible increments.
2. Preserve verified behavior unless acceptance criteria explicitly change it.
3. Test before trust; evidence is part of the deliverable.
4. Define outcomes, architecture, security and rollback before implementation.
5. Update API, user, operations, release and completion documentation with code.
6. Apply tenant isolation, least privilege, validation, audit, privacy and safe failure by default.
7. Consume Platform contracts before introducing duplicate infrastructure.
8. Hold AI-generated code to the same review and verification standard as human code.
9. Keep the main branch deployable and availability separate from deployment.
10. Learn from production without using customers as uncontrolled testers.

## 2. Accountable functions

Platform; Finance; Business Operations; Communications; Intelligence; Experience; Infrastructure/Operations; Security/Privacy; Quality; Country/Localisation; Product; Customer Success; and Architecture functions own their corresponding gates. These are RACI responsibilities and may be held by a small number of people during early stages.

No author self-approves high-risk finance, payroll, security, privacy, migration, AI-action, or country-compliance work.

## 3. Lifecycle

`Outcome accepted -> authority identified -> PRD/ADR -> Mission Pack -> branch/change -> unit and contract tests -> integration/invariant/negative tests -> code and security/domain review -> documentation -> merge -> release candidate -> staged deployment -> post-release verification -> outcome review`

Emergency work may compress sequencing but not evidence, incident review, reconciliation, or follow-up remediation.

## 4. Work hierarchy

`Portfolio -> Programme -> Capability -> Epic -> Feature -> Mission -> Task -> Change/PR -> Merge -> Release -> Outcome`

Identifiers are permanent. Traceability links both directions: requirements find tests/releases, and code changes find authority/outcome.

## 5. Mission Pack contract

Every Mission Pack contains:

- Mission ID, permanent title, status, owner, programme/capability and dependencies;
- business user/problem, measurable outcome, technical objective and background;
- current repository behavior and evidence;
- in-scope and out-of-scope behavior;
- allowed and forbidden files or domains;
- canonical objects/data/events and architecture decisions;
- tenant, identity, permission, audit, privacy and retention requirements;
- finance/inventory/country/localisation/mobile/accessibility/AI impact;
- implementation steps without speculative expansion;
- unit, integration, contract, failure, security, performance and applicable specialist tests;
- migration, compatibility, rollout, feature flag, observability and rollback;
- acceptance criteria, Definition of Done and Completion Report template.

A Mission Pack is the execution envelope, not the only controlling input. It links the Constitution, ADRs, domain architecture, PRD, standards and user instruction.

## 6. Branch and review governance

Repository branches use the configured `codex/` prefix for Codex-created branches, followed by a mission or change purpose. Existing historical conventions remain valid. One mission normally maps to one PR, one review decision and one merge. A mission expected to exceed three engineering days is decomposed unless an exception is approved.

Reviews cover outcome, architecture, security/privacy, tenant isolation, permissions/audit, data integrity, performance, maintainability, tests, documentation, migration/rollback, operational readiness and claim accuracy.

## 7. Quality gates

The mandatory gate model is defined in `docs/04-execution/QUALITY-GATES.md`: readiness; repository health; functional correctness; tenant/permission/audit; data and migrations; UX/accessibility/localisation; security/privacy; AI; operational readiness; and pilot/production go/no-go.

Target tooling includes TypeScript, lint/format, unit/integration/contract/E2E tests, coverage, dependency/secret/SAST scanning, migration validation, SBOM, documentation links, and artifact retention. A target is not marked passed until the repository actually enforces it.

## 8. Release strategy

Capabilities move through internal, Preview, Pilot and GA using feature/tenant/country/language/autonomy controls. Rollback includes application, configuration, migration/data, queue/event, cache, provider, customer communication and reconciliation procedures. Posted history uses domain reversal/compensation, never deletion.

## 9. Metrics

Engineering tracks deployment frequency, lead time, change-failure rate, recovery time, escaped defects, coverage by risk, flaky tests, security findings, performance/SLO regression, migration/reconciliation exceptions, documentation/traceability completeness, support incidents and customer outcome measures.

Metrics are used to improve the system, not encourage unsafe volume.

## 10. Completion

This framework succeeds when a new contributor or AI agent can select an approved mission, locate every controlling source, make a bounded change, reproduce verification, obtain required review, release safely, and leave evidence without inventing architecture.

<div style="page-break-after: always"></div>

<!-- source: docs/06-master-programme-blueprint/books/05-complete-capability-catalogue/README.md -->

# Book Five - Complete Capability Catalogue

**Version:** 1.0  
**Definition:** Accepted portfolio catalogue  
**Status date:** 2026-07-11

This book is the master checklist requested for every platform capability, ERP module, platform service, AI capability, country/industry pack, integration, migration utility, engineering/testing/deployment/commercial milestone, launch gate, and acceptance criterion. "Accepted" means catalogued target scope; implementation and availability remain independent.

## 1. Status summary

The current repository has verified foundations in tenant identity/RBAC, audit, CRM, invoicing/accounting, inventory, billing, reporting, imports, mobile capture, security controls, Platform Kernel contracts, Zimbabwe currency configuration, and AI read-model/evaluation scaffolding. Many catalogue entries are partial or planned. Book 24 decomposes them into missions.

## 2. Platform capabilities

| ID | Capability | Target boundary | Baseline posture |
|---|---|---|---|
| PLT-001 | Tenant and organisation | lifecycle, isolation, ownership, legal entities, settings | Tenant foundation implemented; legal-entity model planned |
| PLT-002 | Identity and access | auth, RBAC, permissions, sessions/devices, MFA, SSO/OAuth, API keys, step-up, SoD | JWT/RBAC/session foundation; advanced identity planned |
| PLT-003 | Container/config/secrets | DI, validated config, lifecycle, providers, secret rotation | Kernel container/config foundation; production secret operations partial |
| PLT-004 | Audit | catalogue, immutable tenant/platform evidence, search/export/retention | audit stores and adapters exist; universal catalogue/admin search partial |
| PLT-005 | Events | outbox, versioned events, subscribers, replay, retries, DLQ | in-memory contract reference only; durable production path planned |
| PLT-006 | Notifications | in-product/email/SMS/push/WhatsApp, templates, consent, history, analytics | selected email/arrears foundations; unified provider platform planned |
| PLT-007 | Documents | secure storage, versions, metadata, scanning, OCR drafts, preview, signature, retention, restore | invoice/capture foundations; full document platform planned |
| PLT-008 | Search | tenant/permission-filtered global/object/document/AI search and indexing | contract foundation; production index/UI planned |
| PLT-009 | Metadata | objects, fields, relationships, validation, UI/workflow/AI/reporting metadata | contract foundation; canonical registry planned |
| PLT-010 | Workflow | definitions, approvals, escalation, delegation, history, analytics | reference contract/runner; durable configurable engine planned |
| PLT-011 | Rules | typed expressions and versioned domain/country/approval rule packages | country config foundation; general engine planned |
| PLT-012 | Policy | security, retention, approval, compliance and AI authority decisions | policies distributed in code/docs; unified evaluator planned |
| PLT-013 | Reporting | read models, KPIs, dashboards, schedules, exports/charts | finance/operational reporting foundation; shared engine partial |
| PLT-014 | AI Context | permission-aware retrieval, prompts, tools, memory, conversations, governance | summary/evaluation foundation; live model/tool layer absent |
| PLT-015 | Developer/Studio | versioned APIs/events/webhooks, SDK, CLI, plugins, sandbox, portal | internal REST API; public platform planned |
| PLT-016 | Observability | logs, correlation, metrics, traces, SLOs, alerts, diagnostics | health and logging foundations; end-to-end operations planned |
| PLT-017 | Localisation | locale catalogues, formatting, terminology, fallback, native review | English catalogue partial; Shona/Ndebele delivery incomplete |
| PLT-018 | Entitlements | plan/module/country/industry/provider/autonomy entitlements | plan/billing foundation; governed entitlement resolver planned |
| PLT-019 | Jobs and schedules | tenant-safe queues, schedules, idempotency, retries, ownership | individual jobs exist; shared durable scheduler planned |
| PLT-020 | Administration | platform/tenant administration, support access, health, audit, release/config controls | basic platform admin exists; control centre expansion planned |

## 3. ERP modules

| ID | Module family | Complete target scope | Baseline posture |
|---|---|---|---|
| ERP-FIN | Finance | GL, AR, AP, cash/banking, expenses, tax/VAT, FX, budgets, assets, treasury, consolidation, close, reports | strong foundation; several enterprise areas planned |
| ERP-CRM | CRM and sales | parties, contacts, leads, activities, opportunities, quotes, orders, pricing, invoices, portal, analytics | contact/deal/invoice foundation; lifecycle completion planned |
| ERP-PROC | Procurement | suppliers, requests, RFQ, PO, receiving, bills, three-way match, contracts, performance, portal | purchase-order foundation; source-to-pay partial |
| ERP-INV | Inventory/warehouse | products, warehouses, locations/bins, append-only movements, batches/serials, counts, transfers, valuation, fulfilment | product/warehouse/stock foundation; advanced WMS planned |
| ERP-HCM | Human capital | workforce, organisation, recruitment, leave, time, payroll, performance, learning, self-service | planned |
| ERP-PROJ | Projects | projects, tasks, resources, time, budgets, costs, billing, portfolio | planned |
| ERP-MFG | Manufacturing | BOM, routing, planning, work orders, consumption/output, quality, costing | planned |
| ERP-MNT | Maintenance/assets | equipment, preventive/reactive work, spares, downtime, cost | planned |
| ERP-POS | Point of sale | outlets, shifts, tills, receipts, payments, returns, stock/finance integration | limited sales foundations; dedicated POS planned |
| ERP-REP | Enterprise reporting | statements, operational reports, consolidated dashboards, schedules, evidence exports | partial |

Each financial or stock-producing module must declare its accounting event, balanced journal, legal entity, currency, tax, audit, reversal, explanation, AI boundary, and permission.

## 4. Frozen product capabilities

| ID | Product | Capability families | Baseline posture |
|---|---|---|---|
| PRD-MAIL | VAKA Mail | mailboxes, calendar, tasks, messaging, meetings, templates, campaigns, object timelines, AI Mail | default-off IMAP/SMTP Mail Core implemented; OAuth, UI and GA controls planned |
| PRD-NET | VAKA Network | directory, marketplace, discovery, communities, groups, events, referrals, testimonials, tenders, matching | referral foundation; broader Network planned |
| PRD-BB | VAKA Black Book | curated regulator/public-service knowledge, deadlines, forms, tenders, guided navigation | planned |
| PRD-VER | VAKA Verify | business/supplier/director/document checks, evidence, expiry, consent, trust presentation | planned |
| PRD-CAP | VAKA Capital | governed lender/insurer discovery, readiness, consented applications/referrals, status | planned and legally gated |
| PRD-INT | VAKA Intelligence | summaries, health, forecasting, risk, recommendations, natural-language discovery, domain copilots, governed automation | read-model/evaluation foundation only |
| PRD-STU | VAKA Studio | APIs, webhooks, SDK/CLI, extensions, workflow/form/template builders, sandbox, marketplace governance | planned |

## 5. AI capability catalogue

`AI-001` permission-scoped context; `AI-002` evidence/citation model; `AI-003` prompt registry; `AI-004` tool registry and schemas; `AI-005` memory and retention; `AI-006` conversation history; `AI-007` business summary; `AI-008` business health; `AI-009` anomaly/risk; `AI-010` forecasting/scenarios; `AI-011` recommendations; `AI-012` natural-language search/reporting; `AI-013` Finance assistant; `AI-014` CRM/sales assistant; `AI-015` procurement assistant; `AI-016` inventory assistant; `AI-017` project/operations assistant; `AI-018` HR assistant; `AI-019` Mail assistant; `AI-020` compliance navigator; `AI-021` workflow drafting; `AI-022` approved-action preview/confirmation; `AI-023` bounded automation; `AI-024` multilingual behavior; `AI-025` evaluation/red-team; `AI-026` monitoring/cost/kill switch; `AI-027` model/provider routing and fallback.

Only AI-007 and evaluation foundations have repository evidence; no live provider or consequential AI action is claimed.

## 6. Packs

- **Country:** shared contract plus Zimbabwe; expansion candidates South Africa, Zambia, Botswana, Namibia, Malawi, Mozambique, Kenya, Tanzania, Nigeria, and Ghana. Each is research/approval work, never a copied tax file.
- **Industry:** retail/wholesale, professional services, construction, manufacturing, agriculture, hospitality, logistics, healthcare, education, nonprofit, and other validated sectors. Each pack contains terminology, processes, roles, metadata, templates, rules, reports, integrations, migration maps, training and acceptance evidence.

Only the Zimbabwe configuration foundation exists. No additional country or industry pack is GA.

## 7. Integration families

Identity providers; email; SMS; WhatsApp; push; payments; mobile money; banks/statement feeds; fiscalisation and government; storage; malware/OCR/signature; tax/statutory; payroll; commerce/POS; calendars/meetings; analytics/observability; AI providers; public webhooks/APIs; partner apps; data warehouses; and support/status systems. Every provider uses a versioned adapter, consent/credential policy, idempotency, timeout/retry, observability, reconciliation, exit plan, and tenant-safe tests.

## 8. Migration utilities

Discovery/assessment; tenant configuration; chart of accounts; customers/suppliers; opening balances; AR/AP documents; products/SKUs; opening stock; bank statements; CRM activity; documents; users/roles; historical journals where legally and technically acceptable; mappings/transforms; dry run; validation; exception queue; reconciliation; cutover; rollback; evidence; and adapters for approved source systems. Current CSV contact/product/opening-stock and bank-statement foundations cover only part of this target.

## 9. Engineering, testing, deployment and commercial milestones

- **Engineering:** authority -> ontology/model -> architecture -> interfaces -> missions -> implementation -> review -> merge -> release evidence.
- **Testing:** baseline -> unit/contract -> integration/invariant -> tenant/permission/audit -> migration/concurrency -> security/privacy -> performance/resilience -> accessibility/mobile/localisation -> AI -> UAT -> production verification.
- **Deployment:** local -> CI -> staging -> internal -> pilot -> production rings -> observation -> GA -> continuous assurance.
- **Commercial:** product/entitlement truth -> pricing approval -> contracts/privacy -> billing/dunning -> sales/partners -> onboarding/migration -> support/success -> launch claims -> renewal and expansion.

## 10. Universal acceptance criteria

A capability is GA only when its outcome is measured; canonical data and ownership are clear; tenant/permission/audit and data protection pass; domain invariants and failure/rollback pass; APIs/events are versioned; mobile/accessibility/localisation requirements pass; observability/support/backup/recovery exist; AI boundaries pass where applicable; required professional review is recorded; migration and customer documentation exist; and availability is explicitly approved.

<div style="page-break-after: always"></div>

<!-- source: docs/06-master-programme-blueprint/books/06-enterprise-data-model/README.md -->

# Book Six - Enterprise Data Model

**Version:** 1.0  
**Definition:** Accepted canonical-model baseline  
**Implementation:** Existing schema plus planned canonical extensions

## 1. Data doctrine

PostgreSQL is the transactional system of record. Data models preserve tenant and future legal-entity ownership, exact arithmetic, immutable posted history, referential integrity, explicit lifecycle, auditability, retention, portability, and additive market/industry extension.

The Canonical Information Model is logical. Physical tables may evolve through compatible migrations, but modules and integrations exchange canonical contracts rather than raw rows.

## 2. Ownership hierarchy

`VAKA Platform -> Tenant/Organisation -> Legal Entity -> Operating Unit/Branch -> Domain Record`

Tenant is mandatory for every customer-owned record. Legal entity becomes mandatory for postings and statutory records when the multi-entity capability is introduced. Warehouse, project, department, cost centre, branch and channel are dimensions, not substitutes for tenant or legal entity.

Platform-owned reference data is explicitly marked and never mixed with tenant records through nullable scope ambiguity.

## 3. Canonical objects

### Foundation

Tenant, Organisation, LegalEntity, OperatingUnit, User, Identity, Session, Device, Role, Permission, Grant, APIClient, AuditEvent, PolicyDecision, Configuration, FeatureEntitlement, NumberSequence, Locale, CountryPack, IndustryPack.

### Parties and relationships

Party, Person, OrganisationParty, ContactPoint, Address, CustomerAccount, SupplierAccount, EmployeeProfile, PartnerRelationship, Consent, VerificationCase, ReferralAttribution.

One Party may have several business roles; Customer and Supplier views do not duplicate the party's identity.

### Commercial and CRM

Lead, Opportunity, Activity, Campaign, Quote, SalesOrder, Invoice, InvoiceLine, CreditNote, DebitNote, Payment, Allocation, PriceBook, Contract, Subscription, Entitlement.

### Finance

ChartOfAccounts, Account, AccountingEvent, Journal, JournalLine, FiscalPeriod, ExchangeRateSnapshot, TaxCode, TaxRate, TaxDetermination, BankAccount, BankTransaction, Reconciliation, Expense, Budget, Asset, DepreciationRun, TreasuryPosition, ConsolidationEntry.

Posted journals and lines are append-only and balanced. Operational documents do not write ledger tables directly; approved posting services translate accounting events into journals.

### Supply, inventory and operations

Product, SKU, UnitOfMeasure, Warehouse, Location, Bin, StockBalanceReadModel, StockMovement, Lot, Serial, StockCount, Transfer, PurchaseRequest, RequestForQuote, PurchaseOrder, GoodsReceipt, SupplierBill, MatchResult, Project, Task, Timesheet, Resource, WorkOrder, BillOfMaterial, Routing, Equipment, MaintenanceOrder.

`StockMovement` is append-only. Balances are derived/reconciled read models.

### Communications, documents and intelligence

Mailbox, Message, Conversation, CalendarEvent, Notification, DeliveryAttempt, Template, Document, DocumentVersion, SignatureRequest, SearchDocument, MetadataDefinition, WorkflowDefinition, WorkflowInstance, RuleDefinition, EventEnvelope, AIConversation, AIContextRecord, AIRecommendation, AIActionPreview, AIApproval, AIEvaluationRun.

## 4. Current physical baseline

The current schema defines tenant/user/session/platform-audit/import/capture/role/audit/referral/numbering, CRM, finance, banking, inventory, purchase-order, plan/subscription/invoice, and dunning tables. It includes 10 enumerations and 38 tables. This is implementation evidence, not the complete target model.

Important current mappings include:

- `tenants`, `users`, `user_sessions`, `roles`, `audit_logs`, `platform_audit_logs`;
- `contacts`, `deals`, `activities`;
- `accounts`, `exchange_rates`, `invoices`, `invoice_line_items`, `invoice_document_snapshots`, `invoice_share_links`, `payments`, `journal_entries`, `journal_lines`, `expenses`;
- `bank_accounts`, `bank_transactions`, `bank_reconciliations`;
- `products`, `warehouses`, `stock_levels`, `stock_movements`, `purchase_orders`, `purchase_order_line_items`;
- `plans`, `subscriptions`, `subscription_invoices`, `dunning_events`;
- `import_batches`, `import_rows`, `capture_documents`, and referral records.

Schema names are not automatically canonical API names. Migration to Party, LegalEntity, AccountingEvent, Document, Notification and other target concepts requires dedicated missions and compatibility plans.

## 5. Data dictionary standard

Every canonical object and physical field records: stable name/ID; business definition; owner; tenant/legal-entity scope; source of truth; type/format/unit/currency; null/default rules; classification; validation; lifecycle; mutability; relationships; indexes/constraints; permissions; audit events; retention/deletion; localisation; API/event mapping; migration lineage; example; and last review.

Money crosses boundaries as integer minor units or exact decimal strings plus currency. Dates/times use ISO 8601 and explicit timezone semantics. Stable codes are separate from translated labels.

## 6. Events and lineage

Every durable event includes event ID, type/version, tenant, optional legal entity, actor, entity reference/version, occurred and recorded time, correlation/causation/idempotency keys, classification, and minimal payload. Sensitive or large content remains behind authorized references.

Reports, AI answers, migrations, and integrations record source lineage sufficient to explain material results.

## 7. Retention, deletion and export

Retention is policy- and jurisdiction-driven. Customer deletion requests cannot destroy records that must be preserved for financial, legal, security, dispute, or audit reasons; access may be restricted or identifiers lawfully minimized. Suspend-then-escrow preserves client data. Tenant exports are complete, scoped, understandable, and auditable.

## 8. Migration controls

Schema changes use expand/migrate/contract, versioned migrations, representative tests, backup impact, restartable tenant-safe backfills, reconciliation, and rollback/forward-fix plans. Posted financial and stock records are never "migrated" by destructive rewrite without approved, reconciled, auditable transformation.

## 9. Acceptance

The model passes when every launch capability maps to canonical objects; ownership and lifecycle are unambiguous; tenant and legal-entity tests pass; finance/stock invariants are enforced; dictionaries and events are versioned; migration and retention are operational; and no module creates unauthorized duplicate masters.

<div style="page-break-after: always"></div>

<!-- source: docs/06-master-programme-blueprint/books/07-platform-services/README.md -->

# Book Seven - Platform Services

**Version:** 1.0  
**Definition:** Accepted service-contract catalogue  
**Implementation:** P1 Kernel foundation plus incremental adapters

## 1. Service contract

Every service exposes a narrow typed interface, explicit tenant/actor scope, permissions, version, configuration, dependencies, health, metrics, events, errors, consumers, data classification, retention, SLO, tests, documentation, migration, rollback and owner. Provider adapters are registered at the composition root.

Platform services may orchestrate reusable infrastructure but may not bypass domain services or write operational modules' authoritative tables.

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

<div style="page-break-after: always"></div>

<!-- source: docs/06-master-programme-blueprint/books/08-finance-and-accounting/README.md -->

# Book Eight - VAKA Finance & Accounting Intelligence Architecture

**Version:** 1.0  
**Status:** Authoritative architecture baseline  
**Owner:** Finance Architecture  
**Professional review:** Required for market release

This is the authoritative source of truth for VAKA accounting, ledger, tax, currency, financial reporting, finance AI, migration and compliance architecture. Existing `docs/finance/` audits and evidence remain authoritative for current-state findings and are interpreted through this architecture.

## 1. Authority and invariants

1. No posted financial transaction is edited in place.
2. Corrections use reversal, credit/debit note, correcting journal or controlled adjustment.
3. Every posted journal balances exactly.
4. Operational modules never write ledger tables directly.
5. Approved posting services are the only ledger write boundary.
6. AI never posts directly or becomes the source of a deterministic calculation.
7. Tax rates and currency availability are effective-dated configuration, not invoice-code constants.
8. Material financial actions create audit evidence.
9. Tenant and future legal-entity ownership is mandatory.
10. Money uses exact arithmetic; exchange rates, costs, tax and other historical inputs are snapshotted.
11. Document numbers are sequential, immutable and explainable.
12. Linked operational, financial, stock, numbering and audit effects are atomic.

## 2. Accounting event model

Every operational financial event declares:

- event type/version and source document;
- tenant, legal entity, branch and fiscal period;
- transaction, functional and presentation currencies;
- exchange-rate source/time/value and rounding;
- tax treatment, jurisdiction, code/rate/evidence;
- balanced journal template and account determination;
- posting permission, approval, idempotency and concurrency;
- audit event and explanation;
- reversal/compensation method;
- AI visibility/authority; and
- reconciliation and reporting effects.

Posting validates the source lifecycle and locks/uniqueness constraints inside one database transaction.

## 3. General Ledger

The ledger contains charts of accounts, fiscal calendars/periods, journals/lines, dimensions, recurring and allocation journals, approved adjustments, opening/closing processes and immutable posting evidence. Draft journals may be edited; posted journals are immutable. Period locks prevent ordinary posting; controlled adjustments use authorized special periods or approved reopening with audit.

## 4. Accounts receivable and revenue

Customer master, quote/order, invoice, credit/debit notes, receipts, allocations, unapplied cash, statements, ageing, dunning and bad-debt workflows preserve original currency and document snapshots. Revenue recognition beyond straightforward invoicing requires a dedicated approved design.

Invoice issue allocates an immutable number, freezes document inputs, posts the journal where configured, emits durable post-commit events and can be corrected only through controlled documents/reversal.

## 5. Accounts payable and procurement

Supplier master, requisition/RFQ/PO, receipt, bill, three-way match, approvals, payment proposal, payment and supplier statement reconciliation connect source-to-pay. Receiving may affect inventory; supplier bill acceptance affects AP/tax; payment affects cash/AP. Each effect has an explicit event and atomic boundary.

## 6. Banking, cash and treasury

Bank accounts, statement imports, normalized transactions, matching, reconciliation, cash positioning, transfers and payment integrations are provider-neutral. Browser scraping and stored internet-banking credentials are prohibited. Read-only ingestion and deterministic reconciliation precede outbound payment capability. Payment initiation requires step-up/approval, idempotency, signed provider evidence and reconciliation.

## 7. Tax and country rules

Tax determination is effective-dated by jurisdiction, registration, party, product/service, date and treatment. Standard, zero-rated, exempt, out-of-scope, withholding, reverse-charge and other market-specific outcomes are added by approved country packs. Tax reports reconcile to ledger and source documents. VAKA configuration and templates are not tax advice.

Zimbabwe VAT, PAYE, NSSA, fiscalisation and statutory reporting require qualified local review and approved test fixtures before availability.

## 8. Currency

Transactions preserve original currency, functional currency, exchange-rate snapshot, source, timestamp, precision and rounding. Realized and unrealized gains/losses are explicit accounting events. Reports state currency and translation method. No core rule assumes only USD or ZWG.

## 9. Inventory costing and assets

Approved inventory valuation (currently weighted-average foundations) derives COGS and inventory journals from append-only stock movements and snapshotted costs. Negative stock/oversell is refused where required. Fixed assets cover capitalization, classes, depreciation, impairment, disposal and reconciliation through controlled events.

## 10. Budgets, reporting, close and consolidation

Budgets/forecasts are versioned planning data and never posted history. Trial balance, P&L, balance sheet, cash flow, ledgers, AR/AP ageing, tax and management reports reconcile to source balances with as-at/currency/dimension disclosure. Close includes task ownership, reconciliations, exceptions, period lock and sign-off. Multi-entity consolidation adds elimination, translation and ownership rules only after legal-entity isolation exists.

## 11. Finance Intelligence

AI may explain reconciled data, identify anomalies, forecast, summarize overdue exposure and draft actions. Output separates fact, deterministic calculation, inference and recommendation; identifies evidence/as-at/currency; states uncertainty; respects permissions; and records material assistance. Any proposed write is an exact preview executed only by the authorized deterministic service after confirmation. Autonomous posting is prohibited.

## 12. Migration and opening balances

Migration uses assessed source mappings, dry runs, exception resolution, balanced opening journals, open-item linkage, stock reconciliation, document retention, cutover controls and customer/professional sign-off. Historical fidelity and legal retention are explicit. Migration never fabricates balancing entries without approved, explained suspense/equity treatment.

## 13. Finance readiness questions

No finance feature is accepted without answering: accounting event; balanced journal; legal entity; currency; tax; audit; reversal; explanation; AI boundary; and required permission.

## 14. Release gates

Finance GA requires invariant/tenant/permission/audit/idempotency/concurrency/rollback/reversal/reconciliation tests, migration evidence, report tie-outs, backups/restores, operational runbooks, security review, and qualified accounting/tax approval for the release market. Current repository tests and remediation evidence are foundations, not blanket approval.

<div style="page-break-after: always"></div>

<!-- source: docs/06-master-programme-blueprint/books/09-business-operations/README.md -->

# Book Nine - Business Operations

**Version:** 1.0  
**Definition:** Accepted target  
**Implementation:** CRM, invoicing, purchasing and inventory foundations; remaining modules partial or planned

## 1. Cross-module doctrine

Business Operations is one connected lifecycle, not a collection of screens. Parties, products, documents, commitments, stock and money use canonical objects. Server-side domain services enforce lifecycle, permissions, approvals, audit, country rules and atomicity. Every workflow defines mobile behavior, localisation, interruption/retry, data protection and measurable outcome.

## 2. CRM and sales

Scope: Party/customer records; contacts/addresses/consents; leads; opportunities/stages; activities/tasks/meetings; campaigns; quotes; price books; sales orders; fulfilment; invoices; receipts; portal; timelines; analytics; and approved AI assistance.

Core flow: `lead -> qualified party/opportunity -> quote -> approved sales order -> fulfilment -> invoice -> payment/allocation -> follow-up/retention`.

Acceptance requires one canonical Customer; tenant-safe import/deduplication; stage and owner history; permissioned pricing/discounts; idempotent conversion; immutable issued documents; stock/finance atomicity; communication consent; mobile activity capture; and explainable pipeline/receivable reporting.

## 3. Procurement and suppliers

Scope: supplier role; onboarding/verification; catalogues; requisitions; approvals; RFQ/bids; purchase orders; amendments; goods/service receipt; inspection; supplier bills; three-way match; returns; contracts; supplier performance; spend analytics; portal; and approved AI assistance.

Core flow: `need -> requisition -> approval -> sourcing/RFQ -> PO -> receipt -> bill/match -> approval -> payment -> performance`.

No receipt or bill may silently overstate stock, AP or tax. Tolerances are versioned rules. Supplier verification and sanctions/regulatory checks are legally governed per country.

## 4. Inventory and warehousing

Scope: products/SKUs/categories/units; warehouses/locations/bins; append-only receipt/issue/transfer/adjustment/opening movements; balances; reservations; lots/batches/serials/expiry; counts; replenishment; picking/packing; fulfilment; returns; valuation; barcode/QR/mobile capture; and intelligence.

Stock movement is the authoritative history. Balance is a reconciled read model. The system refuses overselling under the approved policy and rolls back the linked sale/journal/audit when any invariant fails. Adjustments require reason, permission and audit; historical movement is never edited.

## 5. Human capital and payroll

Scope: worker/employee identity; organisation/position; recruitment/onboarding/offboarding; contracts; leave; attendance/time; payroll; benefits; performance; learning; documents; employee/manager self-service; privacy; and approved AI HR.

Employee data receives heightened access, retention and audit controls. Payroll is an effective-dated calculation and accounting workflow with approvals, payslip/document security, reversals/corrections and statutory review. No payroll feature is marketed before qualified Zimbabwe review and representative fixtures.

## 6. Projects and services

Scope: projects/programmes; phases/tasks/dependencies; resources; time/expense; budgets/forecast; procurement/stock; risks/issues/changes; billing/revenue; margin; documents; customer collaboration; portfolio views; and AI project assistance.

Time, expense, commitments, actuals and billing remain traceable. Approved changes preserve baselines and history. Project posting uses Finance services.

## 7. Manufacturing

Scope: items/BOM/version; routings/work centres; demand and material planning; work orders; issue/return/production/scrap; quality; lot/serial traceability; capacity; subcontracting; costing; maintenance links; and production analytics.

Consumption/output create append-only movements and approved journals atomically. BOM/routing versions used by a released work order are snapshotted. Negative stock and unexplained cost variances fail safely.

## 8. Maintenance and physical assets

Scope: equipment hierarchy; meters; preventive plans; requests; work orders; labour/materials; downtime; inspections; warranties; failure codes; spares; mobile execution; cost and reliability analytics.

Maintenance uses Inventory for parts, HCM/Projects for resources, Documents for evidence and Finance for capitalization/expense treatment.

## 9. Portals and external users

Customer, supplier, employee, partner and contractor portals use narrow relationship-scoped identities. External access never becomes broad tenant membership. Every request checks the relationship, consent, object scope and current lifecycle; exports/downloads are audited.

## 10. Operational acceptance

Each module needs complete happy, denial, failure, reversal/return/cancel, retry and reconciliation paths; tenant and permission tests; audit catalogue; exact stock/finance effects; performance targets; responsive accessible UI; localisation keys and approved terminology; provider failure behavior; reports tied to source data; migration; training; support and release evidence.

<div style="page-break-after: always"></div>

<!-- source: docs/06-master-programme-blueprint/books/10-communications/README.md -->

# Book Ten - VAKA Mail and Communications

**Version:** 1.0  
**Definition:** Accepted target  
**Implementation:** Notification/invoice delivery plus a default-off IMAP/SMTP Mail Core; OAuth, UI and GA controls planned

## 1. Outcome

VAKA Mail gives a business one governed communication workspace connected to customers, suppliers, invoices, orders, projects, support and internal work. It does not turn VAKA into an unbounded email provider before identity, security, consent, retention, deliverability and operations are proven.

## 2. Capability map

- connected user and shared mailboxes;
- compose, send, receive, reply, forward, drafts and attachments;
- folders/labels, search, threading and object linkage;
- calendars, availability, invitations and reminders;
- internal messages, channels and task hand-off;
- optional meeting-provider integration, recordings/retention by policy;
- tenant-approved templates and brand/document attachments;
- transactional customer/supplier communications;
- consented campaigns with suppression and analytics;
- delivery/read state only where lawful and technically reliable;
- secure document delivery and expiring access;
- mobile/push/offline-draft behavior;
- AI summarization, drafting, classification and follow-up proposals.

## 3. Canonical communication model

Mailbox, Message, Conversation, Participant, Address, Attachment/DocumentVersion, DeliveryAttempt, Consent, Template, Campaign, CalendarEvent, Meeting, Task and BusinessObjectLink are distinct canonical objects. Provider IDs are adapter metadata, not the primary identity.

Each message belongs to one tenant, policy context and retention class. Cross-tenant communication is an external exchange, never shared database scope.

## 4. Provider architecture

Gmail, Microsoft 365, IMAP/SMTP and other providers require separate approved adapters. Credentials/tokens are encrypted, least-privileged, revocable and never exposed to AI. Synchronization uses cursors, webhook verification, idempotent ingestion, backoff, reconciliation and user-visible degraded state.

The implemented Mail Core provides encrypted IMAP/SMTP accounts, incremental
UID synchronization, stored messages/attachments, threading, send/reply and
permission-aware business-object links behind `mail.hub`. It is a technical
foundation, not a GA claim: Gmail/Microsoft OAuth, webhook reconciliation,
provider onboarding, mailbox UI, malware/DLP controls, retention/export and
distributed scheduler recovery remain gated work.

SMS, WhatsApp and push use the Notification Service. WhatsApp requires verified opt-in, approved templates where applicable, channel rules, audit and safe document links. Provider availability never changes the authoritative invoice/payment/order state.

## 5. Security, privacy and abuse

Controls include sender authorization, anti-spoofing/provider alignment, malware scanning, attachment limits, link protection, rate and campaign limits, suppression, consent evidence, sensitive-data warnings, DLP policy hooks, retention/legal hold, export, deletion handling and incident visibility. VAKA does not promise read receipts when providers or privacy settings make them unreliable.

## 6. Object-linked communication

Authorized users can view a communication timeline on a canonical customer, supplier, invoice, order, project or case. Linking and search inherit the viewer's permissions. A message matching a customer address does not automatically grant every employee access.

## 7. AI Mail

AI may summarize authorized threads, propose replies, identify commitments and suggest object links. It must distinguish quoted facts from inference, avoid sending without explicit confirmation at approved autonomy, redact unnecessary personal data, resist prompt injection in message content and log material tool use. Mail provider/model failure leaves ordinary communication usable.

## 8. Acceptance gates

Mailbox correctness; no message loss/duplication; synchronization recovery; provider and webhook security; tenant/relationship permissions; consent/suppression; malware and sensitive-data controls; retention/export; delivery observability; mobile/accessibility/localisation; AI injection/action tests; support/runbooks; and staged deliverability evidence must pass before GA.

<div style="page-break-after: always"></div>

<!-- source: docs/06-master-programme-blueprint/books/11-business-network/README.md -->

# Book Eleven - VAKA Network, Black Book, Verify and Capital

**Version:** 1.0  
**Definition:** Accepted product-boundary target  
**Implementation:** Referral foundation only; broader product families planned

## 1. Purpose

VAKA Network lets African businesses discover, verify, communicate and collaborate without weakening tenant privacy or creating unreviewed reputational scores. Black Book provides trusted navigation of public/business institutions. Verify manages evidence-backed verification. Capital facilitates governed introductions; it is not automatically a lender, insurer, adviser or credit bureau.

## 2. Network capabilities

Business profiles and directory; products/services catalogue; supplier/customer discovery; marketplace requests/offers; tender and opportunity discovery; events; communities and industry groups; referrals; testimonials; connections; messaging hand-off; advertising/sponsorship; matching; and partner ecosystems.

Public/profile data is explicitly published by an authorized user. Private tenant ERP data never appears in Network without a narrow, revocable consent and purpose. Referral attribution never grants data access.

## 3. Trust and safety

Identity/business verification, moderation, dispute/appeal, fraud/abuse reporting, rate limits, content rules, advertising disclosure, consent, age/role restrictions where relevant, audit, retention and safety operations precede open network scale.

The term **Black Book** means a curated business-navigation reference. It must never become an unreviewed blacklist or a mechanism for defamatory claims, discriminatory exclusion or secret automated adverse decisions.

## 4. VAKA Black Book

Scope: regulator/government/public institution directory; verified contact channels; forms/processes; compliance calendars; fees and effective dates; tender/public procurement navigation; explanatory guides; source citations; update/expiry workflow; user feedback and corrections; multilingual content; and AI-assisted navigation.

Every material entry records source, jurisdiction, effective/last-checked dates, reviewer and uncertainty. It is information, not legal/tax advice. High-impact guidance points to the competent authority and professional review.

## 5. VAKA Verify

Scope: consented business, registration, tax, supplier, director/representative, bank-account, document and certification verification through approved sources/providers; evidence/expiry; recheck; status; dispute; and trust-badge presentation.

Verification states describe exactly what was checked, when, against which source and with what limitations. "Verified" never means financially safe, honest, solvent, compliant in every respect or endorsed by VAKA.

## 6. VAKA Capital

Scope: business readiness profile; consented financial/application data; product discovery; eligibility pre-screening; introductions/referrals; application workflow/status; document exchange; offers comparison; insurance discovery; and outcome tracking.

Country-specific licensing, consumer/business-credit law, privacy, explainability, fair-treatment, conflict, commission and complaint requirements are release blockers. AI may explain data and options but cannot make undisclosed adverse decisions or present regulated advice without authority.

## 7. Network economics

Listings, advertising, referrals, commissions, subscription entitlements and marketplace fees use versioned rules, transparent disclosure, append-only financial records, approval, reconciliation, fraud controls and customer portability. Commercial incentive never changes verification evidence or ranking without disclosure.

## 8. Acceptance

Tenant/public boundary tests; consent and revocation; content moderation and appeals; evidence provenance/expiry; anti-fraud/abuse; privacy/retention; search/ranking explanation; commercial disclosure; provider/legal review; multilingual/mobile/accessibility; incident/support operations; and pilot outcome measures are mandatory before GA.

<div style="page-break-after: always"></div>

<!-- source: docs/06-master-programme-blueprint/books/12-ai-and-intelligence/README.md -->

# Book Twelve - VAKA Intelligence

**Version:** 1.0  
**Definition:** Accepted AI and intelligence architecture  
**Implementation:** Read-only business-summary and evaluation foundations; live model layer not yet approved

## 1. Mission and voice

VAKA Intelligence helps users understand, decide and act using authorized business evidence. Its voice is professional, calm, executive, well-spoken, concise and business-focused. It separates facts, deterministic calculations, inferences and recommendations; states uncertainty; and ends with a useful next step.

## 2. Authority model

AI capability and AI authority are separate. Maturity levels are:

- A - explain public/product knowledge;
- B - read authorized tenant data and summarize;
- C - draft an exact action preview for user confirmation;
- D - execute narrowly pre-approved, reversible low-risk automation under policy;
- E - prohibited autonomous high-impact action.

Payments, ledger posting, stock changes, payroll finalisation, permissions, destructive data action, external communication and other consequential operations require deterministic services, exact scope, permission, confirmation/approval and audit. AI never posts directly to ledger or stock tables.

## 3. Architecture

`Use case -> Identity/Tenant/Permission -> Policy -> Context builder -> Evidence -> Prompt/model route -> Structured response -> Deterministic validation -> Optional tool preview -> Human/approval -> Domain service -> Audit/observability`

The model receives minimum necessary context. Tools use typed schemas and permission-aware services. Prompt, tool, policy, provider/model and evaluation versions are recorded for material outcomes subject to privacy/retention.

## 4. Context, knowledge and memory

Context sources have owner, authority, freshness, classification, tenant/legal-entity scope, permission, retention and citation. Retrieval results do not grant permission. Untrusted documents, web content, messages and integration data are isolated as evidence, never higher-priority instructions.

Memory is use-case-specific, user-controlled where appropriate, minimal, expiring and permission-revalidated on every use. It may store preferences and approved business context but not secrets, unnecessary personal data or hidden cross-tenant profiles.

## 5. Intelligence capabilities

Executive/business summary; cash and working-capital health; receivables/payables attention; sales/pipeline insight; inventory risk and replenishment; procurement/spend insight; project/operations risk; workforce insight; compliance calendar; anomaly detection; forecasting/scenarios; natural-language search/reporting; knowledge assistant; recommendations; workflow drafting; and approved bounded automation.

Every output declares as-at time, currencies/units, evidence, assumptions and confidence appropriate to the use case.

## 6. Domain assistants

Finance, CRM, Procurement, Inventory, Projects/Operations, HR, Mail, Compliance/Black Book, Verify/Capital and Super Admin assistants are separate evaluated use cases. A general chat label never grants broad data or action scope.

## 7. Multilingual behavior

English, Shona and Ndebele AI experiences require language-specific terminology, prompt/evidence behavior, safety and groundedness evaluation plus native review. Translation cannot change permissions, calculations, policy or action scope. The system falls back honestly when a language/use case has not passed its gate.

## 8. Safety and failure controls

Threats include prompt injection, data exfiltration, tenant leakage, hallucination, stale evidence, unsafe tool arguments, authority confusion, bias, sensitive inference, denial of wallet/service and provider compromise. Controls include instruction/data separation, allowlisted tools, schemas, policy enforcement outside the model, output validation, citations, confirmation binding, rate/cost/token/time limits, redaction, monitoring, kill switch and provider/model fallback.

Model failure never blocks deterministic accounting, stock, permissions, tax, workflow, documents or exports. The UI states unavailability and permits ordinary work.

## 9. Evaluation

Each use case/language/autonomy level has a dataset and thresholds for factual correctness, calculation fidelity, evidence/citations, permission/tenant isolation, injection resistance, unsafe-action rate, uncertainty calibration, tone/usefulness, accessibility, latency, cost and graceful failure. Human review covers material professional/business judgment.

Changes to model, prompt, retrieval, tool, policy or source rerun applicable evaluations. Synthetic passing results do not replace pilot and production monitoring.

## 10. Release gates

Approved purpose and owner; provider/privacy/security assessment; permission and context isolation; evaluation thresholds; cost/capacity; observability and kill switch; user disclosure/feedback; confirmation/audit; fallback; multilingual review; runbooks/support; pilot outcome; and availability approval are required. Current repository foundations do not constitute a live AI release.

<div style="page-break-after: always"></div>

<!-- source: docs/06-master-programme-blueprint/books/13-security/README.md -->

# Book Thirteen - Security, Privacy and Assurance

**Version:** 1.0  
**Definition:** Accepted target control system  
**Certification:** None claimed by this book

## 1. Security outcomes

VAKA protects confidentiality, integrity, availability, privacy, tenant isolation and accountable action across identities, applications, APIs, databases, files, caches, search, events, jobs, integrations, AI, backups and operations. Controls follow least privilege, defense in depth, secure defaults, explicit trust boundaries and safe failure.

## 2. Secure development lifecycle

Every capability passes security/privacy requirements, data-flow and threat modelling, secure design, implementation controls, code/dependency/secret/static analysis, verification/abuse testing, release review, staged deployment, monitoring, incident response and lessons learned. Training and vulnerability response continue throughout the lifecycle.

## 3. Tenant and identity security

- derive user, tenant, platform role, session and permission from verified server context;
- scope every direct/indirect read and write, including files, exports, cache, search, events, jobs, AI and logs;
- fail safely without revealing another tenant's record existence;
- protect authentication from enumeration, brute force, credential stuffing, fixation and token theft;
- rotate/revoke sessions and credentials; add MFA/step-up for high risk;
- audit identity, permission, impersonation/support and platform-admin activity;
- never let platform-admin status implicitly create tenant scope;
- use explicit, revocable relationship grants for portals and professionals.

## 4. Application and API security

Boundary validation, typed contracts, safe errors, authorization per operation, idempotency, concurrency control, secure headers/CORS, CSRF controls appropriate to auth mode, rate/abuse limits, payload/file limits, SSRF/path/traversal/injection defenses, output encoding, content security policy, webhook signatures and secure deprecation are mandatory as applicable.

## 5. Data protection and privacy

Inventory and classify personal, financial, authentication, employee, document, communication, AI and commercially sensitive data. Minimize purpose and collection; encrypt in transit and at rest; isolate secrets; redact logs/errors/prompts; control retention/legal holds/deletion/export; manage processor/provider and cross-border risks; support rights and incidents; and document lawful/contractual bases with qualified review.

## 6. Infrastructure and supply chain

Environment isolation, least-privileged service/database accounts, secret management/rotation, hardened images/runtimes, versioned infrastructure, dependency pinning/scanning, SBOM, artifact provenance/signing where adopted, protected branches, CI permissions, backup isolation, patching, vulnerability SLAs, network controls and capacity/DoS protections are required by risk.

## 7. AI security

Treat retrieved content and messages as untrusted data. Prevent instruction escalation, cross-tenant retrieval, secret/personal-data disclosure, unsafe tool calls, model-output trust, provider logging surprises and cost abuse. Policy and deterministic validation live outside the model. Tool authority is narrower than user authority and bound to the exact confirmed preview.

## 8. Threat and abuse programme

Maintain threat models for identity, tenancy, finance, stock, files/OCR, portals, integrations/webhooks, communications, Network/Verify/Capital, AI and Super Admin. Record assets, actors, trust boundaries, data flows, threats, mitigations, owners, residual risk, validation and review triggers. Include insider/support misuse, fraud, social engineering, denial, supply-chain compromise and business-logic abuse.

## 9. Detection, response and recovery

Security logs are structured, correlated, protected and minimized. Alerts route to an owned response. Incident procedures cover triage, containment, evidence, tenant/customer/regulator communication, eradication, recovery, reconciliation, post-incident review and remediation missions. Backups are proven only through restore tests.

## 10. Assurance gates

Required evidence can include code/security review, SAST/dependency/secret scanning, DAST, penetration test, tenant-isolation fuzzing, access review, provider assessment, restore/DR drill, privacy assessment, professional counsel, and production observation. Critical/high findings block release unless formally accepted by the authorized owner with time-limited remediation; tenant leakage and permission bypass are no-go.

"Secure", "compliant" and "certified" are prohibited marketing/status claims without a named scope, standard, assessor, version, evidence and validity period.

<div style="page-break-after: always"></div>

<!-- source: docs/06-master-programme-blueprint/books/14-integrations/README.md -->

# Book Fourteen - Integration Architecture and Catalogue

**Version:** 1.0  
**Definition:** Accepted provider-neutral target  
**Implementation:** Selected file/email/share foundations; provider catalogue largely planned

## 1. Integration doctrine

External providers attach through narrow versioned adapters. Core domains depend on VAKA contracts and normalized states, never provider SDKs or payloads. Provider failure does not corrupt authoritative business state. Every integration has an owner, purpose, data map, credentials, permissions, consent, reliability, security, cost, support, reconciliation, retention and exit plan.

## 2. Standard integration envelope

Each adapter defines:

- provider/contract/version and supported countries/environments;
- tenant connection and explicit scopes;
- credential/token storage, rotation and revocation;
- request/response/webhook schemas and signature verification;
- idempotency inbox/outbox, ordering and concurrency;
- timeouts, retry/backoff, circuit/fallback and DLQ;
- normalized state machine and error taxonomy;
- rate/quota/cost controls;
- data classification, minimization, residency/processor terms and retention;
- logs/metrics/traces/alerts/status and runbook;
- sandbox/fixtures/contract tests and certification where provider requires;
- reconciliation, migration, disablement and provider exit.

## 3. Identity integrations

OIDC/OAuth/SAML/enterprise directory providers are added after Identity supports issuer/audience/key rotation, domain/tenant mapping, account linking, deprovisioning, MFA/step-up, recovery, audit and provider outage behavior. An external identity does not determine VAKA permission by itself.

## 4. Communications

Email, SMS, WhatsApp, push, calendar and meeting providers use Notifications or VAKA Mail contracts. Consent, verified sender, templates, suppression, deliverability, inbound authenticity, attachment security and record retention are explicit.

## 5. Payments and mobile money

Payment adapters normalize intent/request, pending, authorized, successful, failed, cancelled, reversed/refunded and disputed states. Webhooks enter a signed idempotent inbox. Allocation/posting happens through Finance services after verified state. Zimbabwe candidates such as Paynow, EcoCash, InnBucks and licensed providers require official technical/commercial verification; documentation does not claim a live connection.

## 6. Banking

Begin with versioned statement-file parsers and a provider-neutral transaction/reconciliation contract. Contracted APIs, host-to-host/SFTP or regulated aggregators may attach after security and commercial approval. Browser scraping, stored internet-banking passwords and SMS interception are prohibited. Read-only ingestion is proven before outbound payments.

## 7. Government, tax and fiscalisation

Country-pack-owned adapters cover approved tax/fiscalisation, company, payroll/social-security, procurement/tender and other statutory services. They record authority, effective schema/rules, evidence, outage/manual fallback and professional sign-off. VAKA never silently fabricates a successful statutory submission.

## 8. Documents and trust providers

Object storage, malware scanning, OCR, electronic signature, identity/business verification and document-validation adapters preserve tenant isolation, hashes, provenance, consent, expiry, limitations and provider evidence. OCR is always an untrusted draft until authorized validation.

## 9. Commerce, accounting and migration

Approved ecommerce/POS, legacy accounting/ERP, payroll and data-warehouse connections map through canonical contracts. Imports are dry-run, validated, idempotent, exception-managed and reconciled. Synchronization ownership prevents two systems from silently overwriting each other.

## 10. AI providers

Model/embedding/reranking/guard providers are selected per use case with data-use, residency, retention, security, availability, latency, cost and model-change controls. Provider credentials and unnecessary personal/tenant data never enter prompts. Routing/fallback does not lower a use case's safety/evaluation gate.

## 11. Developer interfaces

Public REST/events/webhooks and future SDK/CLI/plugins use explicit scopes, quotas, idempotency, version/deprecation, sandbox, documentation, support and marketplace review. Integrations cannot access raw database tables or cross-tenant data.

## 12. Acceptance

Contract, security, tenant, permission, signature/replay, idempotency, retry/outage, reconciliation, load/quota, privacy/retention, observability, support, migration/exit and country/professional tests must pass. Availability is provider-and-market-specific.

<div style="page-break-after: always"></div>

<!-- source: docs/06-master-programme-blueprint/books/15-country-packs/README.md -->

# Book Fifteen - Country Packs

**Version:** 1.0  
**Definition:** Accepted country-pack contract  
**Implementation:** Zimbabwe reference configuration foundation; other markets planned

## 1. Principle

Africa is not one regulatory, linguistic, monetary or commercial market. Core domain logic stays country-neutral. A Country Pack provides approved effective-dated configuration, terminology, documents, rules and adapters for one jurisdiction without forking VAKA OS.

## 2. Pack contract

Every pack declares:

- ISO country and subdivision identifiers, name and supported time zones;
- supported/default currencies, display names, precision, cash rounding and FX sources;
- languages/locales, formatting, terminology and reviewed catalogues;
- organisation/person/address/statutory identifier schemas;
- tax registrations, types, treatments, rates, effective dates, thresholds, documents, returns and evidence;
- payroll/social-security and employment configuration when in scope;
- chart-of-accounts/report/document templates;
- numbering, fiscal periods, retention and electronic-record/signature rules;
- payment, bank, communications, identity, fiscalisation and government adapter catalogue;
- compliance calendar and source provenance;
- data protection/residency/processor considerations;
- research, legal/accounting/tax/security/native-review owners;
- migrations, fixtures, tests, version, release/rollback and availability.

Country packs provide approved rule content to Platform engines. They cannot weaken tenant, permission, audit, ledger, stock, AI or security invariants.

## 3. Zimbabwe reference pack

Current configuration foundation includes country code ZW, USD and technical currency code ZWG displayed to customers as ZiG, standard/zero-rated/exempt treatment vocabulary, effective-dated standard VAT configuration, BP/VAT identifiers and selected ZIMRA/NSSA/company compliance entries.

This is not professional approval of current tax, payroll, fiscalisation, filing dates, terminology or legal completeness. Before GA, qualified Zimbabwe reviewers must approve sources, effective dates, fixtures, documents, reports and customer guidance. English, Shona and Ndebele catalogues require native/domain review.

## 4. Expansion catalogue

Candidate packs include South Africa, Zambia, Botswana, Namibia, Malawi, Mozambique, Kenya, Tanzania, Nigeria and Ghana. Catalogue inclusion means research target only. Each market receives its own discovery, legal/accounting/tax/privacy/security research, partner/provider validation, pack implementation, migration, pilot, professional sign-off and go/no-go.

No market is enabled by copying Zimbabwe or changing currency symbols.

## 5. Research and provenance

Every material rule cites an authoritative source, publication/effective date, reviewer, interpretation, last checked date and next review trigger. Conflicting or uncertain requirements are marked and gated. Changes produce new effective-dated versions; historical transactions retain their original snapshots.

## 6. Pack lifecycle

`research -> proposed -> professional review -> accepted configuration -> implementation -> automated fixtures -> internal -> pilot -> market approval -> GA -> monitored update -> superseded/retired`.

Emergency statutory updates are still reviewed, versioned, tested, communicated and reconciled.

## 7. Acceptance matrix

Currency/exchange; tax determination/calculation/returns; statutory IDs/documents/numbering; payroll where enabled; banking/payments/fiscalisation; privacy/retention; calendar/timezone; language/terminology/layout; mobile/connectivity; migrations; tenant and historical snapshot integrity; provider outage/manual fallback; support/training; and professional approval must pass for the declared scope.

Country availability is an entitlement and release decision, not a tenant-editable flag.

<div style="page-break-after: always"></div>

<!-- source: docs/06-master-programme-blueprint/books/16-industry-packs/README.md -->

# Book Sixteen - Industry Packs

**Version:** 1.0  
**Definition:** Accepted extension contract  
**Implementation:** Framework target; no industry pack is claimed GA

## 1. Purpose

Industry Packs adapt VAKA terminology, workflows, roles, metadata, templates, reports, integrations and training to validated sector outcomes while preserving the canonical model and Platform/ERP invariants. A pack is an additive governed extension, not a fork or a second ERP.

## 2. Pack contents

Each pack contains:

- target segments, personas, jobs, pain and measurable outcomes;
- process maps, controls, approvals, exceptions and segregation of duties;
- canonical-object extensions and metadata, never duplicate masters;
- role/permission templates;
- workflow, rule and policy packages with versions/tests;
- documents, forms, numbering and templates;
- dashboards, KPIs, benchmarks and report definitions;
- mobile/offline/capture/barcode needs;
- terminology/localisation and accessibility considerations;
- industry-specific privacy, safety, regulatory and retention needs;
- integrations and provider responsibilities;
- data migration mappings and validation;
- AI use cases, prohibited authority and evaluations;
- onboarding, training, support, commercial entitlement and release evidence.

## 3. Candidate catalogue

- Retail and wholesale
- Professional services
- Construction and contracting
- Manufacturing
- Agriculture and agri-processing
- Hospitality and food service
- Logistics and distribution
- Healthcare (subject to heightened health-data/regulatory controls)
- Education
- Nonprofit and membership organisations

These are research horizons. A pack is selected by customer evidence, addressable outcome, regulatory feasibility, platform readiness and reusable demand, not by list order.

## 4. Interaction with country packs

Industry and Country Packs compose through explicit compatibility declarations. Country rules remain authoritative for tax, payroll, statutory documents and legal constraints. Industry configuration cannot override them. Every supported country-industry combination has fixtures and release evidence; success in one market is not assumed elsewhere.

## 5. AI and benchmarking

Industry AI uses authorized tenant data plus approved domain knowledge with provenance. Benchmarks must define cohort, period, currency/units, privacy threshold and uncertainty; VAKA never exposes another tenant or presents a tiny/non-comparable cohort as authoritative.

## 6. Acceptance

Customer research and measurable outcome; canonical-model conformance; Platform/domain/country compatibility; tenant/permission/audit; finance/stock/payroll integrity where affected; regulatory/professional review; mobile/accessibility/localisation; migration; performance; AI evaluation; training/support; pricing/entitlement; pilot evidence and explicit market availability are required.

<div style="page-break-after: always"></div>

<!-- source: docs/06-master-programme-blueprint/books/17-ux-and-design-system/README.md -->

# Book Seventeen - UX and Design System

**Version:** 1.0  
**Definition:** Accepted experience target  
**Implementation:** Tokens/brand and responsive foundations; complete authenticated-app conformance not yet proven

## 1. Experience outcome

VAKA helps capable business people complete serious work with clarity, confidence and control. The interface is assured, modern, African without stereotype, warm without casual treatment of risk, and direct without hiding necessary detail.

## 2. Design system

The system provides governed foundations for colour, typography, spacing, grid, radius, elevation, iconography, motion, density and responsive breakpoints; semantic tokens for surface/text/border/status/focus; accessible primitives; patterns for forms, tables, cards, navigation, dialogs, toasts, commands, timelines, dashboards and documents; and versioned usage guidance.

Tenant branding maps to safe semantic slots and cannot destroy contrast, focus, status meaning, document legibility or VAKA trust attribution.

## 3. Application shell and workbench

The responsive shell includes permission-aware navigation, command/search, notifications, user/tenant context, help, connectivity, approvals and safe sign-out/session behavior. The Universal Workbench is role-aware and action-oriented: priorities, approvals, receivables/payables, cash, stock, sales, deadlines, exceptions and recommendations link to evidence.

Unavailable or unentitled capabilities are labelled honestly. Hiding a navigation item is not authorization.

## 4. Workflow design

Every workflow includes default, loading, empty, success, validation, permission-denied, conflict, partial-provider, offline/interrupted, retry, irreversible/confirmation and recovery states. Consequential actions show effect, scope, finality/reversal, accounting/stock impact where relevant and audit reason.

Progressive disclosure keeps ordinary work clear while allowing experts to inspect evidence and controls.

## 5. Mobile and constrained connectivity

Design from small screens upward. Core work does not require hover, wide tables or precise pointer input. Tables use prioritized columns, cards or controlled horizontal scrolling. Touch targets, readable type, camera/capture, barcode/QR, push and intermittent-connectivity states are explicit.

Offline capability is resource-specific: encrypted minimum data, visible freshness, idempotent queued drafts, conflict handling and server authority. Financial/stock posting never occurs solely offline.

## 6. Accessibility

Target WCAG 2.2 AA for launch workflows: semantic structure, names/roles/states, keyboard and visible focus, contrast, zoom/reflow, screen-reader behavior, error association, motion controls, touch target and non-colour status. Accessibility is tested with automation and manual representative tasks.

## 7. Localisation and content

All new copy uses structured locale keys and stable machine values. English, Shona and Ndebele are first-class; unavailable translations fall back honestly. Formats cover numbers, dates, time zones, currencies, plurals, names/addresses and sorting. Layout tolerates expansion. Financial/legal/security/AI terminology requires qualified/native review.

VAKA AI copy is professional, calm, executive, well-spoken, concise and business-focused.

## 8. Documents and data visualisation

Invoices, statements, reports and exports preserve brand, locale, currency, tax, snapshot and accessibility requirements. Charts show title, units, period, source/as-at, accessible alternative, empty/error state and honest scale. Dense dashboards do not replace explainable actions.

## 9. Acceptance

Design-token/component conformance; representative role workflows; mobile widths/devices; keyboard/screen reader/zoom/contrast/motion; English/Shona/Ndebele reviewed scope; provider/offline/failure states; performance budgets; visual regression; user acceptance and support documentation must pass before GA.

<div style="page-break-after: always"></div>

<!-- source: docs/06-master-programme-blueprint/books/18-devops-and-infrastructure/README.md -->

# Book Eighteen - DevOps and Infrastructure

**Version:** 1.0  
**Definition:** Accepted operational architecture target  
**Implementation:** CI/deployment/health foundations; complete production operations not yet proven

## 1. Principles

Infrastructure is versioned, reproducible, least-privileged, observable, recoverable and cost-aware. The modular monolith remains valid until evidence justifies extraction. Environments and customer data are isolated. Deployment and availability are separate decisions.

## 2. Environments

- Local: synthetic development with safe defaults.
- CI: disposable dependencies/database, deterministic tests and retained evidence.
- Development: shared integration without production data/secrets.
- Staging: production-like topology for migrations, integrations, performance, security and rollback.
- Pilot: selected Zimbabwe tenants, explicit support/consent/flags and observation.
- Production: controlled availability, on-call, backups, incident response, support and approved claims.

No environment shares unrestricted credentials or copies production data without approved minimisation and handling.

## 3. CI/CD and supply chain

Pinned lockfiles, reviewed dependencies, isolated runners, minimal workflow permissions, type/lint/format/build/test gates, migration tests, secret/dependency/SAST scans, SBOM/provenance where adopted, artifact retention, protected review/branch rules, environment approvals and signed/traceable releases form the target pipeline.

Current CI type/build/PostgreSQL test and AI-evidence foundations are not blanket production assurance; known lint/E2E/scan/migration limitations remain missions.

## 4. Deployment and database change

Use immutable build artifacts, validated config, versioned migrations and expand/migrate/contract. Backfills are restartable, idempotent, tenant-safe, observable and reconciled. High-risk changes use flags, shadow/read-only modes, canaries/rings and explicit rollback/forward-fix. Posted history is compensated through domain controls, not destructive database rollback.

## 5. Topology and scalability

Web/API, PostgreSQL, object storage, event/job processing, search, notifications, AI/provider adapters and observability components scale according to measured demand and SLO. Connection pooling, query/index analysis, caching with tenant-safe keys, queue backpressure, storage lifecycle and rate controls are load-tested before scale claims.

Service extraction requires a separate ADR showing independent scaling, security, availability, deployment, ownership, runtime or residency need.

## 6. Observability and SLOs

Every launch-critical flow has correlation, redacted structured logs, golden metrics, traces where valuable, business/invariant signals, dashboards, alerts, ownership and runbook. SLOs define availability, latency, correctness/freshness and recovery; error budgets inform change risk. Tenant identifiers in telemetry are controlled and never leak through customer-facing diagnostics.

## 7. Backup, recovery and continuity

PostgreSQL and object storage backups are encrypted, access-controlled, monitored and stored in an appropriate separate failure domain. Define service-tier RPO/RTO, retention, key recovery, dependency restoration and reconciliation. Scheduled restore and disaster-recovery drills prove the plan; a successful backup job alone is not evidence.

## 8. Security and incident operations

Secrets/keys, patching, vulnerability response, network/edge controls, database/service accounts, provider credentials, logs and admin operations follow Book 13. Incident management covers detection, severity, command, communication, containment, recovery, reconciliation, review and remediation.

## 9. Capacity, performance and cost

Set workload and user-flow budgets, baselines, forecast thresholds and load/soak/stress/failure tests. Monitor database growth, object/event/search/AI cost, provider quotas and tenant fairness. Reliability, performance, security and cost trade-offs are explicit.

## 10. Production gate

Reproducible artifacts; migrations and rollback; configuration/secrets; security scans/review; SLO/alerts/runbooks; capacity/performance; backup/restore/DR; support/on-call; provider status/fallback; legal/professional approvals; staged smoke/reconciliation and observation must pass.

<div style="page-break-after: always"></div>

<!-- source: docs/06-master-programme-blueprint/books/19-testing-and-quality-assurance/README.md -->

# Book Nineteen - Testing and Quality Assurance

**Version:** 1.0  
**Definition:** Accepted verification system  
**Implementation:** Critical backend/platform/finance and CI foundations; frontend E2E and several gates remain incomplete

## 1. Quality doctrine

Testing provides evidence about a named risk and release; it does not prove the absence of defects. Quality begins with an outcome, canonical model, invariants, permission/audit/failure design and testable acceptance criteria. A green build alone is insufficient.

## 2. Test layers

- Static: TypeScript, lint/format, schemas/contracts, architecture and documentation links.
- Unit/property: deterministic rules, calculations, validators, state transitions and edge cases.
- Contract: API/event/provider/client compatibility, errors and versioning.
- Integration: database transactions, adapters, queues, storage, search and provider sandboxes.
- End-to-end: representative user journeys across browser/mobile/client and modules.
- Specialist: finance/stock/payroll/tax/currency, security/privacy, migration/concurrency, performance/resilience, accessibility/mobile/localisation and AI.
- UAT/pilot/production: customer process, operational readiness, smoke/reconciliation and outcome observation.

## 3. Cross-cutting mandatory suites

Tenant isolation covers ID lookup, filters, joins, files, exports, caches, search, events, jobs, integrations, AI, admin/support and deletion/retention. Permission suites test allowed, denied, lifecycle, step-up/approval, segregation and UI/API parity. Audit suites test catalogue, actor/tenant/reason, success/failure, minimization, ordering and export.

## 4. Finance, stock and payroll

Use exact fixtures for balance, invalid/unbalanced rejection, idempotency, concurrency, period lock, numbering, FX/cost/tax snapshots, reversals, AR/AP allocation, reconciliation, oversell rollback, append-only enforcement, payroll calculation/correction and report tie-outs. Qualified reviewers approve representative statutory fixtures.

## 5. Migration and data

Test schema upgrade/rollback or forward-fix, backfill restart/idempotency, representative volume, tenant/legal-entity ownership, mapping/transformation, invalid/duplicate input, dry run, exception recovery, reconciliation, cutover and exports. Tests use disposable environments and synthetic/anonymized data under policy.

## 6. Security, performance and resilience

Threat-model-based tests cover authentication/session, authorization, enumeration, injection, files, webhooks/replay, rate/abuse, SSRF/path, secrets/logs, supply chain, AI injection/tool misuse and admin paths. Performance defines user-flow latency/throughput, database/query budgets, scale profile and regression threshold. Resilience exercises provider/database/queue/storage/model latency/failure, retry storms, partial results, recovery and data consistency.

## 7. Experience and language

Automated and manual accessibility, responsive widths/devices, touch/keyboard/screen reader, zoom/reflow, contrast/motion, loading/empty/error/retry/offline/conflict and visual regression cover core workflows. Locale tests cover English fallback, Shona/Ndebele reviewed scope, text expansion, formatting, documents and AI language behavior.

## 8. AI evaluation

Datasets and thresholds are versioned per use case/language/autonomy. Score facts, calculations, citations, permission/tenant isolation, injection, unsafe actions, uncertainty, tone/usefulness, latency, cost and failure. Provider/model/prompt/tool/retrieval/policy changes trigger reruns. Human review is required where automated scoring cannot establish business/professional correctness.

## 9. Evidence and flake control

Record commit/artifact, environment/config, dataset/fixture, command, timestamps, result, failures/skips, coverage, logs/screenshots/reports and approver. Flaky tests are quarantined only with owner, issue, risk assessment and expiry; retries never convert an unexplained failure into evidence.

## 10. Gate matrix

Apply `docs/04-execution/QUALITY-GATES.md`. No-go includes tenant leakage, permission bypass, financial/stock/payroll corruption, missing critical security/config, untested destructive migration, unrecoverable data risk, critical core accessibility block or unapproved legal/regulatory claim.

Target 95% unit coverage is a Platform-service risk target, not an excuse to omit integration/invariant tests. Coverage thresholds are introduced package by package with a baseline and no regression.

## 11. Current verification note

As of this blueprint build, TypeScript and web production build pass, and isolated Platform tests pass. The full local backend suite requires a correctly provisioned disposable PostgreSQL role/database; a missing local role is an environment block, not a passing suite. CI remains the intended complete database environment.

<div style="page-break-after: always"></div>

<!-- source: docs/06-master-programme-blueprint/books/20-commercial-operations/README.md -->

# Book Twenty - Commercial Operations

**Version:** 1.0  
**Definition:** Accepted commercial-control target  
**Implementation:** Plans/subscriptions/dunning and referral foundations; governed catalogue/entitlements and full commercial readiness partial

## 1. Commercial doctrine

VAKA sells trustworthy outcomes and declared availability, not roadmap promises. Packaging, public copy, signup, entitlements, billing, contracts, support and product behavior derive from one versioned catalogue. Every customer retains protected access to allowed read, billing and export functions during suspend-then-escrow; non-payment never deletes client data.

## 2. Product catalogue and entitlements

The catalogue defines product/module, plan/tier, country/industry pack, user/usage/provider allowance, support/SLA, AI autonomy, prerequisites, price/tax/currency/effective dates, trial, availability and grandfathering. Server-side entitlement checks are authoritative. UI visibility and payment-provider state are not authorization.

Starter, Growth, Business and Enterprise packaging remains subject to approved catalogue and pricing decisions. Proposed prices or features are not public commitments until accepted and implemented.

## 3. Quote-to-cash

Lead/opportunity -> quote/order/contract -> tenant provisioning -> subscription/entitlement -> recurring/usage invoice -> payment/allocation -> renewal/change -> dunning/suspension -> reactivation/termination/export/retention. Every state transition is idempotent, audited, explainable, reversible where applicable and reconciled to Finance.

Commercial billing uses the same exact accounting, currency, tax, numbering and audit controls as customer ERP finance.

## 4. Trials, upgrades and lifecycle

Trials state duration, scope and conversion. Plan changes preview price, timing, proration, allowances, data/feature impact and approvals. Downgrade never destroys data silently. Cancellation, closure and suspension follow retention/export/contract rules. Dunning messages use Notification consent/template/history and safe retry.

## 5. Store, partners and referrals

The VAKA Store is the governed catalogue for first-party modules/packs and approved partner extensions. Listings, security review, permissions, data processing, support, billing, revocation and version compatibility are explicit.

General referral and Professional Partner programmes separate attribution from client-data access. Client portfolio access needs explicit revocable grants. Commission/payout uses versioned rules, append-only records, eligibility/fraud/tax checks, approval and reconciliation. Commercial hypotheses require leadership, legal, tax and margin approval.

## 6. Sales and contracting

Sales materials identify current, Preview, Pilot and planned capabilities. Contracts cover scope, service/support, data processing, security responsibilities, acceptable use, fees/tax, term, suspension/termination, data export/retention, providers and limitations with counsel approval. Enterprise commitments map to deliverable capabilities and owners.

## 7. Revenue operations and analytics

Measure acquisition, activation, conversion, recurring/usage revenue, collection, churn/retention, expansion, support cost, provider/AI cost, margin and cohort outcomes. Metrics reconcile to billing/finance and define currency/as-at. Customer health is not an opaque adverse-decision score.

## 8. Readiness gates

Approved catalogue/pricing/margin; implemented entitlements; finance/tax/reconciliation; contracts/privacy; payment/provider security; dunning/suspend-escrow/export; sales claim audit; partner/referral controls; support/SLA/capacity; onboarding/migration; analytics and launch approval must pass before commercial GA.

<div style="page-break-after: always"></div>

<!-- source: docs/06-master-programme-blueprint/books/21-customer-success/README.md -->

# Book Twenty-One - Customer Success

**Version:** 1.0  
**Definition:** Accepted customer-lifecycle target  
**Implementation:** Product/help fragments exist; complete success operating system planned

## 1. Outcome

Customers can select, onboard, migrate, learn, adopt, operate, obtain support, recover and expand VAKA with confidence and without hidden dependence on VAKA personnel for routine work. Self-service never means bypassing professional review, security, accounting control or high-risk change approval.

## 2. Customer journey

`discover/qualify -> contract -> readiness -> tenant setup -> migration -> validation/sign-off -> role training -> launch -> adoption -> support -> health/outcome review -> renewal/expansion -> offboarding/export/retention`.

Every stage has owner, entry/exit criteria, customer responsibilities, VAKA responsibilities, evidence, risks, communication and escalation.

## 3. Onboarding

Readiness captures business/legal identity, country/industry, people/roles, processes, chart/currency/tax assumptions, inventory, documents, integrations, migration sources, connectivity/devices, privacy/security, training, cutover and success measures. Setup uses guided, restartable tasks with safe defaults and review before consequential activation.

## 4. Migration

Customers receive discovery, mapping, dry-run, exception, reconciliation, cutover and sign-off reports. Opening financial and stock positions require exact control and qualified review. Original source extracts and transformation evidence follow retention/security policy. Failed migration cannot partially post live state.

## 5. Learning and knowledge

The VAKA Academy provides role- and workflow-based learning, sandbox data, guided practice, administrator training, country/industry content, accessibility and approved languages. User guides are versioned against releases. Contextual help links to the exact product state and declares Preview/planned differences.

## 6. Support and service management

Support channels, severity, response/restore targets, hours, entitlement, identity verification, secure diagnostics, support-access grants, escalation, known issues, status communication and closure are defined. Support staff never receive broad tenant access by default; access is purpose-bound, time-limited, auditable and customer-visible where required.

## 7. Adoption and health

Measure activation, workflow completion, reconciliation, feature adoption, errors, performance, support burden, training, outcomes and renewal risk using explainable tenant-authorized signals. Health does not expose other tenants or trigger undisclosed adverse treatment. Recommendations link to actions and evidence.

## 8. Change and release communication

Customers receive relevant release notes, action-required notices, deprecation/migration windows, downtime/status, security notifications and country/statutory changes. Communications are accessible, localized where enabled, consent-aware and archived.

## 9. Offboarding

Contract/lifecycle controls provide export, billing settlement, credential/provider revocation, retention/legal hold, deletion/anonymization where permitted, confirmation and reactivation window. Suspend-then-escrow remains intact; non-payment is not deletion.

## 10. Acceptance

Pilot onboarding rehearsals; migration reconciliation; role training/UAT; support and escalation simulation; secure support access; knowledge accuracy/accessibility/localisation; outcome and adoption metrics; renewal/offboarding/export; and customer sign-off must pass for the release scope.

<div style="page-break-after: always"></div>

<!-- source: docs/06-master-programme-blueprint/books/22-operations-manual/README.md -->

# Book Twenty-Two - Operations Manual

**Version:** 1.0  
**Definition:** Accepted operating-model target  
**Implementation:** Selected deployment, backup, billing and admin procedures; full runbook set incomplete

## 1. Operating model

Operations protects customer outcomes and data across Platform, ERP, Intelligence, Network products, integrations and commercial lifecycle. Responsibilities include service ownership, support, incident, problem, change, release, capacity, availability, security operations, backup/DR, provider management, data operations and status communication.

Roles are assigned through a RACI for every service and release. Early-stage role consolidation does not remove independent approval requirements.

## 2. Daily control cycle

1. Review service health, SLO/error budget, incidents and security signals.
2. Review database/storage/queue/search/provider/AI capacity, failures and cost.
3. Review finance/stock/billing/integration reconciliation exceptions.
4. Review backup jobs and scheduled restore/drill status.
5. Review tenant lifecycle, dunning, support escalations and release changes.
6. Record decisions, owners, deadlines and unresolved risk.

Dashboards support judgment; they do not silently auto-correct authoritative data.

## 3. Super Admin operations

The Super Admin Control Centre covers platform health; tenants and lifecycle; users/sessions; subscriptions/billing/dunning; entitlements/features; jobs/events/DLQ; notifications/providers; documents/storage; integrations; audit/security; releases/configuration; country/industry packs; AI use cases/evaluations/kill switch; support grants; data export/retention; capacity/cost; incidents/status; and the User Guide.

Dangerous controls require named permissions, step-up or approval where applicable, exact preview, reason, idempotency, audit and outcome verification. Super Admin never edits posted tenant finance/stock or impersonates silently. Tenant support access is explicit, narrow, expiring and audited.

## 4. Incident management

Detect -> classify severity/customer/data impact -> assign incident commander -> contain -> preserve evidence -> communicate -> restore -> reconcile -> monitor -> close -> review -> remediation missions. Security/privacy/regulatory notification follows approved counsel and market requirements. Status updates are factual, timestamped and do not speculate.

## 5. Problem and known-error management

Recurring/significant incidents receive root-cause analysis, contributing controls, corrective/preventive actions, owners, due dates, verification and knowledge updates. Workarounds are time-limited and never become hidden architecture.

## 6. Change and release

Every change has mission/release ID, risk, dependencies, approvals, test evidence, migration, rollout, monitoring, rollback, customer/support communication and observation window. Emergency change is reviewed after stabilization. Feature flags have owner and expiry.

## 7. Backup and disaster recovery

Runbooks specify PostgreSQL/object/config/key/event/search dependencies, backup frequency/retention, integrity checks, restore order, RPO/RTO, failover, credential recovery, reconciliation, tenant/customer communication and return to normal. Drills record actual times, loss, failures and remediation.

## 8. Data and reconciliation operations

Operational corrections use approved domain commands and audit, never ad-hoc destructive SQL against posted history. Data repair has incident/change record, tenant scope, backup, dry run, approval, exact affected rows/objects, reconciliation and validation.

## 9. Provider and capacity operations

Track provider status, credentials/certificates, quotas, cost, latency/errors, webhook lag, reconciliation, support cases and exit/fallback. Capacity forecasts cover tenants/users/records, database/storage, queues, search, notifications, AI, integrations and support.

## 10. Runbook minimum

Each service runbook states purpose/owner/SLO, dependencies, dashboards/alerts, common failure diagnosis, safe actions, escalation, data/security considerations, backup/recovery, provider procedures, reconciliation, communication and last rehearsal.

## 11. Acceptance

On-call/support ownership, operational dashboards/alerts, incident/change/release drills, restore/DR, reconciliation, admin-permission/audit, provider failure, capacity, customer communication and current runbooks must pass before GA.

<div style="page-break-after: always"></div>

<!-- source: docs/06-master-programme-blueprint/books/23-product-roadmap/README.md -->

# Book Twenty-Three - Product Roadmap

**Version:** 1.0  
**Definition:** Accepted outcome/dependency roadmap  
**Dates:** Set only after capacity, dependencies and gate evidence are known

## 1. Roadmap doctrine

The roadmap communicates customer outcomes and dependencies, not unsupported delivery promises. Architecture is broad enough for the full portfolio; availability advances in controlled increments. Zimbabwe depth comes before multi-country breadth, while country-neutral contracts prevent a later rewrite.

## 2. Horizon A - Trustworthy foundation

Outcomes: reproducible delivery; governed Knowledge System; frozen architecture; Platform Kernel adoption; identity/session/security hardening; audit coverage; finance/stock invariants; tenant safety; configuration/secrets; CI evidence; status/claim truth.

Exit: launch-critical foundations pass applicable Gates 0-8 and every mission status matches evidence.

## 3. Horizon B - Zimbabwe operational core

Outcomes: complete CRM/sales, procurement, inventory and finance launch workflows; Zimbabwe country configuration and professional review; responsive accessible shell/workbench; reports/documents/imports; notification/email delivery; onboarding/migration/support; Super Admin control centre.

Exit: selected pilot businesses complete defined daily/period-end workflows with reconciliation, recovery and support evidence.

## 4. Horizon C - Controlled intelligence and communications

Outcomes: evaluated read-only VAKA Intelligence; executive summary/attention; permission-aware search; VAKA Mail foundations and object-linked communications; workflow/rule/policy services; mobile capture and approved offline drafts.

Exit: each AI/communication use case passes its own safety, privacy, outcome, provider and availability gates.

## 5. Horizon D - Zimbabwe GA and commercial scale

Outcomes: production SLO/observability/DR/security/professional review; entitlements/billing/dunning; customer success/academy/support/status; migrations; pilot-to-GA evidence; measured adoption and operations.

Exit: Launch Gate Register accepted by Product, Engineering, Security, Operations and required professionals; public claims match deployed reality.

## 6. Horizon E - Ecosystem products

Outcomes: Network/directory/marketplace, Black Book, Verify, Capital, VAKA Mail expansion and Studio/developer platform through separate legal/security/provider/pilot gates.

Exit: product-specific trust and business outcomes pass; no expansion weakens tenant or ERP integrity.

## 7. Horizon F - Country and industry expansion

Outcomes: selected additional Country and Industry Packs, partner/provider network, migrations, languages and support. Selection follows evidence and readiness, not a fixed continental rollout claim.

Exit: each country-industry combination passes pack, professional, integration, operations, commercial and customer-success gates.

## 8. Continuous workstreams

Security/privacy; finance integrity; architecture conformance; testing; performance/capacity/cost; accessibility/mobile/localisation; AI evaluation; documentation/traceability; professional review; reliability/DR; customer feedback and technical debt continue across every horizon.

## 9. Roadmap governance

Every roadmap item states outcome, owner, target cohort/market, success metric, dependencies, capability and Mission Pack links, gate/risk, confidence and availability. Changes are versioned and communicated. A planned capability is not sold or displayed as live.

Book 24 is the executable sequence. `knowledge-system/13-roadmaps/MASTER-BUILD-PLAN.md` remains the Zimbabwe critical-path view and is reconciled rather than silently replaced.

<div style="page-break-after: always"></div>

<!-- source: docs/06-master-programme-blueprint/books/24-engineering-mission-catalogue/README.md -->

# Book Twenty-Four - Engineering Mission Catalogue

**Version:** 1.0  
**Definition:** Accepted mission namespace and full capability backlog  
**Execution rule:** No implementation without a detailed approved Mission Pack

## 1. Mission law

One mission is a bounded, independently testable, reviewable and reversible change. One mission normally maps to one PR, review, merge and Completion Report. IDs are permanent and never reused. One engineering day is preferred; work expected to exceed three days is decomposed or receives an explicit exception.

Each row below is a catalogue allocation, not automatically implementation-ready. A detailed pack must contain repository reconnaissance, outcome, scope, dependencies, allowed/forbidden changes, security/data/domain impacts, steps, tests, migration/rollout/rollback, acceptance and DoD.

## 2. Existing committed IDs

| ID | Mission | Evidence status on 2026-07-11 |
|---|---|---|
| P1-001 | Platform Kernel Foundation | Implemented and previously verified |
| P1-002 | Identity and Audit adapters | Implemented; Completion Report present |
| P1-003 | Kernel-backed audit facade adoption seam | Implemented; isolated suite passed after test-flake fix; mission status reconciliation required |
| P2-001 | Country Pack engine and Zimbabwe reference | Implemented foundation; isolated tests passed; professional review still required |

Existing IDs in `knowledge-system/13-roadmaps/MASTER-BUILD-PLAN.md` remain reserved even where the detailed pack is not written.

## 3. Engineering and governance missions

| Range | Allocated missions |
|---|---|
| P0-001..006 | repository/owner baseline; document authority; Architecture Freeze; ontology/CIM/dictionary baseline; requirement traceability; documentation validation |
| P0-007..012 | Mission Pack/Completion schemas; branch/review protection; lint/format baseline; CI database migrations; dependency/secret/SAST/SBOM; artifact/provenance retention |
| P0-013..018 | frontend test harness; E2E harness; coverage policy; architecture conformance; release evidence automation; engineering metrics |

## 4. Platform missions

| Range | Allocated missions |
|---|---|
| P1-004..008 | notification adapter; durable event/outbox; tenant-safe search; unified documents; canonical metadata seed |
| P1-009..014 | configuration/secrets provider; health/readiness; audit catalogue/search/export; job/scheduler foundation; internal notifications; provider routing/retry |
| P1-015..020 | document encryption/versions/scanning/retention; search indexing/rebuild; workflow definitions/instances; rule expression sandbox; policy decisions; reporting contracts |
| P1-021..026 | AI Context service; prompt/tool registries; observability/correlation; metrics/tracing/alerts; developer API/versioning; webhook platform |
| P1-027..032 | SDK/CLI foundations; plugin/sandbox boundary; Platform Admin operations APIs; tenant support grants; cache isolation; Platform penetration/performance gates |

## 5. Finance and Zimbabwe missions

| Range | Allocated missions |
|---|---|
| P2-002..007 | VAT treatments; VAT return; FX register; period close; statutory reports; gated payroll foundation |
| P2-008..013 | legal-entity/fiscal-period model; accounting-event/posting contracts; chart/account governance; journals/adjustments/reversals; AR credit/debit notes; receipt allocation/unapplied cash |
| P2-014..019 | AP bills/match/posting; payments/approvals; bank reconciliation close; expenses/approvals; budgets/forecasts; fixed assets |
| P2-020..025 | cash flow; treasury; consolidation prerequisites; finance report reconciliation; finance audit/export; close management |
| P2-026..031 | Zimbabwe fiscalisation research/adapter; statutory ID/documents; PAYE/NSSA professional fixtures; tax/calendar updates; finance AI read models; finance GA assurance |

## 6. CRM, sales and customer operations missions

| Range | Allocated missions |
|---|---|
| P3-001..005 | pipeline foundation; canonical customer; activity timeline; quote-to-invoice; sales dashboard |
| P3-006..011 | leads/qualification; quotes/versioning/approval; sales orders; price books/discount policy; fulfilment/returns; customer statements/portal |
| P3-012..017 | consent/preferences; campaigns; tasks/meetings; import/deduplication; customer analytics; CRM AI evaluation |

## 7. Procurement and inventory missions

| Range | Allocated missions |
|---|---|
| P4-001..004 | canonical supplier; requisition/RFQ/PO/receipt; three-way match; supplier analytics |
| P4-005..010 | supplier onboarding/verification; approvals/delegation; PO changes/cancel; returns; contracts; supplier portal |
| P4-011..014 | spend/category analytics; procurement AI; source-to-pay reconciliation; procurement GA gate |
| P5-001..005 | products/warehouses; append-only movements; valuation/COGS; reorder alerts; barcode/QR mobile |
| P5-006..012 | locations/bins; reservations/availability; batches/lots/serials/expiry; stock counts; transfers; receiving/picking/packing; returns |
| P5-013..017 | landed cost; replenishment; inventory analytics/AI; reconciliation/performance; WMS GA gate |

## 8. Experience, communications and intelligence missions

| Range | Allocated missions |
|---|---|
| P6-001..005 | design tokens; responsive permission shell; Universal Workbench; search UI; WCAG core-flow pass |
| P6-006..011 | localisation runtime/catalogues; English externalization; Shona review/enablement; Ndebele review/enablement; offline/interruption states; visual/E2E regression |
| P7-001..004 | email delivery; communication timeline; branded templates; governed WhatsApp/document delivery |
| P7-005..011 | mailbox contract; provider connection/sync; shared mailboxes; calendar/tasks; internal messaging; campaigns/consent; AI Mail evaluation |
| P8-001..004 | business-summary read model; evaluation harness; bounded Q&A; executive briefing |
| P8-005..011 | evidence/citations; model/provider gateway; policy/kill switch; natural-language reports; recommendations; action preview/confirmation; multilingual AI gates |
| P8-012..017 | finance/CRM/procurement/inventory/projects assistants; anomaly/forecasting; AI operations/cost; production pilot gate |

## 9. Security, operations and launch missions

| Range | Allocated missions |
|---|---|
| P9-001..007 | transport hardening; secrets; backup/DR evidence; privacy readiness; incident response; CI scans/SBOM; penetration/tenant fuzzing |
| P9-008..014 | MFA/step-up; OAuth/SSO/API keys; session/refresh rotation; support-access controls; retention/legal hold; vulnerability management; security training/exercises |
| P9-015..020 | SLO/alerts; capacity/load/soak; provider resilience; database/query/performance; restore/DR drill; operations readiness review |
| P10-001..003 | pilot onboarding/support; end-to-end observability; Zimbabwe production launch checklist |
| P10-004..009 | migration rehearsal; UAT/professional sign-offs; security go/no-go; commercial/support go/no-go; staged deployment/rollback; post-launch observation/outcome review |

## 10. Workforce, projects, manufacturing and maintenance missions

| Range | Allocated missions |
|---|---|
| PH-001..008 | worker/organisation model; recruitment/onboarding; leave; attendance/time; payroll architecture; payroll engine/approval; performance; learning/self-service |
| PH-009..012 | privacy/retention; HR reporting; AI HR evaluation; country/professional GA gate |
| PJ-001..008 | project/work breakdown; tasks/dependencies; resources; timesheets/expenses; budgets/forecast; procurement/stock; billing/revenue; portfolio/risk |
| PJ-009..011 | documents/collaboration; AI project manager; project GA gate |
| PM-001..009 | items/BOM; routing/work centres; planning; work orders; material issue/return; output/scrap; quality/traceability; costing/journals; manufacturing analytics/AI |
| PMT-001..007 | equipment; maintenance plans; requests/work orders; labour/spares; inspections/failure; mobile execution; maintenance analytics/GA |

## 11. Ecosystem product missions

| Range | Allocated missions |
|---|---|
| PN-001..010 | public business profile; directory/search; marketplace/offers; supplier/tender discovery; communities/groups; events; referrals; testimonials; moderation/appeals; AI matching/network pilot |
| PB-001..007 | Black Book source model; institution directory; processes/forms; compliance calendar; tender navigation; multilingual/AI guide; provenance/review/launch |
| PV-001..008 | Verify consent/case; business/source adapters; people/representative checks; document evidence; expiry/recheck; status/badges; disputes; legal/security pilot |
| PC-001..009 | Capital legal model; readiness profile; product catalogue; consented application; provider referrals; offer comparison; status/documents; AI explanation/fairness; regulated pilot |
| PS-001..006 | Store catalogue; entitlements/install; partner onboarding/security; billing/revenue share; update/revoke; Store GA |
| PST-001..010 | Studio API portal; webhook console; SDK; CLI; extension manifest; sandbox; workflow/form/template builders; plugin review; marketplace publishing; Studio GA |

## 12. Country, industry, migration and customer-success missions

| Range | Allocated missions |
|---|---|
| PL-001..010 | South Africa; Zambia; Botswana; Namibia; Malawi; Mozambique; Kenya; Tanzania; Nigeria; Ghana packs - each expands into research, implementation, professional review, fixtures, pilot and GA sub-missions before execution |
| PI-001..010 | retail/wholesale; professional services; construction; manufacturing; agriculture; hospitality; logistics; healthcare; education; nonprofit packs - each requires customer research and country compatibility |
| MIG-001..012 | assessment; mapping engine; chart/accounts; parties; products; opening stock; opening balances/open items; bank/history; documents; dry-run/exceptions; cutover/rollback; reconciliation/evidence |
| CS-001..010 | onboarding readiness; guided setup; migration management; role training; Academy/knowledge; support service desk; secure support grants; adoption/health; renewal/change; offboarding/export |

## 13. Commercial and operations missions

| Range | Allocated missions |
|---|---|
| CO-001..010 | product catalogue; entitlement resolver; pricing approval/versioning; quote/contract; recurring/usage billing; tax/payment reconciliation; dunning/suspend-escrow; upgrades/downgrades; referrals/partners; commercial analytics/readiness |
| OPS-001..010 | service catalogue/ownership; operations dashboards; incident/status; problem/known errors; change/release; backup/restore; DR; capacity/cost; provider operations; Super Admin/User Guide readiness |

## 14. Universal mission acceptance

Every implemented mission must show: controlling authority and outcome; repository reconnaissance; bounded change; TypeScript/static checks; applicable unit/integration/contract/domain tests; tenant/permission/audit; data/migration/invariant; security/privacy; mobile/accessibility/localisation; AI gate; documentation; observability; rollout/rollback; Completion Report; and status-register update. Skipped or environment-blocked checks remain explicit.

## 15. Immediate verified sequence

1. Reconcile P1-003 and P2-001 Completion Reports/status after exact tests.
2. P1-004 unified Notification adapter mission pack and implementation.
3. P1-005 durable event/outbox design ADR and additive implementation.
4. P1-006 tenant-safe Search adapter.
5. P1-007 unified Document adapter.
6. P1-008 canonical Metadata seed.
7. Parallel approved P2 hardening, Super Admin foundations, CI/security and UX missions only after their dependencies/packs are ready.

<div style="page-break-after: always"></div>

<!-- source: docs/06-master-programme-blueprint/00-governance/REQUIREMENT-TRACEABILITY-MATRIX.md -->

# Requirement traceability matrix

This register maps constitutional outcomes to blueprint books and evidence systems. Book 24 expands the mapping to missions.

| Requirement | Governing source | Blueprint | Evidence |
|---|---|---|---|
| Multi-tenant isolation | Constitution; Coding Standards | Books 6, 7, 13, 19 | Tenant tests, schema/query review, file/search/event/AI checks |
| Secure least-privilege access | Constitution; Security Principles | Books 7, 13, 18, 19 | Threat model, permission tests, scans, audit evidence |
| Append-only finance/stock history | AGENTS; Finance architecture | Books 6, 8, 9, 19 | Invariant, reversal, transaction, concurrency tests |
| Exact money and currency snapshots | Coding Standards; Finance docs | Books 6, 8, 15 | Exactness and FX snapshot tests, professional approval |
| AI-first with bounded authority | AI Constitution | Books 7, 12, 13, 19 | Evaluation harness, permission/adversarial tests, approval audit |
| English, Shona, Ndebele | Constitution; Localisation | Books 15, 17, 19 | Catalogues, native review, expansion/accessibility checks |
| Mobile-responsive core work | Constitution; Product Philosophy | Books 17, 19 | Responsive, keyboard, touch, offline/interruption tests |
| Suspend then escrow | Constitution; billing docs | Books 20, 21, 22 | Lifecycle tests, export/read access evidence |
| Auditability and recovery | Constitution; Quality Gates | Books 7, 13, 18, 22 | Audit catalogue, restore drills, RPO/RTO evidence |
| Architecture freeze | ADR-002 | Books 1-7, 24 | ADR conformance review and mission linkage |
| Complete launch gates | Quality Gates; Release Strategy | Books 18-24 | Gate register, approvals, staged deployment and observation |

No matrix row is complete merely because a blueprint chapter exists.

<div style="page-break-after: always"></div>

<!-- source: docs/06-master-programme-blueprint/00-governance/PROFESSIONAL-REVIEW-REGISTER.md -->

# Professional review register

## Rule

Templates, research, code, and AI output are not professional approval. Required reviews must identify reviewer credentials, jurisdiction, scope/version, assumptions, findings, approval limits, date, expiry/review trigger, and remediation missions.

| Domain | Required before | Current status |
|---|---|---|
| Zimbabwe accounting and financial statements | Finance GA | Required; no approval evidence recorded here |
| Zimbabwe tax/VAT/PAYE/NSSA/fiscalisation | Relevant calculation or filing GA | Required; configuration remains subject to review |
| Legal terms, privacy, DPAs, electronic signatures | Customer contracting/data processing GA | Required; repository templates are skeletons |
| Cyber and Data Protection Act/POPIA applicability | Production processing and expansion decisions | Required |
| Security penetration testing | Identity and production launch gates | Required; no current certification claim |
| Shona and Ndebele business/financial terminology | Locale enablement | Required native/professional review |
| Payments, banking, lending, insurance, Verify | Provider pilot/GA | Regulatory, contractual, security, and legal review required |
| Country and industry packs | Each market/industry GA | Qualified local/domain review required |

## Blocking rule

An implementation may be developed behind an internal flag using clearly labelled assumptions. It may not advance to pilot or GA where a required review is missing, expired, or materially scoped to another version.

<div style="page-break-after: always"></div>

<!-- source: docs/06-master-programme-blueprint/00-governance/BENCHMARK-METHOD.md -->

# Enterprise benchmark method

VAKA targets the discipline associated with mature enterprise platforms, but it will not claim parity with Microsoft, SAP, or another company based on document volume or aspiration.

## External reference points

- [Microsoft Security Development Lifecycle](https://learn.microsoft.com/en-us/compliance/assurance/assurance-microsoft-security-development-lifecycle): security/privacy requirements, threat modelling, secure implementation, verification, staged release, training, and response.
- [Microsoft Azure Well-Architected Framework](https://learn.microsoft.com/en-us/azure/well-architected/): reliability, security, cost optimisation, operational excellence, and performance efficiency with explicit trade-offs.
- [SAP Cloud ALM implementation process](https://help.sap.com/docs/cloud-alm/applicationhelp/implementation-process): process-led requirements, task control, quality gates, and recorded acceptance.
- [SAP Cloud ALM quality gate reporting](https://help.sap.com/docs/cloud-alm/applicationhelp/quality-gate-reporting): cross-project gate status, checklist completion, accountability, and evidence.

These are benchmark inputs, not endorsements, certifications, or proof that VAKA uses Azure or SAP technology.

## VAKA benchmark dimensions

1. Customer outcome and process completeness.
2. Tenant, identity, permission, privacy, and audit assurance.
3. Accounting, stock, tax, currency, numbering, and transactional integrity.
4. Reliability, scalability, performance, recoverability, and operability.
5. API, data, event, integration, migration, and extension governance.
6. Accessibility, mobile, localisation, and constrained-connectivity quality.
7. AI groundedness, authority, safety, evaluation, cost, and failure behavior.
8. Traceability from requirement to mission, code, test, release, and outcome.
9. Commercial, support, customer-success, and country readiness.
10. Independent professional review and production evidence.

## Assessment scale

- 0 - not assessed
- 1 - target captured
- 2 - controlled design accepted
- 3 - implemented and internally verified
- 4 - pilot evidence and required external review
- 5 - GA evidence with measured outcomes and recurring assurance

Scores are capability-specific. VAKA has no single "enterprise-grade" score until every launch-critical dimension meets its defined threshold.
