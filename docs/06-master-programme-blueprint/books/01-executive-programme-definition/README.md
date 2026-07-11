# Book One - Executive Programme Definition

**Version:** 1.0  
**Definition:** Accepted baseline  
**Implementation:** Partial, measured by the capability register  
**Availability:** Existing ERP foundation only; future products remain planned unless separately released

## 1. Programme mandate

VAKA means “build” in Shona. VAKA OS is **The Operating System for African Business**, designed in Zimbabwe and built for responsible expansion across Africa.

The programme exists to help African businesses run, understand, govern, and improve their operations through one trusted system. It connects customers, money, stock, people, work, communications, evidence, and intelligence without turning them into disconnected applications or duplicate records.

## 2. Version 1 outcome

VAKA Version 1 is successful when a launch-market business can:

- establish an isolated organisation and invite users with least-privilege roles;
- manage customer, sales, purchasing, inventory, and financial workflows end to end;
- preserve exact, auditable, reversible financial and stock history;
- understand cash, receivables, payables, stock, sales, risks, and required actions;
- produce and retain trustworthy business documents and exports;
- work effectively on common mobile and desktop devices under variable connectivity;
- use approved English, Shona, and Ndebele experiences without changing business rules;
- receive permission-aware AI explanations and recommendations that never replace deterministic controls;
- onboard, migrate, learn, obtain support, and retain ownership of its data; and
- continue operating safely when an integration, provider, or model is unavailable.

Version 1 does not require every long-horizon VAKA product to be GA on the first Zimbabwe launch day. It requires a governed architecture and mission path for every frozen product family, plus release evidence for the explicitly declared launch scope.

## 3. Product portfolio

The frozen portfolio comprises VAKA OS, Platform, ERP, Intelligence, Network, Verify, Capital, Mail, Black Book, and Studio. Their canonical responsibilities are defined in ADR-003. All products share Platform identity, tenancy, permissions, audit, documents, search, notifications, metadata, events, policy, workflow, AI context, and operational controls.

No product may create a second authoritative Customer, Supplier, Product, Invoice, User, Organisation, or Ledger for convenience. Extensions attach to the Canonical Information Model.

## 4. Non-negotiable qualities

VAKA is multi-tenant, secure, scalable, AI-first, mobile-responsive, and localisation-ready. Trust, auditability, data protection, permissions, reliability, backup, recovery, export, and understandable failure are product capabilities.

The decision hierarchy is:

1. safety, law, data protection, and tenant isolation;
2. accounting, inventory, and audit integrity;
3. customer trust and reliable access to customer data;
4. measurable customer outcomes;
5. accessibility, mobile usability, and localisation;
6. maintainability and operational resilience;
7. delivery speed.

## 5. Programme success measures

Success is measured through outcomes and evidence, not feature count or page count:

- activation and time to first trustworthy transaction;
- workflow completion time and error/rework rate;
- financial/stock reconciliation exceptions;
- tenant/permission/security incidents;
- availability, latency, recovery, deployment, and change-failure measures;
- mobile/accessibility/localisation acceptance;
- AI groundedness, unsafe-action, permission-leakage, usefulness, latency, and cost;
- migration accuracy and customer data-export success;
- adoption, support burden, retention, and customer confidence;
- gate and documentation completeness.

Targets are defined per release and cannot be invented retrospectively.

## 6. Governance

Leadership owns the Constitution and Architecture Freeze. Product owns outcomes and availability. Architecture owns boundaries and technical decisions. Domain owners own business rules. Security, Privacy, Finance, Operations, AI Governance, Country, Localisation, and Customer Success owners approve their gates. Mission Packs are the execution envelope; they never override controlling sources.

## 7. Current-state declaration

As of 2026-07-11, the repository contains a working TypeScript/Express/PostgreSQL and React/Vite foundation with CRM, invoicing/accounting, inventory, billing, reporting, tenant scoping, RBAC, audits, append-only ledger patterns, USD/ZWG handling, white-label controls, mobile capture foundations, CI foundations, and early Platform Kernel contracts.

It does not yet prove the complete platform, every ERP module, every frozen product, complete multilingual delivery, full native/offline support, production AI, every country/industry pack, every integration, enterprise operations, certification, or GA readiness. Books 5 and 24 keep that gap visible and executable.

## 8. Executive acceptance

Book One is accepted when leadership confirms the mission, portfolio, Version 1 outcome, decision hierarchy, status model, and professional-review boundaries. It does not sign off implementation.
