# VAKA Implementation Roadmap

**Status:** Controlled execution plan
**Owner:** Product and Engineering
**Last reviewed:** 2026-07-04

## 1. Operating rules

- Work proceeds in small, reviewable, reversible increments.
- Preserve the existing modular monolith unless evidence justifies a larger architectural change.
- Do not market planned capability as live.
- Every stage must pass `QUALITY-GATES.md` and `DEFINITION-OF-DONE.md`.
- Security, tenant isolation, permissions, audit, localisation, mobile behavior, accessibility, recovery, and documentation are part of implementation—not later cleanup.
- A stage may overlap another only when dependencies and rollback boundaries remain explicit.

## 2. Stage summary

| Stage | Primary outcome |
|---|---|
| 1. Foundation and repository health | Changes can be made safely and verified consistently |
| 2. Brand tokens and design system foundation | Shared accessible visual primitives exist |
| 3. Public website and homepage | Approved brand story is implemented truthfully |
| 4. Authentication and onboarding | Secure, understandable account entry and setup |
| 5. Application shell and navigation | Responsive, permission-aware product frame |
| 6. Core CRM | Reliable customer and opportunity workflows |
| 7. Finance and accounting | Trustworthy financial operations and reporting |
| 8. Inventory | Auditable stock and purchasing control |
| 9. Cross-module workflows | Business events remain consistent across modules |
| 10. VAKA AI foundation | Safe read-only intelligence platform |
| 11. English, Shona and Ndebele localisation | Reviewed multilingual product foundation |
| 12. Automation and proactive intelligence | Reliable event-driven assistance |
| 13. Security and compliance hardening | Production risks are reduced and evidenced |
| 14. Pilot readiness | Selected businesses can use VAKA with support |
| 15. Production launch | Controlled, observable Zimbabwe launch |

## 3. Stage 1 — Foundation and repository health

**Objective:** Establish a reproducible baseline that protects current functionality.

**Dependencies:** Codebase audit; existing package manifests/tests; local PostgreSQL; approved engineering ownership.

**Tasks:**

- Add root format, lint, type-check, test, build, and verification commands.
- Establish CI with isolated dependencies and test database.
- Record current frontend/backend behavior and known failures.
- Add homepage, auth-entry, and critical workflow smoke tests.
- Commit versioned migration discipline and prohibit production `db:push`.
- Add dependency, secret, and basic security scanning.
- Document environment setup and supported runtime versions.

**Acceptance criteria:**

- One documented command verifies the repository.
- CI runs on every proposed change.
- Current critical backend tests and frontend build pass.
- Test data is isolated and repeatable.
- Known failures are recorded rather than hidden.

**Tests required:** TypeScript; production builds; current critical tests; smoke tests; migration dry run; dependency/secret scans.

**Security considerations:** No secrets in CI/logs; minimum CI permissions; safe test credentials; dependency provenance.

**Localisation considerations:** Add detection for newly introduced hard-coded user-facing strings; preserve English fallback.

**AI considerations:** None shipped; reserve evaluation/test structure without selecting a provider.

**Rollback requirements:** CI/config changes are independently revertible; preserve previous local commands; no production schema/data changes.

**Commercial foundation:** Before plan-restricted modules ship, establish the
typed, versioned entitlement catalogue in `PRICING-AND-PACKAGING.md`. Public
pricing, signup, billing, enforcement, and upgrade/downgrade behavior must use
the same governed definitions.

## 4. Stage 2 — Brand tokens and design system foundation

**Objective:** Create accessible shared tokens and primitives without redesigning product behavior.

**Dependencies:** Stage 1; approved Brand Book, Colour System, Typography; logo/font decisions or documented temporary fallbacks.

**Tasks:**

- Implement semantic colour, type, spacing, radius, elevation, motion, and status tokens.
- Separate VAKA public-brand tokens from tenant white-label tokens.
- Build accessible buttons, fields, cards, badges, dialogs, tables, empty/error states, and navigation primitives.
- Add contrast, focus, reduced-motion, and responsive examples.
- Document component states and usage.

**Acceptance criteria:** Tokens map to approved documentation; primitives meet WCAG 2.2 AA targets; semantic states do not depend on colour; tenant branding cannot override security semantics.

**Tests required:** Type/build; component tests; visual regression; contrast/accessibility; mobile/tablet/desktop; 200% zoom; reduced motion.

**Security considerations:** Safe remote asset policy; no untrusted HTML/CSS injection through branding.

**Localisation considerations:** Components tolerate text expansion and all launch-language characters.

**AI considerations:** Include preview/coming-soon and AI-status patterns without live AI behavior.

**Rollback requirements:** Tokens introduced behind compatible aliases; migrate components incrementally; retain prior styles until visual parity is approved.

## 5. Stage 3 — Public website and homepage

**Objective:** Align the homepage with Specification v2.0 while preserving working signup/sign-in.

**Dependencies:** Stages 1–2; Homepage Gap Analysis; approved assets/copy; validated trial/CTA proposition.

**Tasks:**

- Establish regression screenshots/tests before restructuring.
- Consolidate the page into the approved ten-section story.
- Preserve existing auth callbacks.
- Clearly label Payroll and VAKA AI as future/preview.
- Replace ambiguous “live” demo data labels.
- Complete responsive, SEO, accessibility, fallback, and performance requirements.
- Add only real legal/resource destinations.

**Acceptance criteria:** Visitors can answer the nine success questions; CTAs work; no unsupported claims; required breakpoints have no overflow; accessibility/performance targets pass.

**Tests required:** Render/interaction; visual regression; mobile menu; CTA; FAQ; locale fallback; keyboard/screen reader; metadata/crawlability; Core Web Vitals.

**Security considerations:** Synthetic demo data only; no customer data; safe analytics; no draft legal documents presented as approved.

**Localisation considerations:** All copy in typed catalogues; English verified; Shona/Ndebele remain explicitly pending until reviewed.

**AI considerations:** Preview only; no action claims or provider calls.

**Rollback requirements:** Keep previous homepage deployable; isolate public CSS/components; feature flag or atomic revert for structural release.

## 6. Stage 4 — Authentication and onboarding

**Objective:** Provide secure account creation, login, verification, recovery, and company setup.

**Dependencies:** Stages 1–2; threat model; email/support provider; privacy/legal decisions.

**Tasks:**

- Remove production secret fallbacks.
- Design secure session/token lifecycle and revocation.
- Establish explicit tenant ownership, server-side session/device records,
  owner-only user presence, and privacy-minimised activity history.
- Add rate limits, abuse controls, email verification, password reset, invitations, and MFA for privileged users.
- Resolve tenant/subdomain login ambiguity.
- Build guided company, currency, country, and owner setup.
- Add recovery, error, and unavailable-service states.

**Acceptance criteria:** Secure end-to-end onboarding; disabled/revoked users lose access; tenant is created atomically; no account enumeration; onboarding is usable on mobile; only the explicit Owner can access company-wide session/activity controls by default; signed-in-user and active-session counts use documented presence semantics.

**Tests required:** Auth integration/E2E; abuse/rate limit; session expiry/rotation/revocation; owner-versus-admin access; signed-in-user/session counts; activity append-only/redaction; tenant isolation; atomic rollback; accessibility; responsive; locale fallback.

**Security considerations:** Highest priority—sessions, credentials, MFA, enumeration, CORS/CSRF, audit, secrets, email tokens.

**Localisation considerations:** All copy/validation externalised; locale preference captured without inferring identity.

**AI considerations:** No AI required for identity decisions; AI onboarding help, if later added, cannot access credentials.

**Rollback requirements:** Compatible session migration; staged cutover; ability to invalidate new sessions and restore prior auth path safely.

## 7. Stage 5 — Application shell and navigation

**Current evidence (2026-07-13):** P6-001 completed governed token adoption and
P6-002 completed the responsive, permission-aware tenant shell, current-user
recent notification menu, mobile account access and inert command-bar mount.
Universal Workbench, visible command/search UI, route/deep-link migration and
the full WCAG core-flow pass remain separately gated work.

**Objective:** Build a responsive, accessible, permission-aware frame for every module.

**Dependencies:** Stages 1–2 and auth context from Stage 4.

**Tasks:** Modularise shell/navigation; mobile drawer/bottom patterns; route structure; permission-aware items; tenant branding with contrast validation; global loading/error/offline states; notifications/command palette foundations.

**Acceptance criteria:** Shell works on mobile through large desktop; keyboard/focus behavior is complete; unavailable modules are labelled; readonly/suspended states remain enforced.

**Tests required:** Route/navigation; permissions; responsive visual; keyboard/screen reader; branding contrast; lifecycle states; offline/interrupted loading.

**Security considerations:** UI visibility never replaces server permissions; safe tenant branding; no sensitive data in navigation caches.

**Localisation considerations:** Navigation catalogue and text expansion; language switch does not change access.

**AI considerations:** Reserve a non-invasive AI entry point marked unavailable until Stage 10.

**Rollback requirements:** Introduce routes/shell incrementally; preserve current pages behind stable route or feature flag.

## 8. Stage 6 — Core CRM

**Current evidence (2026-07-13):** P3-003 provides the tenant-scoped customer
timeline. P3-004 adds structured customer profile maintenance, bounded atomic
bulk classification/tag actions, active-record soft removal and an audited
principal-owner deletion approval workflow. Physical privacy erasure,
owner-transfer policy, customer merge/deduplication and applying reusable bulk
controls to modules beyond Contacts and Invoices remain separately gated.

**Objective:** Deliver reliable customer, contact, opportunity, activity, and follow-up workflows.

**Dependencies:** Stages 1, 4, 5; API contracts; tenant/permission model.

**Tasks:** Typed CRM API/UI; search/pagination; customer detail; pipeline; activities/tasks; ownership; imports; duplicate handling; audit coverage; mobile workflows.

**Acceptance criteria:** Authorised users complete customer and opportunity journeys; cross-tenant access fails safely; imports are reversible/reconcilable; audit-sensitive changes are logged.

**Tests required:** Unit/API/E2E; tenant isolation; permissions; pagination/search; import; audit; responsive/accessibility; locale.

**Security considerations:** Personal data minimisation; export control; enumeration; attachments/notes if added.

**Localisation considerations:** Customer-facing terminology and formats in all catalogues.

**AI considerations:** Define safe read models/evaluation cases only; no live AI dependency.

**Rollback requirements:** Additive schema changes; import rollback; feature flags for new workflow surfaces.

## 9. Stage 7 — Finance and accounting

**Current evidence (2026-07-13):** P2-007 exposes existing invoice detail and a
transactional amendment path for unposted drafts only. Issued/paid/void history,
numbers, document snapshots and ledger evidence remain immutable; bulk posting,
payments, voiding and deletion are not enabled.

**Objective:** Harden the existing financial core and complete essential Zimbabwean SME workflows.

**Dependencies:** Stages 1, 4–6; accountant review; migration discipline.

**Tasks:** Exact-money review; currency-safe dashboard ageing; receivables/payables; credit notes; statements; bank import/reconciliation; period controls; approvals; VAT configuration/reporting; tenant-branded invoice document snapshots; secure PDF generation/download; expanded audit and idempotency. Reliable invoice delivery and customer links follow the Stage 9 event/outbox and external-access controls.

**Acceptance criteria:** Ledgers balance; historical records remain immutable; reports reconcile; multi-currency snapshots are preserved; reviewed VAT behavior is documented.

**Tests required:** Property/unit; transaction rollback; concurrency/idempotency; multi-currency; reports; tenant/permission; audit; professional test fixtures.

**Security considerations:** Segregation of duties; export sensitivity; immutable evidence; privileged corrections; financial fraud controls.

**Localisation considerations:** Exact currency/date/number formatting; translated labels never change accounting meaning.

**AI considerations:** Financial read models may be prepared; AI never performs authoritative calculations.

**Rollback requirements:** Expand/migrate/contract; backup before high-risk migration; reversal strategy; report reconciliation after rollback.

## 10. Stage 8 — Inventory

**Objective:** Complete auditable stock, warehouse, purchasing, count, and replenishment workflows.

**Dependencies:** Stages 1, 5–7; product/warehouse model; accounting integration.

**Tasks:** Transfers; counts; adjustments/approvals; reorder rules; supplier purchasing; returns; costing review; mobile stock lookup/count; barcode research; event definitions.

**Acceptance criteria:** Stock ledger and cached levels reconcile; overselling controls hold; accounting sync is atomic; every adjustment has actor/reason.

**Tests required:** Unit/integration; concurrency; oversell/rollback; transfers/counts; tenant/permission; audit; mobile/offline scenarios.

**Security considerations:** Adjustment/approval separation; warehouse scope; fraud and data-export controls.

**Localisation considerations:** Units, quantities, product terminology, and documents.

**AI considerations:** Define low-stock/purchasing read tools only.

**Rollback requirements:** Reversing movements, never deleting ledger history; additive migrations; reconcile quantities and GL.

## 11. Stage 9 — Cross-module workflows

**Objective:** Prove that customer, sale, invoice, payment, stock, purchasing, and reporting remain one consistent system.

**Dependencies:** Stages 6–8; stable domain services; outbox decision.

**Tasks:** Quotation/sale path; invoice/stock/COGS workflow; procurement/AP; atomic boundaries; idempotency; transactional outbox; correlation IDs; end-to-end audit and recovery.

**Acceptance criteria:** Required synchronous effects commit or roll back together; asynchronous effects are retryable/idempotent; source records reconcile across modules.

**Tests required:** Full trade cycle; failure injection; duplicate/out-of-order events; concurrency; tenant/permission; reconciliation; recovery.

**Security considerations:** Cross-module permission escalation; event payload minimisation; signed external webhooks.

**Localisation considerations:** Stable machine events; translated presentation only.

**AI considerations:** Tools call domain services; no direct cross-module database access.

**Rollback requirements:** Feature flags; outbox replay controls; compensating/reversal operations; documented reconciliation.

## 12. Stage 10 — VAKA AI foundation

**Objective:** Establish a safe, permission-aware, read-only AI platform.

**Dependencies:** Stages 1, 4, 6–9; AI architecture; provider/privacy/security approval.

**Tasks:** Model gateway; policy layer; tool registry; tenant-scoped read tools; prompt/version control; AI audit schema; evaluation harness; cost/rate/timeouts; unavailable-state UX; internal synthetic-data pilot.

**Acceptance criteria:** Read-only executive summary is grounded, permission-safe, auditable, bounded, and optional; core VAKA works without AI.

**Tests required:** Evaluation suite; tenant/permission leakage; prompt injection; factual/financial consistency; tone; failures; latency/cost.

**Security considerations:** Provider processing, data minimisation, cross-border transfer, secrets, retention, denial-of-wallet.

**Localisation considerations:** English first; no Shona/Ndebele release without independent native evaluation.

**AI considerations:** No consequential actions; facts/inferences/recommendations distinguished.

**Rollback requirements:** Kill switch; provider disablement; tool revocation; no authoritative data depends on generated output.

## 13. Stage 11 — English, Shona and Ndebele localisation

**Objective:** Deliver reviewed multilingual public and product experiences.

**Dependencies:** Typed English catalogues; locale architecture; native reviewers; terminology governance.

**Tasks:** Extract remaining strings; locale/provider/persistence; English approval; Shona and Ndebele translation/review; metadata, errors, documents, notifications, accessibility labels; pseudo-localisation; text-expansion QA.

**Acceptance criteria:** Key completeness; English fallback; reviewed translations; equivalent permissions/functionality; correct formats; no raw keys or hard-coded user copy.

**Tests required:** Missing-key; fallback; formatting; persistence; responsive/zoom; accessibility; native QA; document/report review.

**Security considerations:** Translation does not expose hidden data or change permission semantics; translators receive safe context.

**Localisation considerations:** This stage owns them; terminology is versioned and professionally reviewed.

**AI considerations:** Language-specific evaluations before AI support is advertised.

**Rollback requirements:** Per-locale disable/fallback to English; catalogue version rollback; never corrupt canonical stored values.

## 14. Stage 12 — Automation and proactive intelligence

**Objective:** Deliver reliable event-driven notifications, reminders, scheduled work, and proactive insight.

**Dependencies:** Stage 9 outbox/events; Stage 10 AI foundation; provider adapters; consent rules.

**Tasks:** Event catalogue; idempotent consumers; queues/retries/dead letters; notifications; dunning delivery; scheduled reports; proactive alerts; WhatsApp/email/SMS adapters; AI-generated drafts where approved.

**Acceptance criteria:** Automations are observable, retryable, tenant-safe, configurable, and do not duplicate consequential work.

**Tests required:** Outbox atomicity; duplicate/out-of-order events; provider failure; consent/opt-out; tenant scope; localisation; AI draft evaluation.

**Security considerations:** Signed webhooks, secrets, minimal payloads, abuse/rate controls, communication privacy.

**Localisation considerations:** Reviewed templates in all enabled languages; stable event values.

**AI considerations:** AI may draft/recommend; external sends/actions require human or policy-approved confirmation.

**Rollback requirements:** Per-automation kill switches; pause/replay queues; template/version rollback; reconcile side effects.

## 15. Stage 13 — Security and compliance hardening

**Objective:** Close launch-critical risks and create evidence for review.

**Dependencies:** Earlier stages; threat models; counsel/accountant/security reviewers; operational environment.

**Tasks:** Resolve audit findings; RLS/constraint decision; WAF/rate limits/CSP/CORS; MFA/admin controls; retention/deletion; incident response; vulnerability remediation; penetration test; privacy/DPA/terms approval; VAT/ZIMRA posture review.

**Acceptance criteria:** No unresolved critical/high launch risks without explicit acceptance; policies match software; evidence and owners exist.

**Tests required:** Security suites; penetration test; tenant isolation; abuse; restore drill; incident exercise; compliance evidence review.

**Security considerations:** This stage owns hardening but does not excuse deferring security in prior stages.

**Localisation considerations:** Approved legal/security content per enabled language.

**AI considerations:** Provider, threat model, evaluation, retention, and kill-switch evidence reviewed.

**Rollback requirements:** Emergency security rollback/disable procedures; credential rotation; migration recovery; incident communications.

## 16. Stage 14 — Pilot readiness

**Objective:** Operate VAKA safely with selected Zimbabwean pilot businesses.

**Dependencies:** Stages 1–13 relevant to pilot scope; support team; agreements; monitoring; migration/onboarding plan.

**Tasks:** Pilot selection/consent; synthetic rehearsal; data import; training; support runbooks; service objectives; feedback/incident flow; feature flags; backups/restore drill; availability labels.

**Acceptance criteria:** Pilot users complete agreed outcomes; support and incident owners respond; data can be exported; restore and rollback are proven.

**Tests required:** Pilot acceptance; real-device/mobile; load baseline; disaster recovery; security; accessibility; localisation for enabled languages.

**Security considerations:** Production-grade controls; least-privileged support; pilot data handling agreements.

**Localisation considerations:** Enable only reviewed locales; collect structured feedback.

**AI considerations:** AI pilot separately consented, read-only, monitored, and disableable.

**Rollback requirements:** Per-tenant feature flags; export; rollback/migration plan; safe pilot suspension without data loss.

## 17. Stage 15 — Production launch

**Objective:** Launch VAKA in Zimbabwe through a controlled, observable release.

**Dependencies:** Pilot evidence; approved launch gate; support/on-call; legal/commercial readiness; recovery proof.

**Tasks:** Go/no-go review; staged rollout; monitoring/alerts; status/support channels; backups; capacity; security sign-off; launch communications; post-launch review cadence.

**Acceptance criteria:** All launch gates pass; no misleading availability claims; on-call/support active; RPO/RTO proven; rollback owner and trigger defined.

**Tests required:** Full regression; production smoke; load; security; restore; mobile/accessibility; locale; billing; cross-module reconciliation.

**Security considerations:** Final risk acceptance, secrets/keys, admin access, incident response, monitoring.

**Localisation considerations:** Only approved languages enabled; fallback and support ready.

**AI considerations:** AI availability reflects actual approved stage and has a kill switch.

**Rollback requirements:** Documented go/no-go thresholds; progressive rollback; database compatibility; customer communication; reconciliation after rollback.

## 18. Stage governance

Every stage requires:

- named owner;
- scoped change set;
- linked decision records;
- explicit risks/dependencies;
- quality-gate evidence;
- rollback owner and tested steps;
- documentation updates; and
- approval appropriate to risk.

Stages do not become complete merely because code was merged.
