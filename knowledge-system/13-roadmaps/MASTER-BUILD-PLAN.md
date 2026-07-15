# VAKA OS — Master Build Plan (to entire completion)

**Status:** Authoritative execution catalogue
**Owner:** VAKA Architecture Office
**Last reviewed:** 2026-07-15 (Part II added: full post-launch build map; build-dark model)
**Supersedes for sequencing:** none — complements `docs/04-execution/IMPLEMENTATION-ROADMAP.md` (stages) by turning each stage into concrete, reviewable **missions**.

## 0. How to read this document

This is the single ordered list of engineering **missions** that takes VAKA OS from its current state (a working Zimbabwe ERP foundation + Platform Kernel) to a **Zimbabwe-complete, enterprise-grade launch**. Each mission:

- has an ID (`P{programme}-{nnn}`), a one-line outcome, and a dependency;
- is small enough to review in one sitting and revert in one commit;
- gets a full spec in `docs/engineering/mission-packs/<ID>/` **before** implementation;
- ends with a Completion Report and passes the quality gates in `docs/04-execution/QUALITY-GATES.md` and `DEFINITION-OF-DONE.md`.

**Governing rule (from the Constitution):** every feature attaches to existing canonical objects and shared platform services before introducing new ones. No duplicate Customer/Company/Invoice tables. No module re-implements identity, audit, notifications, search, documents, workflow, or AI.

**Non-negotiables on every mission:** tenant isolation from the verified JWT · RBAC permission check on every write · mandatory audit on money/stock/permission/lifecycle events · zod validation on every input · append-only financial history · exact integer-cents money · WCAG 2.2 AA · English-first with locale keys · no planned capability marketed as live.

---

## 1. Programme map

| Programme | Theme | Status |
|---|---|---|
| **P1** | Platform kernel & shared services | In progress (P1-001→006 and P1-008 implemented) |
| **P2** | Finance, tax & localisation (Zimbabwe) | Foundation live; hardening |
| **P3** | CRM & sales | Foundation live; P3-003 technically verified |
| **P4** | Procurement & suppliers | Partial |
| **P5** | Inventory & warehousing | Foundation live; P5-004 technically verified |
| **P6** | Application shell, navigation & workbench | Partial |
| **P7** | VAKA Mail & Communications | Planned |
| **P8** | VAKA Intelligence (AI) | Read-model foundation |
| **P9** | Security, compliance & operations hardening | Continuous |
| **P10** | Pilot & production launch (Zimbabwe) | Gate |

Programmes beyond Zimbabwe-complete (Business Network, Black Book, Store, Verify, Capital, Documents, Workflow low-code, Developer Platform, additional country packs) are catalogued in §12 as **post-launch** and are deliberately out of the launch-critical path.

---

## 2. Programme P1 — Platform kernel & shared services

Goal: every module consumes shared contracts; no duplicated infrastructure.

| ID | Outcome | Depends on | Status |
|---|---|---|---|
| P1-001 | Platform Kernel foundation (contracts, DI container, namespaces) | — | ✅ Done |
| P1-002 | Identity & Audit adapters behind kernel contracts (parity + isolation tests) | P1-001 | ✅ Done |
| P1-003 | Establish the first callable kernel audit adoption seam with row-parity and fail-closed tests | P1-002 | ✅ Implemented; full-suite verified 2026-07-12 |
| P1-004 | Notification service adapter → email + persisted in-app behind one contract; SMS/WhatsApp placeholders | P1-002 | ✅ Implemented; provider/product adoption gated |
| P1-005 | Event bus adapter: emit domain events (invoice.issued, payment.recorded, stock.moved…) from existing write paths; in-process subscribers | P1-002 | ✅ Implemented; durable delivery gated |
| P1-006 | Search service adapter over existing entities (customers, invoices, products) with tenant-scoped index | P1-002 | ✅ Technically verified internal adapter; durable/scale operations gated |
| P1-007 | Document service adapter unifying invoice PDFs + capture storage behind one contract | P1-002 | ✅ Implemented; endpoint parity and tenant isolation verified |
| P1-008 | Metadata registry seeded with canonical objects (Company, Customer, Invoice…) powering search + AI context | P1-005 | ✅ Technically verified read-only registry; AI context/value access gated |

Acceptance for P1 overall: a new module can be built using only kernel services; a lint/architecture check flags any module importing `db`/`audit()` directly once migrated.

---

## 3. Programme P2 — Finance, tax & localisation (Zimbabwe)

Goal: trustworthy, ZIMRA-aware financial operations; Zimbabwe rules configurable.

| ID | Outcome | Depends on | Status |
|---|---|---|---|
| P2-001 | Country Pack engine + Zimbabwe reference (currencies, effective-dated VAT, statutory IDs, compliance calendar) | P1-002 | ✅ Implemented and full-suite verified; professional review open |
| P2-002 | VAT treatment model (standard/zero-rated/exempt) applied at line + document level with parity tests | P2-001 | ✅ Technically verified; professional approval pending |
| P2-003 | VAT return report (period selection, output/input VAT, evidence export) | P2-002 | ✅ Technically verified preview; professional filing approval pending |
| P2-004 | Effective-dated exchange-rate register with source/date/time; reports in base currency with original-currency traceability | P2-001 | Foundation exists |
| P2-005 | Financial period close (lock posted periods; adjustments as offsetting entries only) | — | Planned |
| P2-006 | Statutory report pack (trial balance, P&L, balance sheet, aged receivables/payables) export to PDF/CSV | P2-002 | ✅ Technically verified preview; AP/legal-entity/professional gates open |
| P2-007 | Payroll foundation — PAYE (ZIMRA tables) + NSSA, effective-dated, **gated behind accountant sign-off**, never marketed live | P2-001 | Planned (post-core) |
| P2-HF-2026-07-14 | Reliable invoice-customer selection, modern entry and record-level document actions | P2-007 invoice-detail pack, P2-008, P7-001 | ✅ Implemented on repair branch; hosted DB/merge gate pending |

Every tax rate is effective-dated and configurable — never hard-coded. Accountant sign-off is a release gate for P2-002/003/006/007.

---

## 4. Programme P3 — CRM & sales

| ID | Outcome | Depends on | Status |
|---|---|---|---|
| P3-001 | Lead → opportunity → quote → sales-order pipeline with stages and audit | P1-002 | Foundation exists |
| P3-002 | Contact & company records unified with finance customer (one canonical Customer) | — | Foundation exists |
| P3-003 | Activity & communication timeline on every customer (calls, emails, invoices, payments) | P1-005 | ✅ Technically verified for manual CRM activity and financial milestones; provider history gated |
| P3-004 | Quote → invoice conversion with idempotency and document numbering | P2-001 | Foundation exists |
| P3-005 | Sales dashboard (pipeline value, follow-ups, conversion) | P1-006 | Planned |

---

## 5. Programme P4 — Procurement & suppliers

| ID | Outcome | Depends on | Status |
|---|---|---|---|
| P4-001 | Supplier records unified with finance vendor (one canonical Supplier) | — | ✅ Technically verified; production DDL hand-apply pending |
| P4-002 | Purchase requisition → RFQ → purchase order → goods receipt with approvals | P1-002 | ✅ Technically verified; production DDL hand-apply pending |
| P4-003 | Three-way match (PO ↔ receipt ↔ bill) before posting AP | P4-002, P2-001 | ✅ Technically verified; production DDL hand-apply pending |
| P4-004 | Supplier performance & spend analytics | P1-006 | Implementation complete; hosted full DB gate in progress |

---

## 6. Programme P5 — Inventory & warehousing

| ID | Outcome | Depends on | Status |
|---|---|---|---|
| P5-001 | Product/SKU/category with multi-warehouse quantities | — | Foundation + tier-governed canonical location settings implemented; hosted DB/merge gate pending |
| P5-002 | Auditable stock movements (receipt/issue/transfer/adjustment), append-only | — | Foundation exists |
| P5-003 | Valuation layer (weighted-average) feeding COGS journals | P2-001 | Implementation complete; hosted DB gate and Zimbabwean accountant sign-off pending |
| P5-004 | Reorder rules + low-stock alerts via notification service | P1-004 | ✅ Technically verified for persisted in-app alerts; durable/external delivery gated |
| P5-005 | Barcode/QR capture (mobile) into movements | P1-007 | Planned |

---

## 7. Programme P6 — Application shell, navigation & workbench

| ID | Outcome | Depends on | Status |
|---|---|---|---|
| P6-001 | Design-system tokens consumed app-wide (colour/type/space/motion/component) | — | ✅ Compatibility adoption verified; final design approval/WCAG pass remain open |
| P6-002 | Responsive, permission-aware app shell (nav, command bar, notifications, user menu) | P6-001 | Planned |
| P6-003 | Role-aware **Universal Workbench** home (approvals, cash, receivables, alerts widgets) | P6-002, P1-005 | Planned |
| P6-004 | Universal search UI (command palette) over search service | P1-006 | Planned |
| P6-005 | Accessibility pass to WCAG 2.2 AA across shell + core flows | P6-002 | Planned |

---

## 8. Programme P7 — VAKA Mail & Communications

| ID | Outcome | Depends on | Status |
|---|---|---|---|
| P7-001 | Notification delivery (email) for invoices, statements, reminders via provider adapter | P1-004 | ✅ Implemented bounded explicit-send foundation; provider operations gated |
| P7-002 | Communication timeline links every message to its business object | P1-005, P3-003 | Planned |
| P7-003 | Templates (invoice, quote, reminder) with tenant branding | P1-007 | Foundation (PDF branding) |
| P7-004 | Governed WhatsApp + secure document delivery (opt-in, consent, audit) | P7-001 | Planned |

Mailbox connect (Gmail/365/IMAP), shared mailboxes and campaigns are **post-launch** (§12).

---

## 9. Programme P8 — VAKA Intelligence (AI)

| ID | Outcome | Depends on | Status |
|---|---|---|---|
| P8-001 | Read-only business-summary read model (grounded, permission-aware) | P1-008 | Foundation exists |
| P8-002 | AI evaluation harness + safety gates (evidence, confidence, no fabrication) | P8-001 | Foundation exists |
| P8-003 | Bounded Q&A over business data with human confirmation before any action | P8-001, P1-008 | Planned |
| P8-004 | Executive daily briefing (cash, receivables, compliance deadlines) | P8-003, P2-003 | Planned |

AI never mutates ledgers, bypasses permissions, or acts without approval. Live AI is a release gate.

---

## 10. Programme P9 — Security, compliance & operations hardening

| ID | Outcome | Depends on | Status |
|---|---|---|---|
| P9-001 | Transport hardening (headers, prod CORS allowlist, rate limiting) | — | ✅ Done |
| P9-002 | Secrets management + rotation runbook; boot-time rejection of placeholders | — | Partial |
| P9-003 | Backup, disaster-recovery drill evidence; documented RPO/RTO tiers | — | Doc exists |
| P9-004 | POPIA/Cyber & Data Protection Act readiness (POTRAZ registration checklist, DPO, DPAs) | — | Doc exists |
| P9-005 | Incident-response plan + audit-log forensic queries | P9-001 | Planned |
| P9-006 | Dependency/secret/SAST scanning in CI; SBOM | — | Planned |
| P9-007 | Penetration-test checklist + fixes; tenant-isolation fuzz tests | P9-001 | Planned |

---

## 11. Programme P10 — Pilot & production launch (Zimbabwe)

| ID | Outcome | Depends on | Status |
|---|---|---|---|
| P10-001 | Pilot onboarding runbook + support process for selected businesses | P2-006, P6-003 | Gate |
| P10-002 | Observability (health, structured logs, metrics, error reporting) end-to-end | P9-001 | Planned |
| P10-003 | Production launch checklist (accountant sign-off, legal pages approved, ALLOWED_ORIGINS set, backups verified) | all above | Gate |

**Definition of Zimbabwe-complete:** P1 (kernel migrated), P2-001→006, P3-001→005, P4-001→003, P5-001→004, P6 (shell+workbench+search+a11y), P7-001→003, P8-001→002, P9-001→006, P10 — all Done and passing quality gates, with accountant and legal sign-off recorded.

---

## 12. Post-launch programmes (summary — full mission catalogue in Part II, §15–§18)

- **PN — Business Network** · **PB — Black Book** · **PS — Store** · **PV — Verify**
- **PC — Capital** · **PD — Documents** · **PW — Workflow** · **PX — Developer Platform**
- **PM — Migration Hub** · **PMOB — Mobile** · **PI18N — Languages** · **PL — Country packs**

As of 2026-07-15 these are **no longer "after launch, start later"** — they are
built immediately under the build-dark model (§15) and go live later, gate by
gate. Part II below is their authoritative mission catalogue.

---

## 13. Execution order (critical path)

```
P1-003 → P2-001 → P2-002 → P2-003        (kernel migration + Zimbabwe tax)
      ↘ P1-004 → P1-005 → P1-006 → P1-008 (shared services)
P3-003 · P4-002 · P5-003/004             (module completion, parallel)
P6-001 → P6-002 → P6-003 → P6-004 → P6-005 (experience)
P7-001 → P7-002/003                       (communications)
P8-003 → P8-004                           (intelligence)
P9-002…007                                (hardening, continuous)
P10-001 → P10-002 → P10-003               (launch)
```

P1-003, P2-001 and P2-002 are implemented foundations with green full-suite
evidence; professional review remains open where stated. P2-003 is implemented
as an internal, full-suite-verified, not-filing-ready technical report pending
qualified review. P2-006 is implemented as a reconciled posted-ledger technical
preview with CSV/PDF export; complete AP open-item accounting, canonical legal-
entity scope and professional approval remain open. P1-004 and P1-005 are implemented and verified as
internal adapter foundations. P1-006 is implemented and full-suite verified as
a bounded internal keyword-search adapter. P1-008 is implemented and
full-suite verified as a read-only canonical metadata registry; it does not
enable AI value access. P3-003 is implemented and full-suite verified for
manual CRM activity plus VAKA-recorded invoice/payment milestones; it does not
claim provider-backed omnichannel history. P5-004 is implemented and
full-suite verified for persisted in-app low-stock breach alerts; it does not
claim external or guaranteed delivery or automatic replenishment. The supplied
P2-003 → P1-006 → P1-008 → P3-003 → P5-004 sequence is complete;
cross-cutting operations work remains tracked in the permanent `OPS-*`
namespace.

P4-004 adds a live, read-only canonical report for supplier spend, completed-
delivery performance, current strict-match exceptions and reconciled GRNI/AP
source exposure. It does not create an analytics balance, financial write or
schema. Complete AP allocation, historical rejected-attempt evidence and
qualified accounting approval remain gated.

---

## 14. Phased roadmap to launch and beyond (authoritative status — 2026-07-14)

This section is the single source of truth for "what is left." It supersedes
older status prose above where they conflict. Phases run roughly in parallel but
are ordered by dependency and launch value.

### Done (foundations merged & on `main`)
Platform kernel + all shared services (P1-001…008: identity, audit,
notifications, events, search, metadata, documents). Finance/tax: P2-001/002/003/
006/007/008. CRM: P3-003/004. Procurement: P4-001/002/003. Inventory alerts:
P5-004. Experience P6 (design tokens, app shell, universal workbench, command
palette, accessibility waves, homepage modernisation). Communications delivery
P7-001/002/003. Security: MFA, password reset, refresh-token rotation, privileged
step-up, rate limiting, transport hardening. Subscription payments (Paynow,
CO-006). Admin control centre (P6-006/OPS-010). Backup/DR evidence foundation
(P9-003/OPS-011…014).

### In flight (current Codex prompt)
- **P4-004** — Supplier performance & spend analytics.
- **P5-003** — Weighted-average inventory valuation feeding COGS (finance-critical; accountant sign-off gate).
- **P2-004** — Effective-dated exchange-rate register.

### Phase A — Finish the core ERP (Zimbabwe launch scope)
- **P2-005** — Financial period close (lock posted periods; corrections as offsetting entries). *Accountant gate.*
- **P3-001 / P3-002 / P3-005** — CRM completion: pipeline, one canonical Customer across CRM+finance, sales dashboard.
- **P5-005** — Barcode/QR mobile capture into stock movements.
- **P2-007-GA** — Payroll (PAYE + NSSA), effective-dated. *Must not ship without a Zimbabwean accountant's sign-off; "Coming Soon" until then.*
- **P7-004** — Live comms providers: governed WhatsApp Business + SMS (replace placeholders); confirm live email provider config.

### Phase B — Reliability & infrastructure (pull forward; some block launch)
- **DB-SEPARATION** — move VAKA off the GENFIN-shared Supabase project to its own DB (`docs/engineering/DATABASE-SEPARATION-PLAN.md`). **Top infra item** — ends recurring production schema-drift 500s; unblocks normal migrations. *Owner + Cowork.*
- **P9-002** — Secrets management + rotation runbook.
- **P9-005** — Incident-response plan + audit-log forensic queries.
- **P9-006** — CI security scanning (dependency/secret/SAST) + SBOM.
- **P9-007** — Penetration-test checklist + tenant-isolation fuzz tests.
- **P10-002** — Observability end-to-end (health, structured logs, metrics, error reporting).

### Phase C — Intelligence (VAKA AI)
- **P8-001 / P8-002** — Read-model + evaluation/safety foundation (largely exists — confirm/complete).
- **P8-003** — Bounded, read-only, permission-aware Q&A over business data; human confirmation before any action.
- **P8-004** — Executive daily briefing (cash, receivables, compliance deadlines).
  AI never mutates ledgers or bypasses permissions; live AI is a release gate.

### Phase D — Pilot & production launch (Zimbabwe) — the gate
- **P10-001** — Pilot onboarding runbook + support process.
- **Legal pages approved** — Privacy, Terms, Data Processing (counsel sign-off).
- **Compliance readiness** — POTRAZ registration/DPO (Cyber & Data Protection Act); VAT/CoA accountant sign-off.
- **P10-003** — Production launch checklist: accountant + legal sign-off recorded, `ALLOWED_ORIGINS` set, backups/restore drill verified, observability live.
- **Definition of Zimbabwe-complete met → controlled launch.**

### Phase E — Post-launch platform programmes (see §12)
Business Network (PN), Black Book (PB), Store (PS), Verify (PV), Capital (PC),
Documents (PD), Workflow (PW), Developer Platform (PX) — each its own programme,
same mission discipline.

### Phase F — Expansion
- Native mobile apps (iOS/Android) beyond the current PWA.
- Additional country packs (PL): South Africa, Zambia, Botswana, Namibia, Malawi,
  Mozambique, Kenya, Tanzania, Nigeria, Ghana — additive via the P2-001 engine.

### Standing guardrail (until DB-SEPARATION ships)
Every schema-changing mission lists its exact additive production DDL in its
`COMPLETION.md` under a "Production migration" heading for hand-apply; production
must never take `drizzle-kit push`/`db:push` while co-located with GENFIN.

---

# PART II — Full-completion build map (authoritative from 2026-07-15)

Decision: **everything below is built immediately; it goes live later.** The
launch-critical path in Part I is unchanged and always takes priority when it
conflicts with Part II work. Payroll (P2-009) is the proven template: build the
real thing, verify it fully, ship it dark or gated, flip it live when its gate
clears.

## 15. The build-dark model (precondition for everything below)

Every Part II mission ships **default-OFF behind a per-tenant feature flag**.
The UI hides gated modules; gated APIs fail closed with `FEATURE_DISABLED`;
flag changes are platform-admin actions and audited. Nothing dark is ever
marketed as live (Constitution rule). Three gate types govern go-live:

- **T-gate (technical):** full verification per quality gates — cleared at merge.
- **P-gate (professional):** accountant / legal / content review — e.g. payroll tables, legal pages, Black Book content.
- **O-gate (operational):** live provider or owner config — e.g. email/SMS/WhatsApp provider, OAuth apps, e-signature vendor.

| ID | Outcome | Depends on |
|---|---|---|
| FLAG-001 | Tenant feature-flag service in the platform kernel: per-tenant + per-plan flags, default OFF, audited platform-admin toggles, `/me` exposes enabled flags | — |
| FLAG-002 | Gating middleware (`requireFeature("…")`) + web nav/page gating driven by `/me` flags; payroll's accountant-gate banner generalised into a reusable "preview" treatment | FLAG-001 |

**FLAG-001 is the first Part II mission — nothing else in Part II starts before it.**

## 16. Programme catalogues

### PW — Workflow (built early: many programmes depend on it)

| ID | Outcome | Depends on | Gate |
|---|---|---|---|
| PW-001 | Extract the procurement approval chain into the kernel Workflow service (one approval engine, parity tests) | P1-001 | T |
| PW-002 | Configurable approval policies (amount thresholds, role routing, segregation-of-duties checks) consumed by procurement + payroll posting | PW-001 | T |
| PW-003 | Automation rules on the event bus (notify / create task on domain events) — no financial writes, ever | P1-005 | T |
| PW-004 | Task centre: every approval/automation lands in one tenant task list (workbench widget) | PW-003 | T |

### PD — Documents

| ID | Outcome | Depends on | Gate |
|---|---|---|---|
| PD-001 | Document workspace: folders, upload, versioning, classification on the P1-007 document service | P1-007 | T |
| PD-002 | Document approvals + retention policies (Workflow-powered), attach-to-any-canonical-object | PW-001, PD-001 | T |
| PD-003 | E-signature integration behind a provider adapter | PD-002 | O (vendor) |

### PN — Business Network

| ID | Outcome | Depends on | Gate |
|---|---|---|---|
| PN-001 | Opt-in public business profile from the canonical Company (owner-controlled, nothing public by default) | FLAG-002 | T |
| PN-002 | Business directory: search, categories, locations; tenant isolation between private data and public profile | PN-001 | T + P (privacy review) |
| PN-003 | Directory enquiries → CRM leads (consent-first, audited, rate-limited) | PN-002, P3-001 | T |
| PN-004 | Reviews & testimonials with moderation queue and evidence rules | PN-002 | T + P (content policy) |
| PN-005 | Marketplace listings from canonical Products/services | PN-002, P5-001 | T |
| PN-006 | Marketplace enquiry → quote → invoice handoff through existing CRM/finance funnels | PN-005, P3-004 | T |
| PN-007 | Network referrals (extend the live referral engine across tenants) | PN-002 | T |
| PN-008 | Advertising placements: sponsored listings/search, clearly labelled, billed via PS | PN-005, PS-002 | T + P (ad policy) |
| PN-009 | Events & business groups | PN-002 | T |
| PN-010 | Trust Score v1 — evidence-based, explainable, appealable; consumes PV verification + payment behaviour | PV-002, PN-004 | T + P (fairness review) |

### PB — Black Book

| ID | Outcome | Depends on | Gate |
|---|---|---|---|
| PB-001 | Government-organisation registry schema + content governance (versioned entries, sources, review dates, owners) | FLAG-002 | T |
| PB-002 | Zimbabwe seed dataset: ZIMRA, NSSA, POTRAZ, RBZ, PRAZ, registrar, councils, courts, utilities — every entry sourced | PB-001 | P (content review) |
| PB-003 | Black Book directory UI + universal search integration | PB-002, P1-006 | T |
| PB-004 | Licence/permit knowledge: requirements, fees, processing times, official forms/links | PB-002 | P (content review) |
| PB-005 | Compliance calendar: country-pack obligations (VAT, PAYE, NSSA, QPD, annual return) → tenant reminders via notifications | PB-002, P1-004 | T |
| PB-006 | Tender hub (curated PRAZ + public tenders; manual curation first) | PB-003 | P (content ops) |
| PB-007 | AI Black Book advisor — grounded strictly in PB content, cites entries, refuses beyond sources | PB-004, P8-002 | T + AI gate |

### P7 (continued) — Mail & Communications, full hub

| ID | Outcome | Depends on | Gate |
|---|---|---|---|
| P7-005 | Live SMS + WhatsApp provider adapters behind the notification contract (consent registry enforced) | P1-004 | O (providers) + P (consent/policy) |
| P7-006 | Mailbox connect v1: IMAP/SMTP + OAuth (Gmail/Microsoft 365), read-only sync into the communication timeline | P3-003 | O (OAuth apps) |
| P7-007 | Send governed documents from the connected mailbox (invoices, statements) with delivery evidence | P7-006, P7-003 | T |
| P7-008 | Shared mailboxes with assignment, internal notes and audit | P7-006 | T |
| P7-009 | Campaign centre: consent-first bulk email with unsubscribe, suppression and per-campaign evidence | P7-007 | P (marketing/privacy law) |

### PM — Migration Hub

| ID | Outcome | Depends on | Gate |
|---|---|---|---|
| PM-001 | Generalise the imports framework into staged migrations: stage → validate → preview → commit → reconcile → rollback | existing imports | T |
| PM-002 | Accounting migration pack: opening TB, customers/suppliers, open invoices/bills, with a reconciliation report the accountant can sign | PM-001, P2-005 | T + P (accountant) |
| PM-003 | CRM + inventory + payroll migration packs | PM-002 | T |
| PM-004 | AI-assisted field mapping — suggest-only, human confirms every mapping | PM-001, P8-002 | T + AI gate |

### PV — Verify

| ID | Outcome | Depends on | Gate |
|---|---|---|---|
| PV-001 | Verification evidence vault: submitted documents, checks, expiry, renewal (on PD-001) | PD-001 | T |
| PV-002 | Business verification workflow: platform-staff review queue, badge issue/revoke, full audit | PV-001, PW-001 | T + P (verification policy) |
| PV-003 | Verified badges surfaced in directory/marketplace with evidence-backed meaning | PV-002, PN-002 | T |

### PS — Store & commercial platform

| ID | Outcome | Depends on | Gate |
|---|---|---|---|
| PS-001 | Entitlements model: plans/modules map to feature flags (FLAG-001 becomes billable) | FLAG-001, CO-006 | T |
| PS-002 | Module catalogue + self-service subscribe/unsubscribe via Paynow | PS-001 | T |
| PS-003 | Usage metering + billing for consumables (SMS, AI, storage) | PS-001 | T |
| PS-004 | Partner registry + revenue-share reporting | PS-002 | T + P (partner terms) |

### P8 (continued) — Intelligence expansion

| ID | Outcome | Depends on | Gate |
|---|---|---|---|
| P8-005 | Agent registry in the kernel: purpose, tools, permissions, evidence and audit per agent | P8-002 | T |
| P8-006 | VAKA CFO advisor: read-only finance Q&A with citations to journals/reports | P8-005, P2-006 | T + AI gate |
| P8-007 | Business Health Score v1 — explainable dimensions (cash, compliance, receivables), never a black box | P8-006 | T + P (methodology review) |
| P8-008 | Recommendation centre: actionable, dismissible, outcome-tracked | P8-007, PW-004 | T + AI gate |
| P8-009 | Mail intelligence (summarise threads, draft replies — suggest-only) | P7-006, P8-005 | T + AI gate |

### PC — Capital (last: needs Verify + Network + Intelligence)

| ID | Outcome | Depends on | Gate |
|---|---|---|---|
| PC-001 | Funding-readiness report generated from the tenant's own verified financials (consent-first) | P8-007, P2-006 | T + P (accountant) |
| PC-002 | Consented financial-pack sharing with lenders via secure expiring links (extends P7-003) | PC-001, P7-003 | T + P (legal) |
| PC-003 | Finance/insurance partner introductions — VAKA facilitates, never acts as a regulated financial institution | PC-002, PS-004 | P (legal/regulatory) |

### PX — Developer Platform

| ID | Outcome | Depends on | Gate |
|---|---|---|---|
| PX-001 | Public API v1: OAuth client-credentials, scopes, rate limits — read-only endpoints first | P9-006 | T |
| PX-002 | Signed, replayable webhooks on domain events | PX-001, P1-005 | T |
| PX-003 | Governed write APIs + public API documentation portal | PX-001 | T + P (API terms) |
| PX-004 | SDK + sandbox tenants + app certification checklist | PX-003 | T |

### PMOB — Mobile

| ID | Outcome | Depends on | Gate |
|---|---|---|---|
| PMOB-001 | PWA offline hardening: capture, stock counts, queued approvals with sync | P5-005 | T |
| PMOB-002 | Native wrappers (iOS/Android): push notifications, biometric unlock | PMOB-001 | O (store accounts) |
| PMOB-003 | Approvals-first mobile experience (approve invoice/PO/leave from notification) | PMOB-002, PW-004 | T |

### PI18N — Languages

| ID | Outcome | Depends on | Gate |
|---|---|---|---|
| PI18N-001 | Locale framework completion: every user-facing string keyed; language switcher; en-ZW baseline | P6 | T |
| PI18N-002 | Reviewed Shona (sn-ZW) translation of core flows | PI18N-001 | P (qualified translator) |
| PI18N-003 | Reviewed Ndebele (nd-ZW) translation of core flows | PI18N-001 | P (qualified translator) |

### PL — Country packs (each additive via the P2-001 engine)

Per country — one mission each for: currencies/VAT · payroll tables · banking
formats · statutory identifiers/reports · Black Book seed · compliance
calendar. Order: **ZA → ZM → BW → NA → MW → MZ → KE → TZ → NG → GH.**
Every pack carries its own P-gate (local professional review) before go-live —
the Zimbabwe payroll pattern, repeated.

## 17. Build waves (execution order for Part II)

```
Wave 0  FLAG-001 → FLAG-002                        (build-dark enablers — first)
        + Part I launch work continues in parallel and always wins conflicts
Wave 1  PW-001 → PW-002 → PW-003/004 · PD-001/002 · PN-001→003 · PB-001→003
Wave 2  PN-004→007 · PB-004→006 · P7-005→008 · PM-001/002 · PV-001→003
Wave 3  PS-001→003 · P8-005→008 · PD-003 · PM-003/004 · PX-001/002 · PI18N-001
Wave 4  PN-008→010 · PB-007 · P7-009 · PC-001→003 · PS-004 · PX-003/004
        · PMOB-001→003 · P8-009 · PI18N-002/003
Wave 5  PL country packs, one at a time, each fully gated
```

Rationale: Workflow and Documents are shared services many programmes consume
(build once, early). Network and Black Book are the highest-value dark builds
with the fewest external dependencies. Store entitlements arrive before
anything needs billing. Capital is last by design — it needs Verify, Network,
Intelligence and legal review beneath it.

## 18. Definition of ENTIRE completion

Every mission in §16 merged, verified and behind its flag; every P-gate and
O-gate either cleared (feature live) or explicitly open with an owner and a
review date; Zimbabwe fully live across all programmes; at least one
additional country pack (ZA) live end-to-end proving the localisation engine;
mobile apps published; public API v1 documented with at least one certified
external integration. At that point VAKA OS is no longer a roadmap — it is the
operating system for African business, and this file becomes a maintenance
catalogue.
