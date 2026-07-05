# VAKA Constitution

**Status:** Foundational draft
**Owner:** VAKA leadership
**Last reviewed:** 2026-07-04

## 1. Purpose

This constitution defines the durable principles that govern VAKA OS. Product, design, engineering, operations, marketing, and AI agents must use it when making decisions. Where a delivery request conflicts with this constitution, the conflict must be raised rather than silently implemented.

## 2. Identity

VAKA means **“build” in Shona**.

Our tagline is:

> **The Operating System for African Business.**

Our positioning is:

> **Designed in Zimbabwe. Built for Africa.**

Zimbabwe is VAKA’s first launch market and the place from which the product learns. It is not the limit of the brand, market, architecture, or ambition. VAKA must solve real Zimbabwean business problems deeply while remaining capable of responsible expansion into other African markets.

## 3. Mission

VAKA helps African businesses build durable, well-run companies by bringing their customers, money, stock, operations, and business intelligence into one trusted system.

VAKA is not merely a collection of CRM, accounting, and inventory screens. It is an operating layer that should help a business understand what is happening, decide what to do next, and act with confidence.

## 4. Non-negotiable product commitments

VAKA must be:

- **Multi-tenant:** each organisation has a securely isolated operating environment.
- **Secure:** access is authenticated, authorised, least-privileged, and protected at the server boundary.
- **Scalable:** architecture and operating practices must support growth in tenants, users, records, modules, integrations, and markets.
- **AI-first:** AI is considered as a native capability in workflows and decision support, not added as decorative chat.
- **Mobile-responsive:** core work must remain usable on the devices and network conditions common in launch markets.
- **Localisation-ready:** language, currency, tax, dates, addresses, documents, terminology, and market rules must not be permanently hard-coded to one country.

The platform must support **English, Shona, and Ndebele**. English may be the initial interface default, but the architecture and content model must support all three as first-class product languages. Future market languages must be addable without rewriting core business logic.

## 5. Trust is a product feature

Trust, auditability, data protection, permissions, and reliability are core product features—not compliance work to postpone.

Therefore:

- Tenant data must never cross tenant boundaries.
- Financial and stock history must be auditable.
- Sensitive actions must require explicit permission and produce an audit trail.
- Corrections must preserve history through reversals or offsetting records where applicable.
- Related business effects must succeed or fail together.
- Client data must be protected, recoverable, exportable, and handled transparently.
- AI-generated output must never quietly become an authoritative financial, legal, tax, inventory, or compliance record.
- Failures must be visible, recoverable, and safe.

## 6. Outcome doctrine

Every feature must be outcome-driven, not feature-driven.

Before work begins, the owner must be able to state:

1. Who has the problem?
2. What business outcome must improve?
3. How is the problem handled today?
4. What evidence will show that the outcome improved?
5. What trust, localisation, permission, mobile, and operational risks are introduced?

Shipping a screen, endpoint, integration, or AI response is not itself an outcome.

## 7. VAKA AI

VAKA AI must help users understand, decide, and act while respecting permissions and preserving human accountability.

Its voice must be:

- professional;
- calm;
- executive;
- well-spoken;
- concise; and
- business-focused.

VAKA AI must distinguish facts from inferences, expose uncertainty, avoid invented data, and explain material recommendations. It must operate only on data and actions the current user is permitted to access. High-impact actions require clear confirmation and must be auditable.

## 8. Decision hierarchy

When priorities conflict, use this order:

1. Safety, law, data protection, and tenant isolation
2. Accounting, inventory, and audit integrity
3. Customer trust and reliable access to customer data
4. Measurable customer outcomes
5. Accessibility, mobile usability, and localisation
6. Maintainability and operational resilience
7. Delivery speed

Speed never justifies hidden risk or corrupted records.

## 9. Current-state assumptions

This constitution is based on an inspection of the repository on 2026-07-04:

- The current product is a TypeScript application with an Express/PostgreSQL backend and React/Vite frontend.
- The existing domain includes CRM, accounting, inventory, subscriptions, reporting, white-label branding, and platform administration.
- Tenant scoping, role permissions, audit logs, transaction-based workflows, append-only ledgers, USD/ZWG handling, and data export behavior already exist in the codebase.
- English is currently embedded directly in the interface and API messages.
- No complete Shona/Ndebele localisation system or user language preference was found.
- No implemented VAKA AI service, model integration, AI permission policy, or evaluation framework was found.
- Some public-page responsive styles exist, but the authenticated application is not yet demonstrably mobile-responsive throughout.
- Zimbabwe-specific rules and legal templates require review by qualified Zimbabwean accounting, tax, security, and legal professionals.

These are observations, not guarantees. They must be validated before relevant implementation work.

## 10. Change control

Changes to this constitution require an explicit decision by VAKA leadership, a documented reason, and a review of downstream product and technical documents. AI agents and individual contributors may propose amendments but must not silently redefine these principles.
