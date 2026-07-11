# Architecture Freeze Register

**Status:** Active  
**Authority:** `knowledge-system/18-decisions/ADR-002-architecture-freeze.md`

| Freeze domain | Frozen boundary | Change control |
|---|---|---|
| Product | VAKA OS, Platform, ERP, Intelligence, Network, Verify, Capital, Mail, Black Book, Studio | Leadership-approved successor ADR |
| Kernel | Identity, Metadata, Workflow, Rules, Policy, Event Bus, Documents, Search, AI Context, Notifications, Security, Engineering Process | Architecture ADR and migration/rollback |
| Knowledge | PRDs, Mission Packs, ADRs, Enterprise Data Dictionary, Business Ontology, Canonical Information Model, Development Process | Governance ADR |
| Delivery | ChatGPT -> Knowledge System -> Mission Packs -> Codex -> GitHub -> Testing -> Release | Engineering governance ADR |
| Tenancy | Server-derived tenant and permission scope for every tenant-owned path | Constitutional change plus security review |
| Finance | Immutable posted history, double entry, exact arithmetic, approved posting services, reversal-only correction | Finance authority and professional review |
| Inventory | Append-only stock movements, oversell refusal, atomic linked effects | Domain and architecture review |
| AI | Permission-scoped, read-only first, deterministic controls, confirmation and audit for consequence | AI Governance and domain approval |

## Freeze interpretation

Frozen means a durable architectural contract. It does not freeze defects, stop incremental improvement, force every target capability into one release, or select unproven implementation technology. It also does not convert planned products into current functionality.

## Exception process

An exception request must state the affected frozen item, customer outcome, evidence, alternatives, tenant/security/data/finance impact, compatibility and migration plan, operational cost, rollout, rollback, and decision owner. Time-limited exceptions include an expiry and remediation mission.
