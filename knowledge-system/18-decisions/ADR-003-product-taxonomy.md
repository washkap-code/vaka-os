# ADR-003 - Canonical product taxonomy

**Status:** Accepted  
**Date:** 2026-07-11  
**Owner:** Product and Architecture

## Decision

VAKA is one operating system with the following product families:

| Product | Canonical responsibility |
|---|---|
| VAKA OS | The customer-facing operating system and master brand. |
| VAKA Platform | Shared tenant, identity, policy, data, workflow, event, document, search, notification, developer, security, and operational services. |
| VAKA ERP | Finance, CRM/sales, procurement, inventory, workforce, projects, manufacturing, maintenance, reporting, and operational modules. |
| VAKA Intelligence | Permission-aware AI, analytics, forecasting, recommendations, automation, and business-health experiences. |
| VAKA Network | Business directory, marketplace/discovery, communities, referrals, events, and governed network interactions. |
| VAKA Verify | Business, supplier, director, document, and trust verification capabilities. |
| VAKA Capital | Governed finance and insurance discovery/introduction capabilities; never an implied lender or adviser without legal approval. |
| VAKA Mail | Business email, calendars, messaging, templates, and object-linked communication. |
| VAKA Black Book | Curated public-service, regulator, statutory, tender, and business-navigation knowledge. It is not a defamatory blacklist. |
| VAKA Studio | Developer, extension, integration, workflow, template, and solution-building environment. |

“VAKA Marketplace” is a VAKA Network capability. “VAKA Store” is the governed commercial catalogue through which VAKA modules, country packs, industry packs, and approved partner extensions may be discovered and entitled; it is not a separate top-level product under the freeze.

All products share one identity and tenant boundary. Products may have separate deployment units only after an ADR demonstrates the need. No product creates a duplicate canonical Customer, Supplier, Product, Invoice, User, Organisation, or Ledger.

## Availability rule

A name in this taxonomy means the boundary is reserved. It does not mean the product is implemented or available. Public claims must use the status register.

## Rollback

Supersede with an ADR and update brand, capability, entitlement, API, migration, and customer-communication mappings.
