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
