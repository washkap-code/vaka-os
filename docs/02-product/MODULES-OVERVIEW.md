# VAKA Modules Overview

**Status:** Product blueprint
**Owner:** Product and Engineering
**Last reviewed:** 2026-07-04

## 1. Operating-system model

VAKA modules are not independent applications. They share:

- tenant identity;
- users, roles, and permissions;
- customers and suppliers;
- products and services;
- documents and numbering;
- financial and stock records;
- audit history;
- localisation and country configuration;
- notifications;
- reporting; and
- VAKA AI tools.

A business event should update every affected module through one controlled workflow.

## 2. Availability labels

- **Current foundation:** substantially represented in the repository.
- **Partial:** some data or workflow exists, but the module is incomplete.
- **Planned:** not implemented.
- **Cross-cutting:** spans several modules rather than operating alone.

Documentation status is not proof of production availability.

## 3. CRM

**Status:** Current foundation

### Outcome

Win more customers and keep every relationship visible.

### Scope

- contacts and organisations;
- leads and opportunities;
- pipeline stages;
- activities, notes, tasks, calls, and meetings;
- ownership and follow-up;
- conversion from won opportunity to commercial document;
- customer history; and
- segmentation and search.

### Connections

- Finance for quotations, invoices, payments, and receivables
- Inventory for product availability
- Customer Portal for shared documents
- VAKA AI for priorities, follow-ups, and relationship summaries

## 4. Finance / Accounting

**Status:** Current foundation

### Outcome

Get paid faster and understand the financial position of the business.

### Scope

- chart of accounts;
- double-entry journal;
- invoices, credit notes, and payments;
- branded invoice documents, secure PDF downloads, delivery status, and
  currency-safe receivables ageing;
- expenses and supplier obligations;
- accounts receivable and payable;
- cash and bank accounts;
- bank import and reconciliation;
- tax records;
- multi-currency transactions;
- period controls and approvals;
- financial statements; and
- audit trail.

### Invariants

- exact financial arithmetic;
- balanced journal entries;
- append-only posted history;
- rate snapshots;
- immutable issued document numbers; and
- atomic cross-module posting.

## 5. Inventory

**Status:** Current foundation

### Outcome

Never lose track of stock.

### Scope

- products and services;
- SKUs and units of measure;
- warehouses and locations;
- stock movements and levels;
- opening balances and adjustments;
- sales depletion and COGS;
- receipts and purchase orders;
- stock counts;
- transfers;
- replenishment;
- batch, serial, and expiry support where required; and
- costing methods.

### Invariants

- append-only stock movement history;
- tenant and location isolation;
- atomic accounting sync;
- controlled negative-stock behavior; and
- auditable adjustments.

## 6. Payroll

**Status:** Planned

### Outcome

Pay people accurately, on time, and with clear statutory records.

### Scope

- payroll profiles;
- earnings and deductions;
- pay periods and runs;
- PAYE and NSSA configuration;
- benefits, loans, and allowances;
- approvals;
- payslips;
- payment files;
- statutory summaries;
- payroll-to-ledger posting;
- corrections and reversals; and
- year-to-date records.

### Dependencies

- qualified Zimbabwean payroll and accounting review;
- secure HR data model;
- approval and segregation-of-duty controls;
- statutory effective dating;
- deterministic calculation tests; and
- country-specific payroll rule packs.

VAKA must not claim PAYE or NSSA automation before verification.

## 7. HR

**Status:** Planned

### Outcome

Manage people records and employment workflows responsibly.

### Scope

- employee records;
- roles, departments, and reporting lines;
- contracts and documents;
- leave and attendance;
- onboarding and offboarding;
- performance and development;
- disciplinary and case records where legally appropriate;
- employee self-service; and
- payroll integration.

HR data requires stricter access, retention, privacy, and audit controls than ordinary business records.

## 8. POS

**Status:** Planned

### Outcome

Sell quickly at the counter while keeping stock, cash, customers, and accounting aligned.

### Scope

- products and price lookup;
- barcode support;
- tills and shifts;
- cash, card, mobile, and mixed payments;
- receipts;
- returns and refunds;
- discounts and approvals;
- cash-up and variance;
- offline queue and synchronisation;
- customer selection; and
- automatic stock and ledger effects.

POS must remain safe under intermittent connectivity and duplicated submissions.

## 9. Procurement

**Status:** Partial

### Outcome

Buy the right goods at the right time with control over commitments and suppliers.

### Scope

- supplier records;
- purchase requests;
- approval limits;
- requests for quotation;
- purchase orders;
- goods receipt;
- three-way matching;
- supplier invoices;
- returns;
- payment scheduling; and
- supplier performance.

Current repository support is centred on purchase orders and receiving.

## 10. Reporting

**Status:** Current foundation

### Outcome

Make better decisions using one trusted view of the business.

### Scope

- executive dashboard;
- sales and pipeline;
- receivables and payables;
- profit and loss;
- balance sheet;
- trial balance;
- cash position;
- inventory and purchasing;
- payroll and workforce;
- compliance;
- scheduled reports;
- exports; and
- drill-down to source records.

Reports should be derived from authoritative records and state the period, currency, and filters used.

## 11. Compliance

**Status:** Cross-cutting, partial foundation

### Outcome

Maintain trustworthy records and support business obligations without overstating certification.

### Scope

- permissions and segregation of duties;
- audit logs;
- data protection and retention;
- document numbering;
- VAT records;
- ZIMRA readiness;
- PAYE/NSSA readiness;
- consent and communications;
- security controls;
- evidence exports;
- policy acknowledgement; and
- country-specific compliance packs.

VAKA supports compliance work; it does not replace qualified legal, tax, payroll, or accounting advice.

## 12. Customer Portal

**Status:** Planned

### Outcome

Give customers secure self-service access to shared business records.

### Scope

- quotations and approvals;
- orders;
- invoices, statements, and payment status;
- secure invoice viewing and PDF download;
- payments;
- support requests;
- shared files;
- account details; and
- communication preferences.

External access must remain scoped to the correct customer and tenant.

## 13. Supplier Portal

**Status:** Planned

### Outcome

Coordinate procurement and supplier obligations with less manual administration.

### Scope

- requests for quotation;
- quotation submission;
- purchase-order acknowledgement;
- delivery status;
- supplier invoices;
- statement and payment status;
- compliance documents; and
- secure messaging.

## 14. VAKA AI

**Status:** Product direction

### Outcome

Let VAKA assist the business with understanding, prioritisation, and controlled action.

### Scope

- plain-language business questions;
- executive summaries;
- receivables and cash insight;
- customer and pipeline priorities;
- stock and purchasing risk;
- report explanations;
- anomaly detection;
- recommendations; and
- permission-aware actions with confirmation.

VAKA AI is described fully in `VAKA-AI-BLUEPRINT.md`.

## 15. Admin

**Status:** Partial

### Outcome

Operate the VAKA platform and support tenants safely.

### Scope

- tenant lifecycle;
- plans and subscription state;
- platform users;
- audit access;
- support tooling;
- feature flags;
- incident controls;
- impersonation only if strictly controlled and audited;
- usage and service health; and
- country and module availability.

Platform administration requires MFA, least privilege, strong auditability, and separation from ordinary tenant access.

## 16. Settings

**Status:** Partial

### Outcome

Configure VAKA without changing core code or weakening controls.

### Scope

- company profile;
- tax and registration details;
- currencies and exchange-rate policy;
- financial periods;
- document numbering;
- users, roles, and approvals;
- warehouses and defaults;
- language, time zone, dates, and formats;
- notifications;
- integrations;
- data import/export;
- security; and
- country pack.

## 17. White-label branding

**Status:** Partial; profile/company Settings foundation available

### Outcome

Allow approved organisations to present VAKA-powered experiences consistently under their brand.

### Scope

- logo;
- colours with contrast validation;
- custom domain;
- workspace identity;
- documents and emails;
- customer and supplier portals;
- login experience; and
- “Powered by VAKA” policy.

Semantic security/status colours must not be replaced by inaccessible tenant branding.

The full behaviour, managed uploads, document snapshots, branded sign-in and
custom-domain safeguards follow `TENANT-CUSTOMISATION-AND-WHITE-LABEL.md`.

## 18. Shared platform capabilities

Every module depends on:

- authentication and secure sessions;
- tenant isolation;
- permissions;
- audit events;
- documents and files;
- exact money/quantity handling;
- notifications;
- search;
- import/export;
- mobile responsiveness;
- offline resilience;
- localisation;
- country configuration;
- APIs and integrations;
- observability;
- backup and recovery; and
- support operations.

Mobile applications, WhatsApp, document capture/OCR, and Zimbabwean payment
providers are shared platform capabilities. They must use named permissions,
tenant-scoped adapters, deterministic server workflows, audit logs, and safe
offline/idempotency controls. See `MOBILE-APP-BLUEPRINT.md`,
`WHATSAPP-INTEGRATION.md`, `ZIMBABWE-PAYMENTS-INTEGRATION.md`, and
`ADVANCED-CAPABILITY-ACCESS.md`. Zimbabwean bank statement ingestion and
reconciliation follow `BANK-CONNECTIVITY-SPEC.md`.
Owner-only user presence, session revocation, and material activity history
follow `USER-SESSION-ACTIVITY-SPEC.md`.
Commercial availability and plan entitlements follow
`PRICING-AND-PACKAGING.md`; documentation alone does not enable a feature.
Referral attribution, professional practice accounts, client portfolios, and
commission/payout controls follow
`REFERRAL-AND-PROFESSIONAL-PARTNER-PROGRAM.md`.

## 19. Country expansion model

Core module logic should remain country-neutral where practical.

Country packs provide:

- supported currencies;
- taxes and rates;
- charts of accounts;
- statutory fields;
- payroll rules;
- fiscalisation/e-invoicing adapters;
- payment methods;
- language and terminology;
- document formats;
- retention requirements; and
- professional validation evidence.

Zimbabwe is the first country pack and the proving ground for this architecture.
