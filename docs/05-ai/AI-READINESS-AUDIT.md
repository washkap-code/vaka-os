# VAKA AI Readiness Audit

**Status:** Current-state audit — no AI implementation
**Owner:** Product, Engineering, Security, and Data Protection
**Last reviewed:** 2026-07-05

## 1. Purpose

This audit compares the current VAKA OS repository with the requirements in the VAKA AI specification. It identifies reusable foundations, missing controls, blockers, and the safest starting point.

No AI provider, model, prompt, endpoint, tool, memory store, or user-facing AI function is implemented by this audit.

## 2. Executive finding

VAKA is **not ready to ship VAKA AI**, but it has valuable domain foundations for a future read-only implementation.

The strongest foundations are:

- authenticated tenant context;
- server-side role permissions;
- tenant-owned records;
- audit logging;
- deterministic accounting, invoicing, inventory, and reporting services;
- transactional cross-module workflows;
- existing read-oriented reports; and
- explicit documentation that AI must remain optional and permission-scoped.

The principal blockers are:

- repository quality and CI foundations are incomplete;
- no AI policy enforcement layer exists;
- no model gateway or approved provider exists;
- no AI-specific audit schema exists;
- no bounded AI tool registry exists;
- no evaluation harness or datasets exist;
- no production-ready localisation framework exists;
- authentication/session and secret-management risks remain;
- frontend and API contracts are weakly typed;
- observability, rate limiting, cost controls, and kill switches are absent; and
- the existing module maturity is uneven.

The safest first AI capability remains a **read-only, English-only, internal synthetic-data executive summary**. It must not begin until the foundation gates below pass.

## 3. Current repository evidence

### Frontend

- React, TypeScript, and Vite.
- Public VAKA AI content is labelled as a concept/preview.
- No live AI route or provider call is present.
- No authenticated AI panel, conversation state, source display, or unavailable-state workflow exists.
- A typed homepage English catalogue exists, but complete application localisation does not.
- Frontend automated testing remains absent.

### Backend

- Express and TypeScript.
- PostgreSQL through Drizzle ORM.
- Authentication middleware reloads the current user, role, permissions, and tenant.
- Tenant lifecycle restrictions distinguish full, readonly, and export-only access.
- Domain services exist for accounting, invoicing, inventory, billing, and reports.
- Audit events are available through the existing audit helper.
- No AI dependencies, endpoints, provider SDKs, prompts, tool registry, vector store, embedding service, or AI job worker are present.

### Tests and operations

- A critical backend integration suite exists.
- AI-specific tenant, permission, injection, tool, confirmation, multilingual, cost, and failure tests do not exist.
- No documented AI production monitoring or incident runbook exists.
- No model/provider approval, privacy assessment, or cross-border processing decision exists.

## 4. Readiness matrix

| Area | Current state | Readiness | Required next evidence |
|---|---|---:|---|
| Tenant context | Server-derived authenticated tenant exists | Partial strength | AI-specific direct/indirect isolation tests |
| Permissions | Named server-side permissions exist | Partial strength | Dedicated AI/read-tool permissions and derived-insight tests |
| Deterministic domains | Accounting, inventory, invoicing, and reports exist | Strength | Stable typed read models and exact-value fixtures |
| Audit | General audit helper exists | Partial | AI request/tool/approval/result schema and retention policy |
| API contracts | Express routes with validation in places | Weak | Typed, versioned AI contracts and stable error codes |
| Model gateway | Absent | Blocked | Provider-neutral interface, policy, budgets, timeout, kill switch |
| Provider governance | Absent | Blocked | Security/privacy/legal review and approved processing terms |
| Tool registry | Absent | Blocked | Bounded read-only registry with metadata and tests |
| Retrieval | Structured DB queries exist; AI retrieval absent | Blocked | Permission-safe read models; vector retrieval not required initially |
| Memory | Absent | Appropriate for first release | Explicitly keep first release without durable conversational memory |
| Evaluation | Absent | Blocked | Versioned harness, synthetic dataset, rubrics, release report |
| Localisation | Partial public catalogue only | Blocked for Shona/Ndebele | Product catalogue infrastructure and native evaluation |
| Observability | Limited application evidence | Weak | Correlation IDs, AI metrics, redaction, alerts |
| Rate/cost control | Absent | Blocked | Per-user/tenant budgets, limits, denial-of-wallet controls |
| Action approval | Existing ordinary UI prompts; no AI flow | Blocked for action | Structured draft/preview/approval/revalidation system |
| Background work | Billing cron exists; no general job/outbox platform | Weak | Durable jobs/events before proactive intelligence |
| Security baseline | Known auth/secret/rate-limit concerns | Blocked for production | Complete relevant Stage 1/4 security work |

## 5. Reusable assets

### Authentication and tenant context

The current request context can become the source of actor and tenant identity for AI API calls. AI must never accept a tenant ID from model output or use it as authorisation.

### Permission middleware

The current permission pattern can be reused, but AI requires:

- explicit permission names for AI use cases;
- tool-level checks;
- field/aggregate sensitivity decisions;
- safe denial behaviour; and
- tests proving derived summaries do not leak restricted facts.

### Reports and domain services

Existing report services are the best source for initial read tools because they already express domain calculations. They must first receive:

- typed inputs and outputs;
- exact currency/period metadata;
- completeness/freshness metadata;
- bounded result sizes;
- stable source references; and
- tenant/permission fixtures.

### Audit helper

The audit mechanism can support AI events after defining:

- event taxonomy;
- correlation IDs;
- model/provider/prompt/tool version fields;
- data-minimised payload rules;
- outcome and refusal status;
- retention/access policy; and
- sensitive-data redaction.

## 6. Gaps by AI layer

### AI API boundary

Missing:

- dedicated authenticated endpoints;
- request cancellation;
- stable typed errors;
- use-case permissions;
- rate and payload limits;
- streaming/fallback policy; and
- safe unavailable response.

### Policy layer

Missing:

- capability and autonomy registry;
- data classification;
- provider eligibility;
- policy decision records;
- cost and rate budgets;
- language enablement;
- high-impact blocking; and
- central kill switch.

### Context and retrieval

Missing:

- approved read models;
- source provenance;
- freshness and coverage metadata;
- minimisation/redaction;
- prompt-injection boundaries; and
- result-size enforcement.

Initial read-only work does **not** require embeddings or a vector database. Structured report and record tools are safer and easier to evaluate.

### Model gateway

Missing:

- provider-neutral contract;
- model allow-list;
- prompt/policy versioning;
- timeout, retry, and circuit-breaker behaviour;
- token/cost accounting;
- provider data-handling configuration; and
- model-change detection.

### Response validation

Missing:

- grounded-claim checks;
- structured response schema;
- exact-value preservation;
- source attachment;
- uncertainty classification;
- safety/refusal handling; and
- prohibited completion claims.

### Actions

No AI action layer exists. This is correct for the first release.

Before any Level C action:

- drafts;
- deterministic validation;
- exact previews;
- bound approvals;
- record-version revalidation;
- idempotency;
- reconciliation; and
- action-specific audit

must exist independently of model output.

### Memory

No durable AI memory exists. The first release should use bounded request context only. User and tenant preference memory should be a later, separately governed capability.

### Proactive intelligence

The repository lacks a general durable event/outbox/job and notification foundation. Executive Intelligence must therefore be deferred beyond on-demand summaries.

## 7. Security blockers

Before any production tenant-data AI pilot:

1. Remove the production JWT secret fallback.
2. Add authentication abuse/rate controls.
3. approve secure session/token direction;
4. establish AI provider privacy/security terms;
5. classify allowed and prohibited data;
6. implement provider-side training/retention controls;
7. add secret management;
8. add tenant/permission adversarial tests;
9. add prompt-injection and tool-exfiltration tests;
10. implement redacted AI telemetry; and
11. implement capability/provider/tool kill switches.

Payroll, employee, bank, credential, broad export, and other sensitive datasets should remain prohibited in the initial scope.

## 8. Data-quality blockers

AI analysis is only as trustworthy as its inputs. Initial read models must disclose:

- report period;
- currency;
- time zone;
- data freshness;
- excluded/incomplete records;
- exchange-rate basis;
- posting status;
- empty versus unavailable data; and
- source identifiers.

Existing uses of JavaScript `Number` for numeric database values require review before AI presents high-value financial analysis.

## 9. Localisation readiness

English can be the first internal evaluation language.

ChiShona and isiNdebele are blocked until:

- typed application catalogues exist beyond the public page;
- terminology glossaries are reviewed;
- native/domain reviewers are assigned;
- language-specific evaluation datasets exist;
- exact identifier/value preservation passes; and
- refusal and approval language passes independently.

Do not use automatic translation to claim support.

## 10. Initial permitted scope

After readiness gates pass, the first internal capability may:

- use synthetic data only;
- run on demand;
- use English only;
- retrieve a bounded business summary through structured read tools;
- identify overdue receivables and low-stock items;
- explain report figures already calculated by VAKA;
- link to source records;
- distinguish facts from recommendations; and
- remain Autonomy Level A.

It may not:

- write records;
- send messages;
- use durable memory;
- access payroll, employee, bank credentials, or broad personal data;
- run continuously;
- forecast;
- provide regulatory assurance;
- use cross-tenant indexes; or
- claim general availability.

## 11. Readiness gates

### Gate R0 — Repository baseline

- Root verification and CI exist.
- Type, build, and critical tests are reproducible.
- Test database isolation is defined.
- Known failures are recorded.

### Gate R1 — Security and governance

- Provider/privacy/security decision approved.
- Allowed data classes documented.
- Production secret fallback removed.
- Rate/cost/abuse policy approved.
- Kill-switch ownership defined.

### Gate R2 — Read model

- One bounded executive-summary contract exists.
- Exact values, periods, currencies, freshness, and source IDs are returned.
- Tenant and permission tests pass.

### Gate R3 — Evaluation

- Synthetic evaluation set exists.
- Required AI evaluation dimensions are automated or assigned to reviewers.
- Release thresholds and sample size are approved.
- Baseline non-AI output is retained for comparison.

### Gate R4 — Internal sandbox

- No production tenant data.
- Model gateway and one read tool operate behind an internal flag.
- Failure, timeout, cost, logging, and unavailable states pass.
- No write tools are registered.

## 12. Recommendation

Do not select a model or build a chat interface first.

The recommended first implementation task is:

> Define and test a provider-independent, permission-scoped `get_business_summary` read-model contract using synthetic data and existing deterministic report services.

This proves the hardest reusable boundary—authorised, exact, source-linked business context—without transmitting tenant data to a model or committing to a provider.

## 13. Implementation progress — 2026-07-05

The first read-model slice is now implemented:

- provider-independent `vaka.business_summary` contract version `1.0`;
- authenticated read-only API endpoint;
- server-derived tenant and actor context;
- existing permission checks at endpoint and section level;
- exact money and quantity strings;
- bounded receivables, inventory, and pipeline sections;
- period, currency, freshness, source, and limitation metadata;
- data-minimised audit event;
- database-free contract tests; and
- PostgreSQL synthetic tenant/permission/isolation integration tests.

The database-free contract suite passes. The PostgreSQL integration suite remains unverified in the current environment because PostgreSQL and Docker are unavailable.

Gate R2 therefore remains **partially complete**, not passed. It requires the committed PostgreSQL suite to pass in a reproducible test database and CI.

## 14. Evaluation progress — 2026-07-05

The provider-independent evaluation foundation is now implemented:

- typed scenario and candidate-output contracts;
- seven synthetic Zimbabwe-first safety and quality scenarios;
- deterministic scoring for required core dimensions;
- critical-failure aggregation that cannot average away tenant, permission, calculation, refusal, or confirmation failures;
- explicit read/draft/action tool classification;
- human-review gates for tone and language quality; and
- a database-free test command.

The initial harness tests pass. Gate R3 remains **partially complete** because the dataset is not yet statistically sufficient, native language fixtures have not received qualified review, and no CI report artifact or persisted evaluation-run record exists.

The machine-readable runner is now implemented with strict runtime validation, dataset-version enforcement, JSON/Markdown output, coverage checks, and CI-safe failure exit statuses. CI integration and artifact retention remain outstanding.

## 15. CI progress — 2026-07-05

A PostgreSQL-backed GitHub Actions quality workflow is now defined. It:

- restores server and web dependencies from lockfiles;
- creates and seeds a disposable PostgreSQL 16 database;
- type-checks the server and web;
- builds the production web application;
- runs server tests sequentially;
- verifies AI foundation tests; and
- retains JSON and Markdown evaluation evidence.

The local server and web type checks, AI foundation suite, production web build, and workflow YAML validation pass. Hosted CI remains unverified until the workflow runs on GitHub.

Gate R0 is therefore **substantially implemented but not yet passed**. It still requires a successful hosted run and resolution of migration, linting, frontend-test, and dependency-audit gaps.
