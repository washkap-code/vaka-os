# Book Fourteen - Integration Architecture and Catalogue

**Version:** 1.0  
**Definition:** Accepted provider-neutral target  
**Implementation:** Selected file/email/share foundations; provider catalogue largely planned

## 1. Integration doctrine

External providers attach through narrow versioned adapters. Core domains depend on VAKA contracts and normalized states, never provider SDKs or payloads. Provider failure does not corrupt authoritative business state. Every integration has an owner, purpose, data map, credentials, permissions, consent, reliability, security, cost, support, reconciliation, retention and exit plan.

## 2. Standard integration envelope

Each adapter defines:

- provider/contract/version and supported countries/environments;
- tenant connection and explicit scopes;
- credential/token storage, rotation and revocation;
- request/response/webhook schemas and signature verification;
- idempotency inbox/outbox, ordering and concurrency;
- timeouts, retry/backoff, circuit/fallback and DLQ;
- normalized state machine and error taxonomy;
- rate/quota/cost controls;
- data classification, minimization, residency/processor terms and retention;
- logs/metrics/traces/alerts/status and runbook;
- sandbox/fixtures/contract tests and certification where provider requires;
- reconciliation, migration, disablement and provider exit.

## 3. Identity integrations

OIDC/OAuth/SAML/enterprise directory providers are added after Identity supports issuer/audience/key rotation, domain/tenant mapping, account linking, deprovisioning, MFA/step-up, recovery, audit and provider outage behavior. An external identity does not determine VAKA permission by itself.

## 4. Communications

Email, SMS, WhatsApp, push, calendar and meeting providers use Notifications or VAKA Mail contracts. Consent, verified sender, templates, suppression, deliverability, inbound authenticity, attachment security and record retention are explicit.

## 5. Payments and mobile money

Payment adapters normalize intent/request, pending, authorized, successful, failed, cancelled, reversed/refunded and disputed states. Webhooks enter a signed idempotent inbox. Allocation/posting happens through Finance services after verified state. Zimbabwe candidates such as Paynow, EcoCash, InnBucks and licensed providers require official technical/commercial verification; documentation does not claim a live connection.

## 6. Banking

Begin with versioned statement-file parsers and a provider-neutral transaction/reconciliation contract. Contracted APIs, host-to-host/SFTP or regulated aggregators may attach after security and commercial approval. Browser scraping, stored internet-banking passwords and SMS interception are prohibited. Read-only ingestion is proven before outbound payments.

## 7. Government, tax and fiscalisation

Country-pack-owned adapters cover approved tax/fiscalisation, company, payroll/social-security, procurement/tender and other statutory services. They record authority, effective schema/rules, evidence, outage/manual fallback and professional sign-off. VAKA never silently fabricates a successful statutory submission.

## 8. Documents and trust providers

Object storage, malware scanning, OCR, electronic signature, identity/business verification and document-validation adapters preserve tenant isolation, hashes, provenance, consent, expiry, limitations and provider evidence. OCR is always an untrusted draft until authorized validation.

## 9. Commerce, accounting and migration

Approved ecommerce/POS, legacy accounting/ERP, payroll and data-warehouse connections map through canonical contracts. Imports are dry-run, validated, idempotent, exception-managed and reconciled. Synchronization ownership prevents two systems from silently overwriting each other.

## 10. AI providers

Model/embedding/reranking/guard providers are selected per use case with data-use, residency, retention, security, availability, latency, cost and model-change controls. Provider credentials and unnecessary personal/tenant data never enter prompts. Routing/fallback does not lower a use case’s safety/evaluation gate.

## 11. Developer interfaces

Public REST/events/webhooks and future SDK/CLI/plugins use explicit scopes, quotas, idempotency, version/deprecation, sandbox, documentation, support and marketplace review. Integrations cannot access raw database tables or cross-tenant data.

## 12. Acceptance

Contract, security, tenant, permission, signature/replay, idempotency, retry/outage, reconciliation, load/quota, privacy/retention, observability, support, migration/exit and country/professional tests must pass. Availability is provider-and-market-specific.
