# VAKA OS — Master Build Plan (to Zimbabwe-complete)

**Status:** Authoritative execution catalogue
**Owner:** VAKA Architecture Office
**Last reviewed:** 2026-07-13
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
| P4-002 | Purchase requisition → RFQ → purchase order → goods receipt with approvals | P1-002 | Planned |
| P4-003 | Three-way match (PO ↔ receipt ↔ bill) before posting AP | P4-002, P2-001 | Planned |
| P4-004 | Supplier performance & spend analytics | P1-006 | Planned |

---

## 6. Programme P5 — Inventory & warehousing

| ID | Outcome | Depends on | Status |
|---|---|---|---|
| P5-001 | Product/SKU/category with multi-warehouse quantities | — | Foundation exists |
| P5-002 | Auditable stock movements (receipt/issue/transfer/adjustment), append-only | — | Foundation exists |
| P5-003 | Valuation layer (weighted-average) feeding COGS journals | P2-001 | Partial |
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

## 12. Post-launch programmes (catalogued, out of launch path)

- **PN — Business Network:** directory, marketplace, advertising, referrals, trust score, business passport.
- **PB — Black Book:** government/regulator/tender directory with AI navigation (ZIMRA, POTRAZ, RBZ, NSSA, PRAZ seeds).
- **PS — Store:** subscriptions, modules, country packs, partner apps, billing.
- **PV — Verify:** business/director/supplier verification, trust badges.
- **PC — Capital:** finance/insurance marketplace introductions.
- **PD — Documents:** contracts, versioning, e-signature, retention.
- **PW — Workflow:** low-code approvals, forms, automation.
- **PX — Developer Platform:** public APIs, SDKs, webhooks, marketplace.
- **PL — Additional country packs:** South Africa, Zambia, Botswana, Namibia, Malawi, Mozambique, Kenya, Tanzania, Nigeria, Ghana (each additive via the P2-001 engine).

Each becomes its own programme with the same mission discipline once Zimbabwe-complete ships.

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
