# Book Five - Complete Capability Catalogue

**Version:** 1.0  
**Definition:** Accepted portfolio catalogue  
**Status date:** 2026-07-11

This book is the master checklist requested for every platform capability, ERP module, platform service, AI capability, country/industry pack, integration, migration utility, engineering/testing/deployment/commercial milestone, launch gate, and acceptance criterion. “Accepted” means catalogued target scope; implementation and availability remain independent.

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
