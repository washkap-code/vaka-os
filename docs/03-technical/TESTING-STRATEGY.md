# VAKA Testing Strategy

**Status:** Technical standard
**Owner:** Engineering and Product Quality
**Last reviewed:** 2026-07-04

## 1. Objective

Testing protects customer outcomes, tenant isolation, money, stock, payroll, data ownership, and service reliability.

Passing a build is not sufficient evidence.

## 2. Test pyramid

### Unit tests

- calculations;
- validation;
- state transitions;
- formatting;
- permissions/policy;
- country rules;
- pure UI behavior.

### Integration tests

- PostgreSQL constraints/transactions;
- repositories/services;
- API contracts;
- audit events;
- outbox/events;
- providers/adapters;
- backup/restore tooling.

### End-to-end tests

- signup/login;
- core trade cycle;
- approvals;
- mobile workflows;
- portals;
- payroll;
- localisation;
- critical administration.

Use E2E selectively for high-value journeys.

## 3. Mandatory cross-cutting suites

### Tenant isolation

For each resource:

- list/read/create/update/delete;
- indirect relationships;
- exports;
- search;
- files;
- events;
- caches;
- portals;
- AI retrieval/tools; and
- platform-admin boundaries.

### Permissions

- allowed and denied roles;
- revoked permission;
- disabled user;
- step-up/approval;
- UI state and server enforcement;
- audit events.

### Audit

- correct actor/tenant/action/entity/time;
- reason and metadata;
- failure does not create misleading success audit;
- sensitive data excluded;
- immutable access/retention behavior.

## 4. Finance, inventory, and payroll

Test:

- exact arithmetic and rounding;
- balanced journal;
- append-only history;
- reversals;
- concurrency;
- idempotency;
- exchange-rate snapshots;
- oversell prevention;
- purchase receipt/accounting sync;
- payment/receivable state;
- payroll effective dates;
- PAYE/NSSA fixtures after professional approval;
- approval/segregation;
- period close; and
- report reconciliation.

Property-based tests are encouraged for calculation invariants.

## 5. API testing

- schema validation;
- safe errors;
- authentication;
- tenant/permission scope;
- pagination/filter/sort;
- compatibility/versioning;
- idempotency;
- rate limits;
- concurrency;
- webhooks/signatures/replay;
- mobile/offline retry/conflict.

## 6. Frontend testing

- component behavior;
- loading/empty/error/retry/offline;
- permission/readonly states;
- forms and validation;
- responsive layouts;
- keyboard/focus;
- accessibility;
- localisation/text expansion;
- browser compatibility; and
- visual regression for critical screens.

## 7. Mobile

Test representative:

- small/large mobile;
- tablet;
- touch;
- orientation;
- modest Android devices;
- slow/interrupted network;
- offline queue;
- background/resume;
- duplicate submission;
- secure local storage; and
- older supported app versions.

Future native apps require device and release-channel testing.

## 8. Localisation

For English, ChiShona, and isiNdebele:

- key completeness;
- fallback;
- variables/plurals;
- dates/numbers/currencies;
- accessibility labels;
- overflow;
- documents/reports;
- permissions equivalence;
- native review.

Pseudo-localisation should expose expansion and hard-coded text before human translation.

## 9. AI

Evaluate:

- factuality;
- groundedness;
- financial consistency;
- tenant/permission leakage;
- prompt injection;
- unsafe action attempts;
- uncertainty;
- refusal;
- confirmation;
- audit;
- language/tone;
- latency/cost;
- provider failure.

Use approved synthetic/anonymised cases. Run regression evaluations for model, prompt, tool, retrieval, or policy changes.

## 10. Events and automation

- outbox atomicity;
- publish retry;
- idempotent consumer;
- duplicate/out-of-order events;
- dead-letter;
- tenant scope;
- sensitive payload minimisation;
- correlation and observability.

## 11. Security testing

- static analysis;
- dependency scanning;
- secret scanning;
- authentication abuse;
- authorisation;
- injection;
- XSS/CSRF/CORS/CSP;
- SSRF/files;
- session management;
- rate limits;
- webhook replay;
- privileged access;
- penetration tests before major milestones.

## 12. Performance and resilience

- API latency/throughput;
- database query plans;
- pool saturation;
- large tenants;
- reports;
- billing/payroll jobs;
- event lag;
- browser Core Web Vitals;
- mobile payloads;
- provider timeouts;
- graceful degradation;
- chaos/failure exercises where justified.

## 13. Backup and recovery testing

Regularly prove:

- PostgreSQL restoration;
- point-in-time recovery;
- file/object recovery;
- encrypted backup access;
- application/schema compatibility;
- tenant isolation;
- ledger balance;
- document completeness;
- RPO/RTO;
- post-restore reconciliation.

## 14. Test data

- Synthetic by default.
- No uncontrolled production copies.
- Mask authorised production-derived datasets.
- Separate tenant fixtures.
- Deterministic dates/rates/rules.
- Factories for domain states.
- Clean/isolate test databases.
- Avoid tests that depend on execution order.

## 15. CI quality gates

Every change runs relevant:

- formatting/lint;
- type check;
- unit tests;
- integration tests;
- build;
- migration validation;
- security scans;
- contract checks;
- accessibility checks;
- visual/E2E smoke;
- AI evaluation subset when affected.

High-risk releases require expanded suites and human review.

## 16. Environments

- Local tests are fast and reproducible.
- CI uses isolated ephemeral dependencies.
- Staging resembles production without production secrets/data.
- Production verification is read-only/safe unless explicitly approved.
- Feature flags/controlled rollout support high-risk changes.

## 17. Release evidence

A change is complete when:

- acceptance criteria pass;
- required suites pass;
- skipped checks are explained;
- migrations/rollback verified;
- observability in place;
- documentation updated;
- security/privacy/professional review complete where required; and
- no unverified capability is marketed as live.

## 18. Current next steps

1. Add root lint/type/test/build scripts.
2. Isolate integration-test database setup/cleanup.
3. Expand tenant-isolation coverage.
4. Add frontend component and interaction tests.
5. Add responsive/accessibility regression tests.
6. Add migration checks.
7. Add security scanning.
8. Establish performance baselines.
9. Add backup restore drills.
10. Create AI evaluation harness before AI implementation.
