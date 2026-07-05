# VAKA AI Implementation Roadmap

**Status:** Controlled implementation plan — no AI implemented
**Owner:** Product, Engineering, Security, Data Protection, and Localisation
**Last reviewed:** 2026-07-05

## 1. Objective

Implement VAKA AI incrementally as a safe business operating layer, beginning with provider-independent read models and internal synthetic-data evaluation.

This roadmap does not authorise implementation by itself. Each phase requires readiness, approval, evaluation, rollback, and release evidence.

## 2. Operating rules

- Core VAKA must work when AI is unavailable.
- Read-only comes before drafts; drafts come before actions.
- No workflow begins at pre-authorised autonomy.
- Tenant and permission checks remain outside the model.
- Models never receive raw SQL or unrestricted application access.
- Deterministic domain services remain authoritative.
- Every language, tool, provider, and autonomy increase is evaluated independently.
- Public claims remain “concept preview” until production release gates pass.
- Production tenant data is not used in early development.

## 3. Phase summary

| Phase | Outcome | Maximum autonomy |
|---|---|---|
| 0. Prerequisites | Repository and security baseline can support controlled AI work | None |
| 1. Governance and contracts | Policy, data, provider, and evaluation decisions are explicit | None |
| 2. Permission-scoped read models | AI-ready context exists without a model | A |
| 3. Evaluation harness | Quality and safety are measurable | A |
| 4. Model gateway sandbox | One provider-independent model path works on synthetic data | A |
| 5. Internal Assistant | Authorised product and record questions work internally | A |
| 6. Internal Analyst | Grounded business summaries and explanations work internally | A |
| 7. Tenant read-only pilot | Selected tenants receive bounded read-only insights | A |
| 8. Draft capability | AI prepares editable work without execution | B |
| 9. Confirmed low-risk actions | Narrow actions execute after exact approval | C |
| 10. Multilingual enablement | Reviewed ChiShona and isiNdebele capabilities launch independently | A–C per use case |
| 11. Proactive intelligence | Scheduled and event-triggered read-only intelligence | A/B |
| 12. Pre-authorised automation | Evidence-backed low-risk workflows run within strict limits | D |

## 4. Phase 0 — Prerequisites

**Objective:** Complete the minimum repository, security, and module foundations required for AI development.

**Dependencies:** Execution Roadmap Stages 1, 4, and stable read portions of Stages 6–9.

**Tasks:**

- Add root type, lint, test, build, and verification commands.
- Establish CI and isolated test data.
- Remove unsafe production secret fallbacks.
- Add authentication abuse/rate controls.
- Define correlation IDs and structured redacted logging.
- Stabilise typed report/read contracts.
- Document exact-money handling risks.

**Acceptance criteria:**

- Reproducible verification passes.
- No known production secret fallback remains.
- Tenant and permission fixtures are available.
- AI work can be feature-flagged and disabled centrally.

**Tests:** Repository checks; auth; tenant isolation; permissions; report reconciliation; secret/dependency scans.

**Rollback:** No production behaviour changes are coupled to AI.

## 5. Phase 1 — Governance and contracts

**Objective:** Decide what VAKA may process, with whom, and under which controls.

**Tasks:**

- Approve initial use case and prohibited scope.
- Define AI-specific permissions.
- Classify allowed data fields.
- Complete provider security/privacy/legal assessment.
- Decide processing region, retention, training, subprocessors, and exit plan.
- Define model/prompt/tool version policy.
- Define audit event taxonomy.
- Approve initial evaluation thresholds and reviewers.
- Record decisions in the Decision Log.

**Acceptance criteria:**

- One approved provider sandbox exists or the phase remains blocked.
- No production tenant data is authorised yet.
- Allowed/prohibited data and incident owner are documented.
- Cost, rate, timeout, and kill-switch policies are approved.

**Tests:** Policy-table tests and configuration validation.

**Rollback:** Provider integration can be removed without module changes.

## 6. Phase 2 — Permission-scoped read models

**Objective:** Produce exact, bounded, source-linked business context without using an LLM.

**Initial contract:** `get_business_summary`

It should return:

- period and time zone;
- base and transaction currencies;
- sales/receipt summary;
- overdue receivables;
- low-stock attention items;
- pipeline attention where authorised;
- data freshness and completeness;
- source record/report references; and
- explicit unavailable sections.

**Tasks:**

- Define typed request/response schemas.
- Derive tenant and actor server-side.
- Map required permission per section.
- Use deterministic services for values.
- Bound date range, item count, and result size.
- Add exact currency/value representations.
- Add source and freshness metadata.
- Add safe stable errors.

**Acceptance criteria:**

- No model/provider dependency.
- Cross-tenant and denied-permission tests pass.
- Values reconcile with existing reports.
- Missing data is distinguishable from zero.

**Tests:** Unit, integration, tenant, permission, exactness, bounds, stale/incomplete data, suspended tenant.

**Rollback:** Additive internal read contract behind a flag.

## 7. Phase 3 — Evaluation harness

**Objective:** Make AI quality and safety measurable before model integration.

**Tasks:**

- Create synthetic Zimbabwe-first business fixtures.
- Encode expected facts, calculations, sources, permissions, and refusals.
- Build scoring for every mandatory evaluation dimension.
- Add adversarial tenant, injection, and approval cases.
- Add prompt/model/tool version metadata.
- Define human and native-review workflows.
- Produce a baseline release-report template.

**Acceptance criteria:**

- Dataset contains ordinary, edge, missing, contradictory, and attack cases.
- Deterministic metrics run in CI.
- Critical dimensions fail closed.
- No real tenant data is required.

**Tests:** Harness self-tests; dataset validation; scorer consistency; secret/PII scan.

**Rollback:** Evaluation code is isolated from production runtime.

## 8. Phase 4 — Model gateway sandbox

**Objective:** Connect one approved model through a provider-neutral boundary using synthetic data only.

**Tasks:**

- Implement provider-neutral request/response interface.
- Add model allow-list and configuration validation.
- Add prompt and policy versioning.
- Enforce token, cost, rate, and timeout budgets.
- Add circuit breaker and cancellation.
- Redact telemetry.
- Implement central kill switch.
- Return explicit unavailable/failure states.

**Acceptance criteria:**

- Provider credentials remain server-side.
- Synthetic requests are observable and bounded.
- Provider outage does not affect core VAKA.
- Changing provider requires a gateway adapter and renewed evaluation.

**Tests:** Timeout, retry, circuit breaker, rate/cost, config, redaction, provider errors, kill switch.

**Rollback:** Disable flag/credentials and remove adapter; no tenant workflow dependency.

## 9. Phase 5 — Internal Assistant

**Objective:** Answer approved product and authorised-record questions for internal evaluators.

**Scope:**

- product guidance;
- bounded customer/invoice lookup;
- report navigation;
- source-linked summaries; and
- permission-safe refusal.

**Maximum autonomy:** A.

**Acceptance criteria:**

- No write tools exist.
- Every tenant fact comes from an approved tool.
- Sources are visible.
- Permission/tenant compliance is 100% in the evaluation set.
- False action-completion claims are zero.

**Tests:** Evaluation suite; prompt injection; no-answer; inaccessible records; language fixed to English.

**Rollback:** Internal flag and kill switch.

## 10. Phase 6 — Internal Analyst

**Objective:** Produce grounded, commercially useful on-demand analysis.

**Initial use cases:**

- executive business summary;
- overdue receivables attention;
- low-stock attention;
- profit-and-loss explanation.

**Maximum autonomy:** A.

**Tasks:**

- Add structured response schema separating fact, calculation, inference, and recommendation.
- Add coverage/freshness warnings.
- Add deterministic comparison calculations.
- Link recommendations to source evidence.
- Exclude forecasting until data/method approval.

**Acceptance criteria:**

- Factual and tool-use thresholds pass.
- Calculations are exact or the AI abstains.
- Tone/concision meet the VAKA rubric.
- Analysts can reproduce every material finding.

**Rollback:** Disable individual use cases independently.

## 11. Phase 7 — Tenant read-only pilot

**Objective:** Validate usefulness and safety with selected Zimbabwean tenants.

**Entry requirements:**

- internal evaluation passed;
- provider approval covers pilot data;
- tenant opt-in and pilot terms approved;
- support and incident runbooks exist;
- monitoring and kill switches tested.

**Scope:**

- on-demand only;
- English only;
- Level A only;
- selected modules/roles;
- no payroll, bank credentials, HR, or sensitive exports.

**Acceptance criteria:**

- No tenant/permission failures.
- User corrections and usefulness are measured.
- Costs and latency remain within limits.
- Core workflows remain available without AI.

**Rollback:** Per-tenant and global disable; provider data deletion/reconciliation procedure.

## 12. Phase 8 — Draft capability

**Objective:** Prepare editable work without authoritative execution.

**Candidate order:**

1. internal task draft;
2. payment-reminder draft;
3. report draft;
4. purchase-order draft;
5. invoice draft only after domain validation is complete.

**Maximum autonomy:** B.

**Acceptance criteria:**

- Drafts are visibly non-authoritative.
- Deterministic validation runs.
- Users can edit/reject.
- No external send or financial posting occurs.
- Provenance and corrections are evaluated.

**Rollback:** Disable each draft tool; drafts remain ordinary user-owned records only if explicitly saved.

## 13. Phase 9 — Confirmed low-risk actions

**Objective:** Execute a narrow action after exact, fresh approval.

**First candidate:** create an internal task from an approved draft.

**Maximum autonomy:** C.

**Entry requirements:**

- bound approval service exists;
- step-up/dual control decisions complete;
- idempotency and stale-record handling pass;
- reconciliation and audit are operational.

**Acceptance criteria:**

- Permission and approval controls pass 100%.
- Changed previews require new approval.
- Duplicate execution is prevented.
- Actual outcomes are reported accurately.

**Rollback:** Disable action tool; reconcile in-flight requests; ordinary manual workflow remains.

## 14. Phase 10 — Multilingual enablement

**Objective:** Enable reviewed language experiences independently.

**Order:** English production baseline, then ChiShona and isiNdebele according to review readiness—not presumed preference.

**Tasks:**

- Version terminology glossaries.
- Build native evaluation sets.
- Test exact identifiers, financial values, refusal, and approval.
- Test language switching and code-switching.
- Add visible fallback.

**Acceptance criteria:**

- Each language independently meets the full release thresholds.
- Native and domain reviewers approve high-impact terminology.
- Language choice never changes access or autonomy.

**Rollback:** Disable one language without disabling the use case in approved languages.

## 15. Phase 11 — Proactive intelligence

**Objective:** Deliver scheduled and event-triggered read-only intelligence.

**Dependencies:** Durable jobs/events, notification system, user preferences, deduplication, quiet hours, and monitoring.

**Maximum autonomy:** A/B.

**Order:**

1. user-requested morning briefing;
2. scheduled digest;
3. deterministic event-triggered attention;
4. role-aware prioritisation;
5. draft actions.

**Acceptance criteria:**

- Precision, missed-event, and fatigue metrics pass.
- Notifications minimise sensitive content.
- Every insight is permission-scoped at delivery time.
- Delivery is never treated as approval.

**Rollback:** Pause schedule/category/tenant/channel; no authoritative data changes.

## 16. Phase 12 — Pre-authorised automation

**Objective:** Permit only proven, low-risk workflows within explicit tenant-configured limits.

**Maximum autonomy:** D.

**Entry requirements:**

- substantial production evidence at B/C;
- accepted decision;
- administrator configuration and revocation;
- limits, expiry, notifications, audit, and kill switch;
- incident simulations; and
- legal/security/privacy approval.

**Potential first workflow:** create an internal follow-up task when a deterministic overdue threshold is crossed.

Financial release, payroll finalisation, permission changes, bank-detail changes, tax submissions, destructive actions, and other Level E actions remain prohibited.

## 17. Cross-phase evidence

Every phase reports:

- changed components;
- enabled tenant/role/language scope;
- data classifications used;
- test and evaluation results;
- factual, tool, permission, tenant, tone, refusal, and hallucination metrics;
- cost and latency;
- known limitations;
- incidents;
- rollback test; and
- next promotion decision.

## 18. Recommended first implementation task

Create a technical contract and automated integration tests for a provider-independent `get_business_summary` read model using synthetic tenant data.

Do not call a model yet. This first task should prove:

- tenant derivation;
- section-level permissions;
- exact values;
- source links;
- period/currency/freshness metadata;
- bounded output;
- missing-data behaviour; and
- cross-tenant denial.
