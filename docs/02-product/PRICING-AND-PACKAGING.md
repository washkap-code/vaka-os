# VAKA Pricing and Packaging

**Status:** Recommended commercial model; leadership validation and entitlement implementation pending

**Owner:** Product, Commercial, Finance, and Engineering
**Last reviewed:** 2026-07-05

## 1. Packaging principle

VAKA packages should reflect increasing operational complexity:

1. **Starter — Run the essentials**
2. **Growth — Coordinate a growing team**
3. **Business — Control connected operations**
4. **Enterprise — Govern a complex organisation**

Plans must not weaken tenant isolation, encryption, backups, data ownership,
essential permissions, audit integrity, accessibility, or customer export
rights. Trust is not a premium add-on.

Recommended prices below are list-price hypotheses for validation. They exclude
applicable taxes, payment-provider fees, messaging, OCR, AI, premium storage,
custom implementation, and other explicitly metered services.

## 2. Market and cost review

Official pricing reviewed on 2026-07-05 shows:

- Xero’s US Established accounting plan normally costs USD 90/month and still
  charges separately for some usage/payment services.
- Odoo lists Standard and Custom plans at approximately EUR 14.80 and EUR 28.00
  per user/month on monthly billing, with implementation and in-app credits
  outside the subscription.
- Zoho One lists flexible-user pricing at USD 90 per user/month.
- Sage South Africa separates accounting, inventory, multi-currency, payroll,
  users, warehousing, POS, and other modules through product tiers/add-ons.

VAKA is intended to combine CRM, finance, inventory, local payments,
communications, mobile work, banking, portals, AI, and operational controls.
The earlier USD 75 Business price for 15 users and USD 150 Enterprise floor did
not leave credible room for implementation, support, provider costs, security,
or continued development.

### Recommended commercial guardrails

- Price the durable operating platform, not merely today’s unfinished screens.
- Preserve an accessible entry tier for Zimbabwean micro-businesses.
- Charge established businesses for team scale, controls, integrations, and
  support value.
- Keep variable third-party costs metered or allowance-based.
- Charge separately for material onboarding, migration, configuration, and
  custom integration work.
- Use annual commitment discounts rather than an unsustainably low permanent
  list price.
- Review prices at least annually against USD costs, provider prices, support
  demand, inflation, exchange controls, and demonstrated customer value.

## 3. Current implementation warning

The repository currently stores a plan name, monthly price, user limit, and a
small JSON feature object. Most application routes do not enforce feature
entitlements, and existing seed logic does not update an already-created plan.

Therefore:

- this document defines the target packages;
- public copy must distinguish live, preview, planned, and add-on capability;
- server-side entitlement enforcement must ship before a capability is sold as
  plan-restricted; and
- changing a seed object alone does not change an existing production plan.

## 4. Proposed packages

### Starter — Run the essentials

**Audience:** founders, sole traders, and very small businesses
**Recommended list price:** USD 19/month, or USD 190/year

**Included users:** 1
**Locations:** 1

**Outcome:** Replace disconnected spreadsheets with one dependable operating
record.

**Included live foundation:**

- customer and supplier records;
- sales pipeline and activities;
- invoices, payments, expenses, and core accounting;
- USD and ZWG transaction handling;
- products and one stock location;
- core financial and receivables reports;
- data export;
- mobile-responsive web access; and
- standard support.

**Planned when released:**

- branded invoice PDF download;
- email/WhatsApp share by the owner;
- mobile app for one user;
- bank-statement CSV import;
- basic payment links; and
- limited document scanning allowance.

Starter is deliberately useful, not a crippled trial. Team administration,
multi-location operation, shared communications, and approval workflows belong
in higher tiers.

### Growth — Coordinate a growing team

**Audience:** growing businesses with sales, finance, and stock responsibilities
**Recommended list price:** USD 69/month, or USD 690/year

**Included users:** 5
**Locations:** 2

**Outcome:** Coordinate people, customers, stock, and collections without losing
control.

**Everything in Starter, plus:**

- multi-user roles and permissions;
- owner-only signed-in-user, session, and material activity visibility;
- two stock locations and controlled transfers/counts when released;
- purchase orders and supplier workflows;
- team tasks and assignments;
- enhanced receivables ageing and reminders;
- standard bank reconciliation;
- customer statements;
- expanded imports/exports; and
- priority email support.

**Planned when released:**

- iOS/Android team access;
- governed invoice delivery through email and WhatsApp;
- payment confirmations through supported Zimbabwean gateways;
- shared document capture/OCR allowance;
- basic workflow notifications; and
- VAKA AI read-only summaries subject to release approval.

### Business — Control connected operations

**Audience:** established SMEs with departments, locations, approvals, and
stronger reporting needs
**Recommended list price:** USD 249/month, or USD 2,490/year

**Included users:** 15
**Locations:** 5

**Outcome:** Enforce financial and operational controls across a larger team.

**Everything in Growth, plus:**

- advanced roles and custom approval limits;
- segregation-of-duties workflows;
- five locations/warehouses;
- advanced receivables, payables, and bank reconciliation;
- contracted read-only bank feeds where supported;
- payment-provider settlement reconciliation;
- WhatsApp shared inbox and governed templates when released;
- higher document scanning/OCR allowance;
- advanced inventory, procurement, and management reporting;
- scheduled reports and operational alerts;
- extended audit search/export for authorised roles;
- API/webhook access to approved business events; and
- priority support with defined response targets.

**Planned or separately enabled after review:**

- POS;
- HR and payroll;
- VAKA AI analysis and approved drafting;
- automation allowances; and
- customer/supplier portal expansion.

Payroll, HR, POS, messaging, OCR, and AI may require country review, provider
costs, usage limits, or separate add-ons even when the plan is eligible.

**Implementation:** guided onboarding and migration are separately scoped,
starting from USD 750 for a standard Business implementation. Complex data,
workflows, training, integrations, or onsite work require a quote.

### Enterprise — Govern a complex organisation

**Audience:** larger, multi-entity, regulated, franchise, or white-label
organisations
**Recommended commercial floor:** from USD 599/month on annual agreement;
final price by scope

**Included users:** contracted
**Locations/entities:** contracted

**Outcome:** Govern complex operations with stronger identity, integration,
support, branding, and deployment controls.

**Everything in Business, plus:**

- negotiated user, company/entity, and location limits;
- multi-entity and consolidation capability when released;
- white-label branding, custom domains, documents, emails, and portals;
- single sign-on and automated user provisioning when released;
- advanced API, webhook, integration, and data-export limits;
- dedicated bank/payment/provider integration options;
- custom approval and retention policies;
- enhanced audit/security evidence;
- sandbox/integration environment where contracted;
- onboarding, migration, and training programme;
- named support/contact model and contracted SLA; and
- deployment/data-residency options where technically and legally supported.

Enterprise is not a self-service promise of arbitrary custom development.
Scope, dependencies, security, support, and commercial terms require agreement.

**Implementation:** starts from USD 3,000 and is quoted after discovery. Custom
integrations, historical migration, multi-entity design, security review,
training, white-label deployment, and dedicated environments increase scope.

## 5. Comparison matrix

Legend: **Included**, **Limited**, **Eligible/add-on**, **Planned**, or **—**.

| Capability | Starter | Growth | Business | Enterprise |
|---|---|---|---|---|
| Users | 1 | 5 | 15 | Contracted |
| Locations | 1 | 2 | 5 | Contracted |
| CRM and pipeline | Included | Included | Included | Included |
| Invoicing/core accounting | Included | Included | Included | Included |
| Inventory | 1 location | 2 locations | 5 locations | Contracted |
| Core reports and exports | Included | Included | Included | Included |
| Multi-user roles | — | Included | Advanced | Advanced/SSO planned |
| Owner user/session activity | Not applicable beyond self | Included | Included | Included |
| Approval workflows | — | Basic planned | Advanced planned | Custom planned |
| Branded invoice PDFs | Planned | Planned | Planned | Planned/white-label |
| Email invoice delivery | Planned | Planned | Planned | Planned |
| WhatsApp invoice sending | Owner share planned | Governed planned | Shared inbox planned | Advanced planned |
| Mobile apps | 1 user planned | Included when released | Included when released | Contracted when released |
| Bank CSV import | Planned | Included when released | Included when released | Included when released |
| Direct bank feeds | — | Eligible/add-on | Eligible/add-on | Contracted |
| Payment confirmations | Basic planned | Planned | Advanced planned | Contracted |
| Document scanning/OCR | Limited planned | Standard planned | Higher allowance planned | Contracted |
| Advanced reconciliation | — | Standard | Included | Included |
| VAKA AI | Preview only | Read-only planned | Analyst/drafting planned | Contracted controls |
| POS/HR/Payroll | — | Eligible later | Eligible/add-on | Contracted |
| API/webhooks | — | Limited planned | Included planned | Advanced planned |
| White-label/custom domain | — | — | — | Eligible |
| Support | Standard | Priority email | Priority targets | Contracted SLA |

## 6. Additional capacity

Recommended starting points:

- Growth additional internal user: USD 10/month;
- Business additional internal user: USD 15/month;
- Enterprise users, entities, locations, and environments: contracted;
- customer and supplier portal identities: not charged as internal users under
  normal fair-use policy; and
- temporary implementation/support users: governed separately and never used
  to bypass licensing.

Additional capacity does not automatically grant permissions or module access.

## 7. Usage-based services

External providers charge by message, OCR page, model usage, payment, storage,
or support volume. VAKA should use transparent included allowances and
overage/add-on pricing rather than hiding unlimited variable cost inside a
low-price plan.

Potential metered dimensions:

- WhatsApp/SMS messages;
- OCR/document pages;
- VAKA AI usage;
- file storage and retention;
- payment-provider or bank-feed connections;
- API/webhook volume;
- additional users, entities, or locations; and
- premium onboarding/migration/support.

No usage charge may block access to owned data or required export after
subscription suspension.

## 8. Trial, pilot, and discount policy

- Replace the broad three-month free period with a 30-day product trial once
  onboarding and billing are production-ready.
- Keep pilot programmes separate, invitation-only, time-bounded, and tied to
  feedback/support commitments.
- Annual prepayment may provide approximately two months’ value, reflected in
  the recommended annual prices.
- Discount the subscription deliberately; do not silently waive provider,
  implementation, custom development, or pass-through costs.
- Record discount reason, owner, duration, renewal price, and approval.
- Non-profit, education, accelerator, or partner programmes require published
  eligibility and must not redefine the standard list price.

## 9. Entitlement architecture

Create a governed entitlement catalogue with stable machine keys, for example:

- `crm`;
- `finance.core`;
- `inventory.locations.max`;
- `users.max`;
- `approvals.basic`;
- `approvals.advanced`;
- `documents.pdf`;
- `documents.ocr.pages`;
- `communications.email`;
- `communications.whatsapp`;
- `banking.csv_import`;
- `banking.direct_connections.max`;
- `payments.confirmations`;
- `mobile`;
- `ai.read`;
- `api.access`;
- `branding.white_label`; and
- `support.tier`.

The server resolves effective entitlements from plan version, tenant-specific
contract/overrides, add-ons, usage period, and lifecycle state.

Requirements:

- server-side enforcement;
- typed catalogue and values;
- versioned plan definitions;
- no client-submitted entitlement authority;
- tenant-scoped cache with safe invalidation;
- audit of plan/override/add-on changes;
- usage counters that are exact and idempotent;
- explicit unavailable/limit/upgrade responses;
- grandfathering and migration policy;
- feature flags separate from commercial entitlements; and
- emergency/provider kill switches that can disable a capability regardless of
  plan.

## 10. Upgrade, downgrade, and suspension

- Upgrades must not silently grant permissions to existing users.
- Downgrades must not delete data or mutate historical records.
- Excess users/locations become controlled read-only or require selection; they
  are not silently deleted.
- Existing documents remain downloadable according to access policy.
- Provider connections may stop new activity while preserving history and
  reconciliation evidence.
- Suspension retains read, billing, and export behavior defined by VAKA policy.
- Enterprise contract expiry follows an explicit offboarding/export plan.

## 11. Implementation order

1. Validate willingness-to-pay with Zimbabwean micro, growing, established, and
   enterprise pilot customers; approve names, limits, list prices, onboarding
   fees, annual terms, taxes, and availability labels.
2. Create a typed, versioned plan/entitlement catalogue shared by seed,
   billing, public pricing, and application UI.
3. Add plan-version and tenant-entitlement persistence through migrations.
4. Build a server entitlement resolver and denial contract.
5. Enforce user and location limits first.
6. Add plan-aware UI states without relying on UI for enforcement.
7. Test upgrade, downgrade, suspension, grandfathering, cache, and tenant
   isolation.
8. Move homepage pricing to the governed catalogue.
9. Add usage metering only for released provider-backed capabilities.
10. Publish packages only when live entitlements match the claims.

## 12. Acceptance criteria

- The public price, signup selection, billing plan, and server entitlements
  resolve from one governed plan version.
- Every restricted API enforces entitlements server-side.
- Security, data ownership, core audit integrity, and export are available to
  every tenant.
- Upgrade/downgrade never deletes tenant data or broadens user permissions
  silently.
- Unreleased capability remains labelled planned/preview.
- Usage counters and provider limits are tenant-safe, exact, and auditable.
- Existing subscribers receive an explicit migration/grandfathering decision.

## 13. Pricing references

- Xero US pricing: https://www.xero.com/us/pricing-plans/
- Odoo pricing: https://www.odoo.com/pricing
- Zoho One pricing: https://www.zoho.com/one/pricing/
- Sage South Africa 2025–2026 price list:
  https://mcacomp.co.za/documents/sage-price-list-2025-2026.pdf

Professional Partner account pricing and recurring commission hypotheses are
defined separately in `REFERRAL-AND-PROFESSIONAL-PARTNER-PROGRAM.md`.
