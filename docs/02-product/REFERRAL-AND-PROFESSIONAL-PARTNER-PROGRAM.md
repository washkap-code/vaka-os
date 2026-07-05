# VAKA Referral and Professional Partner Programme

**Status:** Proposed commercial and product model; legal, tax, payout, and entitlement approval pending

**Owner:** Partnerships, Product, Finance, Legal, Security, and Engineering
**Last reviewed:** 2026-07-05

**Implementation note (2026-07-05):** The first controlled foundation now
supports platform-created referral codes and immutable referral attribution
during transactional company signup. It snapshots the programme and rule
version, rejects invalid and obvious self-referrals, and creates a tenant audit
event. An internal append-only review queue now records pending, qualified,
rejected, and held decisions with an actor and reason; it does not yet make a
referral commission-eligible automatically. Commission calculation,
partner-client access, disputes, and payouts remain unimplemented.

## 1. Purpose

Build a trusted distribution network around accountants, bookkeepers, business
consultants, implementation specialists, and other qualified professionals who
already help African businesses operate better.

The programme should reward genuine acquisition and ongoing client success
without compromising professional independence, customer ownership, privacy,
or VAKA’s financial sustainability.

## 2. Two distinct programmes

### General referral programme

For existing customers and approved individuals who introduce a new business
but do not manage that business inside VAKA.

**Proposed reward:**

- 10% of net subscription revenue actually collected during the referred
  customer’s first 12 paid months;
- calculated after discounts, credits, refunds, chargebacks, and applicable
  taxes;
- excludes payment-provider pass-through fees, messaging, OCR, AI, custom
  implementation, hardware, and other third-party costs unless explicitly
  included by rule; and
- paid after the clearing/hold period and minimum payout threshold.

### VAKA Professional Partner programme

For approved practices that onboard and support clients through a dedicated
professional account.

**Proposed recurring reward:**

- 20% of eligible net subscription revenue in paid months 1–12;
- 10% in paid months 13–36; and
- 5% thereafter while the partner, client relationship, and programme account
  remain eligible and in good standing.

This structure is intentionally more attractive than a simple referral because
the professional continues helping the client adopt and use VAKA. Rates remain
commercial hypotheses until margin, tax, legal, and pilot validation.

## 3. Professional account value

The professional account is not merely an affiliate dashboard. It is a
practice operating workspace.

### Client portfolio

Use the term **client portfolio**, not “inventory.” Clients are independent
businesses and retain ownership of their data and subscription.

Partners can see, within each client’s consent and their own permissions:

- invited, onboarding, trial, active, at-risk, suspended, and former clients;
- package, renewal date, billing standing, and partner commission eligibility;
- outstanding onboarding tasks and requested documents;
- bookkeeping/reconciliation close status;
- receivables, stock, compliance, or filing attention indicators;
- assigned partner team member;
- last client interaction and next action; and
- service notes that are explicitly private to the professional practice.

Cross-client dashboards show bounded indicators, not unrestricted record data.

### Onboarding and implementation

- branded referral/invitation links and codes;
- client qualification checklist;
- assisted company setup;
- configurable chart-of-accounts templates after professional review;
- customer, supplier, product, opening-balance, and historical-data migration
  tools;
- bank/payment/WhatsApp connection checklist;
- role and approval setup;
- training progress;
- go-live readiness checklist; and
- handover/acceptance record.

### Ongoing professional service

- multi-client task and deadline dashboard;
- month-end close workspace;
- document request lists;
- bank-reconciliation and exception queue;
- review/approval workflow without sharing owner credentials;
- client-facing reports and commentary;
- secure client messaging;
- bulk reminders that remain client-specific and consent-governed;
- portfolio analytics using permission-safe aggregates; and
- VAKA AI assistance only within the professional’s authorised client scope.

### Partner growth

- certification and continuing education;
- implementation playbooks and demo/sandbox workspaces;
- partner directory profile after quality approval;
- co-marketing assets;
- lead registration and conflict handling;
- service-package templates;
- partner performance and client-retention insights;
- dedicated enablement/support by tier; and
- badges based on evidence, not merely fees or referral volume.

## 4. Proposed professional pricing

Professional subscription fees pay for the practice workspace and support.
Client VAKA subscriptions remain separate.

| Professional package | Recommended price | Advisor seats | Managed-client workspace | Intended user |
|---|---:|---:|---:|---|
| Professional Solo | USD 39/month or USD 390/year | 1 | Up to 15 actively managed clients | Independent accountant or consultant |
| Professional Firm | USD 129/month or USD 1,290/year | 5 | Up to 75 actively managed clients | Growing accounting/advisory practice |
| Professional Network | USD 349/month or USD 3,490/year | 15 | Up to 250 actively managed clients | Multi-team or multi-branch practice |
| Professional Enterprise | From USD 799/month | Contracted | Contracted | Large networks, franchises, associations |

Referred clients beyond the actively managed limit may remain in commission
history without granting operational access. Extra advisor seats, active
managed clients, white-label assets, migration capacity, API usage, training,
and premium support may be priced separately.

## 5. Client ownership and consent

- The client contracts directly with VAKA unless an approved reseller agreement
  explicitly says otherwise.
- The client controls its workspace, billing contact, users, data, exports, and
  partner access.
- A referral never grants access to client data.
- Operational access requires a separate invitation, named user identity,
  permissions, purpose, and client approval.
- Clients can remove a professional without losing their VAKA records.
- Removing access does not rewrite valid historical referral attribution, but
  may end future recurring professional commission under approved programme
  rules.
- Partners cannot prevent a client from changing advisor, exporting data,
  upgrading, downgrading, or leaving VAKA.
- Commission relationships and material conflicts should be disclosed clearly
  to the client according to approved programme terms and professional rules.

## 6. Attribution

Referral attribution must be deterministic and disputeable.

Capture:

- referral/lead ID and immutable code;
- programme and commission-rule version;
- referring person/practice;
- campaign/source;
- prospect and consent-safe contact information;
- first qualified referral timestamp;
- signup, tenant, trial, activation, and first-paid timestamps;
- attribution status and reason;
- prior customer/lead checks;
- partner-client link and access status; and
- dispute/override actor, reason, and evidence.

**Proposed rules:**

- 30-day general referral cookie/link window;
- registered professional lead protection for 90 days when there is documented
  active pursuit;
- first valid qualified source wins unless an approved partner-assisted sale
  rule applies;
- existing customers, existing active opportunities, employees, test tenants,
  duplicates, self-referrals, related-party abuse, and unauthorised paid
  advertising may be excluded;
- attribution changes require independent review and audit; and
- no commission is earned merely by creating a trial.

## 7. Commission ledger

Commission accounting must be append-only.

For each eligible client payment record:

- client subscription invoice/payment reference;
- partner/referrer;
- rule/version and eligible period;
- gross collected subscription;
- exclusions, discount, credit, refund, tax, and net eligible revenue;
- commission rate and exact amount/currency;
- pending, approved, held, payable, paid, reversed, disputed, or expired status;
- hold/release date;
- payout batch/reference; and
- reason and actor for adjustment.

Never silently edit an earned line. Corrections use reversal and replacement
entries.

## 8. Payouts

**Proposed controls:**

- verified identity/business, tax details, payout account, and programme
  agreement before payout;
- monthly payout cycle;
- minimum cleared balance of USD 50 or local equivalent;
- initial 45-day hold after client payment;
- longer hold for high-risk, disputed, refunded, or provider-delayed revenue;
- payout through an approved bank/mobile-money provider only;
- no cash handling by staff;
- exact payout statement and downloadable history;
- two-person approval for payout batches and manual adjustments;
- reconciliation between subscription collection, commission ledger, payout
  provider, bank, and general ledger; and
- withholding/reporting treatment determined by qualified Zimbabwean tax/legal
  review.

## 9. Eligibility and quality

Professional applicants should provide:

- legal identity and practice/business information;
- professional role and credentials where claimed;
- client-service and implementation capability;
- payout and tax information;
- conflict, ethics, privacy, marketing, and anti-bribery declarations;
- acceptance of programme, brand, data-processing, and security terms; and
- completion of required VAKA training/certification.

Professional status is not proof of statutory authority. VAKA must verify and
label claimed qualifications carefully.

Quality measures should include:

- client activation and retention;
- successful onboarding;
- support burden and implementation quality;
- client satisfaction and complaints;
- security/privacy incidents;
- training/certification status;
- payment and referral fraud;
- disclosure compliance; and
- data quality.

Volume alone must not determine partner status.

## 10. Roles

### Professional practice

- **Practice Owner:** agreement, payout, team, client acceptance, and security.
- **Partner Administrator:** team and workflow administration, not payout-bank
  changes unless explicitly delegated with MFA.
- **Advisor/Accountant:** client work within permissions granted by each client.
- **Implementation Specialist:** onboarding/migration only.
- **Billing/Payout Manager:** views statements and prepares payout details.
- **Practice Auditor:** read-only programme and activity evidence.

### VAKA

- **Partner Operations:** reviews applications and ordinary programme cases.
- **Finance Approver:** validates ledger/payout batches.
- **Risk/Compliance:** handles fraud, disputes, sanctions, tax/legal holds, and
  exceptional access.
- **Platform Administrator:** operates systems without routine client-data
  access.

## 11. Security and abuse controls

- Separate referral attribution from client-data permission.
- Tenant-scope every client access; professional portfolios are explicit
  cross-tenant grants, never broad database access.
- Recheck access on every client request and background task.
- Require MFA for professional accounts and step-up for payout/security changes.
- Prevent self-referral, duplicate identity, circular referral, coupon abuse,
  fake tenants, card/payment fraud, rapid cancel/refund, and staff collusion.
- Keep payout credentials encrypted and out of client/browser logs.
- Audit referral, attribution, client link, access, commission, adjustment,
  payout, certification, and suspension events.
- Provide per-partner and programme kill switches without deleting evidence.
- Never allow a professional to see another professional’s portfolio.

## 12. Proposed data model

- `partner_accounts`;
- `partner_members`;
- `partner_certifications`;
- `partner_client_links`;
- `client_partner_consents`;
- `referral_codes`;
- `referral_leads`;
- `referral_attributions`;
- `commission_rule_versions`;
- `commission_ledger_entries`;
- `payout_accounts`;
- `payout_batches`;
- `payout_items`;
- `partner_disputes`; and
- partner-specific audit events.

All schemas require versioned migrations, tenant/client boundary tests,
retention rules, and rollback/reconciliation procedures.

## 13. Implementation order

1. Approve programme economics, disclosures, terms, tax, KYC, payout, conflict,
   eligibility, and professional-account pricing.
2. Implement immutable referral codes, lead capture, and attribution without
   payouts.
3. Add anti-abuse checks and an internal attribution review queue.
4. Add professional accounts, team identities, MFA, and client invitation/
   consent links.
5. Build the client portfolio and onboarding workspace using explicit
   cross-tenant grants.
6. Add versioned commission rules and append-only commission ledger.
7. Integrate subscription collection events and refunds idempotently.
8. Build partner statements, disputes, and internal approval.
9. Integrate an approved payout provider and reconcile end to end.
10. Pilot with a small group of Zimbabwean accountants/business advisors before
    public launch.

## 14. Acceptance criteria

- Referral attribution never grants client access.
- A professional can access only clients and records explicitly authorised.
- Client removal of access takes effect immediately.
- Commission is based only on eligible collected net revenue.
- Refunds, chargebacks, cancellation, duplicate events, and rule changes
  reconcile through append-only entries.
- Payouts require verified identity, approved destination, threshold, hold,
  dual approval, audit, and reconciliation.
- Clients can see the relationship and retain ownership/control.
- Marketing never implies the programme is live before payout, legal, tax,
  support, and fraud controls pass.

## 15. Market references

- QuickBooks ProAdvisor revenue share:
  https://quickbooks.intuit.com/accountants/products-solutions/pricing-promotions/papp/revenue-share/
- Xero partner programme:
  https://central.xero.com/s/article/The-Xero-partner-program-explained
- Odoo affiliate programme:
  https://www.odoo.com/affiliate
