# VAKA Decision Log

**Status:** Living record
**Owner:** Product and Engineering

## 1. Purpose

Record decisions that materially affect architecture, product behavior, data, security, localisation, AI, operations, legal posture, or release risk.

Use a full ADR for complex architectural decisions and link it here.

## 2. Decision status

- **Proposed**
- **Accepted**
- **Superseded**
- **Rejected**
- **Revisit**

## 3. Log

| ID | Date | Status | Decision | Rationale | Consequences / follow-up |
|---|---|---|---|---|---|
| DEC-001 | 2026-07-04 | Accepted | Evolve the existing TypeScript modular monolith incrementally; no large rewrite without audit evidence. | Current transactional core is valuable and tested; rewrite risk is disproportionate. | Add quality baseline and modular boundaries first. |
| DEC-002 | 2026-07-04 | Accepted | PostgreSQL remains the transactional system of record. | Existing repository uses it and requires ACID, exact numeric, locking, and reporting. | Other stores require workload-specific ADR. |
| DEC-003 | 2026-07-04 | Accepted | Zimbabwe is the first country pack, not a hard-coded architectural limit. | Product needs local depth and future African expansion. | Country-specific tax/payroll/language/provider rules require explicit configuration/adapters. |
| DEC-004 | 2026-07-04 | Accepted | English fallback may ship before reviewed ChiShona/isiNdebele, but unavailable translations must be labelled honestly. | Native review is required for quality and safety. | Build locale infrastructure first; enable catalogues independently. |
| DEC-005 | 2026-07-04 | Accepted | VAKA AI begins read-only and permission-scoped. | Limits data/action risk while evaluation and governance mature. | No consequential AI action before confirmation/audit gates. |
| DEC-006 | 2026-07-04 | Accepted | Establish regression and CI baselines before major visual or functional implementation. | Existing functionality must be preserved and current gaps made visible. | Stage 1 is the first implementation stage. |
| DEC-007 | 2026-07-05 | Accepted | Separate VAKA AI capability maturity from autonomy; use autonomy levels A–E with read-only first, explicit approval for consequential action, and narrowly configured Level D automation only after evidence. | A model’s ability to formulate an action must not be mistaken for authority to execute it. | Implement policy outside the model; bind approvals to exact previews; prohibit autonomous high-impact actions; evaluate each use case, language, and autonomy level independently. |
| DEC-008 | 2026-07-05 | Accepted | Package VAKA as Starter, Growth, Business, and Enterprise tiers based on operational complexity, with server-enforced versioned entitlements and provider-backed usage allowances. | Current plans differ mainly by limits and unused JSON flags; one governed catalogue is required to keep public claims, signup, billing, and enforcement aligned. | Preserve trust/data-export controls for every plan; label unreleased capability; implement entitlement resolution before selling restrictions; define grandfathering before migration. |
| DEC-009 | 2026-07-05 | Proposed | Validate list prices of USD 19 Starter, USD 69 Growth, USD 249 Business, and Enterprise from USD 599/month, with annual discounts, implementation fees, and metered provider usage. | The prior USD 75/150 upper tiers materially underpriced advanced controls, integrations, support, security, and provider costs compared with current accounting/ERP suite benchmarks. | Run willingness-to-pay interviews and cost/margin modelling; shorten the future standard trial to 30 days; do not publish or bill revised prices until leadership approval and governed entitlement migration. |
| DEC-010 | 2026-07-05 | Proposed | Create distinct general-referral and VAKA Professional Partner programmes, with explicit client consent, versioned recurring-commission rules, and append-only payout accounting. | Accountants and advisors can become a high-trust distribution and implementation network, but referral attribution must never imply client-data access and recurring payouts must remain economically and legally controlled. | Validate 10%/12-month general referral and 20%→10%→5% professional revenue-share hypotheses; approve professional pricing, disclosures, KYC/tax, fraud, client portability, and payout controls before implementation. |

## 4. Decision template

### DEC-XXX — Title

- **Date:**
- **Status:**
- **Owner:**
- **Context:**
- **Decision:**
- **Alternatives considered:**
- **Evidence:**
- **Security/privacy impact:**
- **Tenant/permission/audit impact:**
- **Data/migration impact:**
- **Localisation/accessibility/mobile impact:**
- **AI impact:**
- **Operational/release impact:**
- **Rollback/revisit trigger:**
- **Consequences and follow-up:**
- **Related documents/changes:**

## 5. Decisions requiring entry

- architecture/service extraction;
- authentication/session design;
- database/country-pack/migration patterns;
- external providers;
- event/outbox infrastructure;
- offline sync;
- pricing/billing policy;
- AI provider/use case/action capability;
- data retention/cross-border processing;
- availability/SLA;
- launch language enablement;
- material compliance interpretation; and
- accepted quality/security exceptions.
