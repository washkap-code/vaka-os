# ADR-002 - VAKA Architecture Freeze

**Status:** Accepted  
**Effective:** 2026-07-11  
**Owner:** VAKA leadership  
**Change mechanism:** Explicit, accepted successor ADR

## Context

VAKA needs a stable product and platform vocabulary so Mission Packs can produce small, compatible changes without repeatedly reinventing the architecture. Leadership directed that the named product architecture, Platform Kernel capabilities, Knowledge System, and engineering process are constitutional until changed through an ADR.

## Decision

The following are frozen as architectural boundaries and permanent names:

### Product architecture

- VAKA OS
- VAKA Platform
- VAKA ERP
- VAKA Intelligence
- VAKA Network
- VAKA Verify
- VAKA Capital
- VAKA Mail
- VAKA Black Book
- VAKA Studio

### Platform Kernel capability families

- Identity
- Metadata
- Workflow
- Rules
- Policy
- Event Bus
- Documents
- Search
- AI Context
- Notifications
- Security
- Engineering Process

### Knowledge and delivery system

- PRDs
- Mission Packs
- ADRs
- Enterprise Data Dictionary
- Business Ontology
- Canonical Information Model
- Development Process
- `ChatGPT -> Knowledge System -> Mission Packs -> Codex -> GitHub -> Testing -> Release`

The freeze locks names, responsibilities, dependency direction, and change control. It does **not** assert that a capability is implemented, verified, certified, commercially available, or safe for production. Those states require separate evidence.

The current TypeScript/Express/PostgreSQL modular monolith remains the approved implementation baseline. The freeze does not approve a rewrite, microservice extraction, GraphQL, a particular cloud, a particular AI provider, or a provider integration. Such choices require evidence and, when material, a successor ADR.

## Invariants

- Domain modules consume shared Platform contracts; Platform code does not own ERP business outcomes.
- Atomic financial, inventory, billing, numbering, and audit effects remain synchronous transactions. Events carry durable post-commit work through an outbox; they do not replace required atomicity.
- Tenant and actor identity come from authenticated server context.
- AI uses permission-scoped tools, remains read-only first, and cannot post directly to ledgers or stock.
- Country and industry variation is additive configuration and adapters, not forks of core business logic.
- Architecture freeze changes require impact, migration, compatibility, security, data, operational, and rollback analysis.

## Consequences

Every PRD and Mission Pack must identify affected frozen capabilities and applicable invariants. Architecture-conformance checks will be introduced incrementally. Existing code is migrated behind Platform contracts one bounded call path at a time.

## Rollback

There is no silent rollback. A successor ADR must name every frozen item being changed and provide an adoption and rollback plan.
