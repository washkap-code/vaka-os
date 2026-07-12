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

The overall VAKA portfolio remains an evolving product; “programme complete” never means change or assurance stops.

## 6. Global completion conditions

The initial comprehensive build reaches portfolio baseline when every frozen product has accepted architecture and executable missions; the declared Zimbabwe release passes all gates; Platform and ERP launch scope is operational; AI state is honest; migration/support/training/operations exist; and later products have approved boundaries without being marketed as live.

Security, performance, scalability, legal, tax, accounting, privacy and localisation certifications or approvals are recorded only when actually obtained.
