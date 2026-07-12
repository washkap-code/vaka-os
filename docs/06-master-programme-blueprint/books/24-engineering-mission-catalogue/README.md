# Book Twenty-Four - Engineering Mission Catalogue

**Version:** 1.0  
**Definition:** Accepted mission namespace and full capability backlog  
**Execution rule:** No implementation without a detailed approved Mission Pack

## 1. Mission law

One mission is a bounded, independently testable, reviewable and reversible change. One mission normally maps to one PR, review, merge and Completion Report. IDs are permanent and never reused. One engineering day is preferred; work expected to exceed three days is decomposed or receives an explicit exception.

Each row below is a catalogue allocation, not automatically implementation-ready. A detailed pack must contain repository reconnaissance, outcome, scope, dependencies, allowed/forbidden changes, security/data/domain impacts, steps, tests, migration/rollout/rollback, acceptance and DoD.

## 2. Existing committed IDs

| ID | Mission | Evidence status on 2026-07-11 |
|---|---|---|
| P1-001 | Platform Kernel Foundation | Implemented and previously verified |
| P1-002 | Identity and Audit adapters | Implemented; Completion Report present |
| P1-003 | Kernel-backed audit facade adoption seam | Implemented; isolated suite passed after test-flake fix; mission status reconciliation required |
| P2-001 | Country Pack engine and Zimbabwe reference | Implemented foundation; isolated tests passed; professional review still required |

Existing IDs in `knowledge-system/13-roadmaps/MASTER-BUILD-PLAN.md` remain reserved even where the detailed pack is not written.

## 3. Engineering and governance missions

| Range | Allocated missions |
|---|---|
| P0-001..006 | repository/owner baseline; document authority; Architecture Freeze; ontology/CIM/dictionary baseline; requirement traceability; documentation validation |
| P0-007..012 | Mission Pack/Completion schemas; branch/review protection; lint/format baseline; CI database migrations; dependency/secret/SAST/SBOM; artifact/provenance retention |
| P0-013..018 | frontend test harness; E2E harness; coverage policy; architecture conformance; release evidence automation; engineering metrics |

## 4. Platform missions

| Range | Allocated missions |
|---|---|
| P1-004..008 | notification adapter; durable event/outbox; tenant-safe search; unified documents; canonical metadata seed |
| P1-009..014 | configuration/secrets provider; health/readiness; audit catalogue/search/export; job/scheduler foundation; internal notifications; provider routing/retry |
| P1-015..020 | document encryption/versions/scanning/retention; search indexing/rebuild; workflow definitions/instances; rule expression sandbox; policy decisions; reporting contracts |
| P1-021..026 | AI Context service; prompt/tool registries; observability/correlation; metrics/tracing/alerts; developer API/versioning; webhook platform |
| P1-027..032 | SDK/CLI foundations; plugin/sandbox boundary; Platform Admin operations APIs; tenant support grants; cache isolation; Platform penetration/performance gates |

## 5. Finance and Zimbabwe missions

| Range | Allocated missions |
|---|---|
| P2-002..007 | VAT treatments; VAT return; FX register; period close; statutory reports; gated payroll foundation |
| P2-008..013 | legal-entity/fiscal-period model; accounting-event/posting contracts; chart/account governance; journals/adjustments/reversals; AR credit/debit notes; receipt allocation/unapplied cash |
| P2-014..019 | AP bills/match/posting; payments/approvals; bank reconciliation close; expenses/approvals; budgets/forecasts; fixed assets |
| P2-020..025 | cash flow; treasury; consolidation prerequisites; finance report reconciliation; finance audit/export; close management |
| P2-026..031 | Zimbabwe fiscalisation research/adapter; statutory ID/documents; PAYE/NSSA professional fixtures; tax/calendar updates; finance AI read models; finance GA assurance |

## 6. CRM, sales and customer operations missions

| Range | Allocated missions |
|---|---|
| P3-001..005 | pipeline foundation; canonical customer; activity timeline; quote-to-invoice; sales dashboard |
| P3-006..011 | leads/qualification; quotes/versioning/approval; sales orders; price books/discount policy; fulfilment/returns; customer statements/portal |
| P3-012..017 | consent/preferences; campaigns; tasks/meetings; import/deduplication; customer analytics; CRM AI evaluation |

## 7. Procurement and inventory missions

| Range | Allocated missions |
|---|---|
| P4-001..004 | canonical supplier; requisition/RFQ/PO/receipt; three-way match; supplier analytics |
| P4-005..010 | supplier onboarding/verification; approvals/delegation; PO changes/cancel; returns; contracts; supplier portal |
| P4-011..014 | spend/category analytics; procurement AI; source-to-pay reconciliation; procurement GA gate |
| P5-001..005 | products/warehouses; append-only movements; valuation/COGS; reorder alerts; barcode/QR mobile |
| P5-006..012 | locations/bins; reservations/availability; batches/lots/serials/expiry; stock counts; transfers; receiving/picking/packing; returns |
| P5-013..017 | landed cost; replenishment; inventory analytics/AI; reconciliation/performance; WMS GA gate |

## 8. Experience, communications and intelligence missions

| Range | Allocated missions |
|---|---|
| P6-001..005 | design tokens; responsive permission shell; Universal Workbench; search UI; WCAG core-flow pass |
| P6-006..011 | localisation runtime/catalogues; English externalization; Shona review/enablement; Ndebele review/enablement; offline/interruption states; visual/E2E regression |
| P7-001..004 | email delivery; communication timeline; branded templates; governed WhatsApp/document delivery |
| P7-005..011 | mailbox contract; provider connection/sync; shared mailboxes; calendar/tasks; internal messaging; campaigns/consent; AI Mail evaluation |
| P8-001..004 | business-summary read model; evaluation harness; bounded Q&A; executive briefing |
| P8-005..011 | evidence/citations; model/provider gateway; policy/kill switch; natural-language reports; recommendations; action preview/confirmation; multilingual AI gates |
| P8-012..017 | finance/CRM/procurement/inventory/projects assistants; anomaly/forecasting; AI operations/cost; production pilot gate |

## 9. Security, operations and launch missions

| Range | Allocated missions |
|---|---|
| P9-001..007 | transport hardening; secrets; backup/DR evidence; privacy readiness; incident response; CI scans/SBOM; penetration/tenant fuzzing |
| P9-008..014 | MFA/step-up; OAuth/SSO/API keys; session/refresh rotation; support-access controls; retention/legal hold; vulnerability management; security training/exercises |
| P9-015..020 | SLO/alerts; capacity/load/soak; provider resilience; database/query/performance; restore/DR drill; operations readiness review |
| P10-001..003 | pilot onboarding/support; end-to-end observability; Zimbabwe production launch checklist |
| P10-004..009 | migration rehearsal; UAT/professional sign-offs; security go/no-go; commercial/support go/no-go; staged deployment/rollback; post-launch observation/outcome review |

## 10. Workforce, projects, manufacturing and maintenance missions

| Range | Allocated missions |
|---|---|
| PH-001..008 | worker/organisation model; recruitment/onboarding; leave; attendance/time; payroll architecture; payroll engine/approval; performance; learning/self-service |
| PH-009..012 | privacy/retention; HR reporting; AI HR evaluation; country/professional GA gate |
| PJ-001..008 | project/work breakdown; tasks/dependencies; resources; timesheets/expenses; budgets/forecast; procurement/stock; billing/revenue; portfolio/risk |
| PJ-009..011 | documents/collaboration; AI project manager; project GA gate |
| PM-001..009 | items/BOM; routing/work centres; planning; work orders; material issue/return; output/scrap; quality/traceability; costing/journals; manufacturing analytics/AI |
| PMT-001..007 | equipment; maintenance plans; requests/work orders; labour/spares; inspections/failure; mobile execution; maintenance analytics/GA |

## 11. Ecosystem product missions

| Range | Allocated missions |
|---|---|
| PN-001..010 | public business profile; directory/search; marketplace/offers; supplier/tender discovery; communities/groups; events; referrals; testimonials; moderation/appeals; AI matching/network pilot |
| PB-001..007 | Black Book source model; institution directory; processes/forms; compliance calendar; tender navigation; multilingual/AI guide; provenance/review/launch |
| PV-001..008 | Verify consent/case; business/source adapters; people/representative checks; document evidence; expiry/recheck; status/badges; disputes; legal/security pilot |
| PC-001..009 | Capital legal model; readiness profile; product catalogue; consented application; provider referrals; offer comparison; status/documents; AI explanation/fairness; regulated pilot |
| PS-001..006 | Store catalogue; entitlements/install; partner onboarding/security; billing/revenue share; update/revoke; Store GA |
| PST-001..010 | Studio API portal; webhook console; SDK; CLI; extension manifest; sandbox; workflow/form/template builders; plugin review; marketplace publishing; Studio GA |

## 12. Country, industry, migration and customer-success missions

| Range | Allocated missions |
|---|---|
| PL-001..010 | South Africa; Zambia; Botswana; Namibia; Malawi; Mozambique; Kenya; Tanzania; Nigeria; Ghana packs - each expands into research, implementation, professional review, fixtures, pilot and GA sub-missions before execution |
| PI-001..010 | retail/wholesale; professional services; construction; manufacturing; agriculture; hospitality; logistics; healthcare; education; nonprofit packs - each requires customer research and country compatibility |
| MIG-001..012 | assessment; mapping engine; chart/accounts; parties; products; opening stock; opening balances/open items; bank/history; documents; dry-run/exceptions; cutover/rollback; reconciliation/evidence |
| CS-001..010 | onboarding readiness; guided setup; migration management; role training; Academy/knowledge; support service desk; secure support grants; adoption/health; renewal/change; offboarding/export |

## 13. Commercial and operations missions

| Range | Allocated missions |
|---|---|
| CO-001..010 | product catalogue; entitlement resolver; pricing approval/versioning; quote/contract; recurring/usage billing; tax/payment reconciliation; dunning/suspend-escrow; upgrades/downgrades; referrals/partners; commercial analytics/readiness |
| OPS-001..010 | service catalogue/ownership; operations dashboards; incident/status; problem/known errors; change/release; backup/restore; DR; capacity/cost; provider operations; Super Admin/User Guide readiness |

## 14. Universal mission acceptance

Every implemented mission must show: controlling authority and outcome; repository reconnaissance; bounded change; TypeScript/static checks; applicable unit/integration/contract/domain tests; tenant/permission/audit; data/migration/invariant; security/privacy; mobile/accessibility/localisation; AI gate; documentation; observability; rollout/rollback; Completion Report; and status-register update. Skipped or environment-blocked checks remain explicit.

## 15. Immediate verified sequence

1. Reconcile P1-003 and P2-001 Completion Reports/status after exact tests.
2. P1-004 unified Notification adapter mission pack and implementation.
3. P1-005 durable event/outbox design ADR and additive implementation.
4. P1-006 tenant-safe Search adapter.
5. P1-007 unified Document adapter.
6. P1-008 canonical Metadata seed.
7. Parallel approved P2 hardening, Super Admin foundations, CI/security and UX missions only after their dependencies/packs are ready.
