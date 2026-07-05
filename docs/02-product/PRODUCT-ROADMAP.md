# VAKA Product Roadmap

**Status:** Strategic draft
**Owner:** Product and Engineering
**Last reviewed:** 2026-07-04

## 1. Product ambition

VAKA is **The Operating System for African Business**.

It is designed in Zimbabwe, launching first for Zimbabwean businesses, and architected for responsible expansion into other African countries.

Zimbabwe is the first market—not the limit of the product.

The roadmap must balance two commitments:

1. solve Zimbabwean business realities deeply; and
2. keep country-specific language, currency, tax, payroll, compliance, payments, and documents configurable.

## 2. Roadmap principles

- Prioritise customer outcomes over feature count.
- Protect trust, tenant isolation, auditability, data ownership, and reliability.
- Strengthen current CRM, accounting, and inventory foundations before broad module expansion.
- Build mobile-first and localisation-ready.
- Design for intermittent connectivity and operational failure.
- Keep AI permission-aware, explainable, and subordinate to deterministic business rules.
- Do not release payroll, tax, compliance, or regulatory claims without qualified review.
- Label roadmap, preview, beta, and production capabilities clearly.
- Preserve working application behavior through incremental delivery and migration plans.

## 3. Current baseline

Repository inspection indicates that VAKA currently has early working foundations for:

- multi-tenant companies;
- authentication and role permissions;
- CRM contacts, deals, and activities;
- double-entry accounting;
- USD and ZWG transaction workflows;
- invoices, payments, expenses, VAT records, and reports;
- products, warehouses, purchase orders, stock movements, and COGS;
- subscription billing and tenant lifecycle;
- audit logs and data export;
- white-label colours and logo fields; and
- platform administration.

These are not equivalent to production maturity. Security hardening, migrations, observability, mobile usability, localisation, user administration, and operational controls remain roadmap work.

## 4. Roadmap horizons

Dates should be assigned only after capacity, dependencies, research, and professional review are confirmed.

### Horizon 0 — Trustworthy platform baseline

**Outcome:** VAKA can be operated safely and changed confidently.

Priorities:

- production security baseline;
- tenant-isolation hardening;
- versioned database migrations;
- backup and restore testing;
- secure session and authentication lifecycle;
- user invitations, role management, and MFA for sensitive administration;
- automated build, type, test, and deployment checks;
- frontend modularisation without a rewrite;
- structured logging, metrics, tracing, and incident response;
- privacy, retention, and data-processing governance; and
- mobile/accessibility regression baselines.

Exit evidence:

- critical security gaps are closed;
- tenant-isolation tests cover all major resources;
- backup restoration is demonstrated;
- production changes are migration-controlled;
- core workflows have monitored service objectives; and
- release checks are automated.

### Horizon 1 — Zimbabwe operating core

**Outcome:** A Zimbabwean SME can run customers, money, stock, purchasing, and daily reporting from VAKA.

Priorities:

- complete CRM workflows;
- quotations and sales-order path;
- stronger receivables, statements, and credit-note workflows;
- branded invoice preview, secure PDF download, email delivery history, and
  currency-safe dashboard ageing analysis;
- bank import and reconciliation;
- inventory transfers, counts, replenishment, and costing improvements;
- procurement approvals and supplier management;
- useful management reporting and exports;
- Zimbabwe VAT configuration and reports;
- ZIMRA-ready document data and numbering;
- mobile-responsive core workflows;
- WhatsApp-friendly onboarding and support entry points;
- reliable import of existing customers, products, and opening balances; and
- English product content managed through localisation catalogues.

Exit evidence:

- core trade cycle works end to end;
- management can reconcile customer, stock, bank, and ledger records;
- Zimbabwean accounting and tax professionals have reviewed relevant behavior;
- critical mobile workflows pass acceptance testing; and
- onboarding does not require direct database intervention.

### Horizon 2 — People, payroll, and frontline operations

**Outcome:** Businesses can manage frontline selling and people operations without breaking accounting or compliance integrity.

Priorities:

- POS foundation;
- cash-up, tills, shifts, returns, and receipt workflows;
- HR employee records and role-sensitive documents;
- payroll engine;
- PAYE and NSSA configuration;
- leave, attendance, and payroll approvals;
- payroll posting to the general ledger;
- employee self-service foundations;
- offline transaction queue and reconciliation strategy; and
- expanded mobile workflows.

Dependencies:

- qualified Zimbabwean payroll/accounting review;
- security classification for employee/payroll data;
- approved retention and access policies;
- robust migrations, audit, approvals, and recovery; and
- deterministic payroll test fixtures.

Payroll must not ship as compliant or automated until statutory behavior is verified.

### Horizon 3 — Connected business network

**Outcome:** Customers, suppliers, and business teams can collaborate safely around shared records.

Priorities:

- customer portal;
- supplier portal;
- online statements, invoices, orders, and payment status;
- secure customer invoice links and downloadable branded PDFs;
- supplier quotations and procurement collaboration;
- notifications and preferences;
- email, SMS, and WhatsApp delivery adapters;
- payment-gateway integrations;
- documents and secure file exchange;
- webhooks and integration platform; and
- stronger white-label domains, messages, documents, and portal experiences.

Dependencies:

- identity and access model for external users;
- consent and communication governance;
- anti-abuse controls;
- file security; and
- reliable event/outbox processing.

### Horizon 4 — VAKA intelligence

**Outcome:** VAKA helps management understand the business and act on priorities.

Begin with:

- read-only executive summary;
- overdue receivables explanation;
- stock-risk summary;
- sales pipeline attention list;
- plain-language report explanation; and
- grounded suggested next actions.

Progression:

1. **Ask**
2. **Understand**
3. **Recommend**
4. **Act with confirmation**

Dependencies:

- approved AI provider and data-processing terms;
- permission-aware retrieval and tools;
- prompt and model versioning;
- AI audit records;
- evaluation suites;
- prompt-injection controls;
- cost, rate, timeout, and failure controls;
- human confirmation for consequential actions; and
- English, ChiShona, and isiNdebele quality review.

### Horizon 5 — Multi-country African platform

**Outcome:** VAKA can enter a new African country through configuration and market modules rather than rewriting the core.

Priorities:

- country capability framework;
- currency and exchange-rate configuration;
- country chart-of-accounts templates;
- tax engines and statutory packs;
- payroll rule packs;
- language and terminology catalogues;
- address, phone, date, and document formats;
- payment and banking adapters;
- fiscalisation/e-invoicing adapters;
- data-residency and privacy configurations;
- country-specific onboarding; and
- regional support and partner operations.

Every country launch requires research, professional validation, pilot evidence, and an explicit go-live checklist.

## 5. Module sequencing

| Module | Current state | Roadmap priority |
|---|---|---|
| CRM | Early working core | Deepen in Horizon 1 |
| Finance / Accounting | Strong early core | Harden and complete in Horizons 0–1 |
| Inventory | Strong early core | Deepen in Horizon 1 |
| Procurement | Early purchase-order core | Expand in Horizons 1 and 3 |
| Reporting | Early ledger-derived reports | Expand in Horizons 1 and 4 |
| Admin | Partial platform administration | Harden in Horizon 0 |
| Settings | Partial branding/company settings | Expand in Horizons 0–1 |
| White-label branding | Partial | Expand in Horizon 3 |
| POS | Not implemented | Horizon 2 |
| HR | Not implemented | Horizon 2 |
| Payroll | Not implemented | Horizon 2 after professional review |
| Compliance | Partial foundations | Cross-cutting; Horizons 0–2 |
| Customer Portal | Not implemented | Horizon 3 |
| Supplier Portal | Not implemented | Horizon 3 |
| VAKA AI | Product direction only | Horizon 4 after platform dependencies |

## 6. Cross-cutting programmes

The following are not optional side projects:

- security and data protection;
- tenant isolation;
- auditability;
- mobile-first design;
- offline resilience;
- localisation;
- accessibility;
- observability;
- migration and backup discipline;
- support operations;
- import/export;
- performance and scalability; and
- professional legal, tax, accounting, payroll, and regulatory review.

## 7. Prioritisation framework

Score roadmap work against:

1. customer outcome;
2. Zimbabwe launch importance;
3. trust and risk reduction;
4. number of modules enabled;
5. operational readiness;
6. mobile/offline value;
7. localisation impact;
8. evidence and customer demand;
9. implementation and migration complexity; and
10. readiness for future markets.

Features with high regulatory risk and weak validation should not outrank platform safety or proven customer needs.

## 8. Roadmap governance

For each roadmap item, record:

- target customer and job;
- measurable outcome;
- current workaround;
- availability state;
- dependencies;
- permissions and audit events;
- data classification;
- mobile and offline behavior;
- localisation and country behavior;
- failure and recovery behavior;
- professional review;
- rollout and rollback; and
- evidence required to move from preview to production.

The roadmap must be reviewed as evidence changes. It is not a promise of dates or availability.
