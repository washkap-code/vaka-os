# Zimbabwe Payments Integration Strategy

**Status:** Discovery and architecture direction; no provider declared live  
**Owner:** Product, Finance, Engineering, Security, and Compliance  
**Last reviewed:** 2026-07-05

## 1. Outcome

Allow a VAKA business to request and identify payments, receive trustworthy
provider status notifications, match them to invoices, and reconcile settlement
without turning an external callback into an unreviewed accounting entry.

## 2. Verified provider opportunities

Official sources reviewed on 2026-07-05 indicate:

| Provider/path | Verified opportunity | VAKA posture |
|---|---|---|
| EcoCash Developer Portal | REST APIs, sandbox, OAuth 2.0, and real-time webhooks are advertised | Priority direct-integration discovery |
| Paynow Ecommerce | Initiation, polling, signed status updates, and payment-channel metadata including EcoCash are documented | Strong first aggregator candidate |
| Paynow test mode | Official test flows include EcoCash and OneMoney scenarios | Candidate path for broad initial coverage |
| Paynow BillPay | Biller payment notifications and reconciliation APIs are documented | Evaluate for VAKA/platform and eligible tenant biller cases |
| InnBucks Merchant API | InnBucks publicly invites integrated merchants to use its Merchant API | Commercial/technical discovery required |
| OneMoney direct | No sufficient public direct API documentation was verified in this review | Use an approved aggregator initially; pursue direct commercial discovery |
| Interoperable QR | RBZ’s March 2026 direction requires interoperable QR acceptance across banks, mobile money operators, and PSPs | Design adapter and QR data model for the regulated standard |

Other banks, wallets, card acquirers, ZIPIT/Zimswitch paths, and payment
platforms must enter the provider catalogue only after official documentation,
commercial access, settlement behavior, currencies, support, and regulatory
status are verified.

## 3. Recommended rollout

### Phase 1 — Paynow payment links and confirmations

- Generate a unique payment attempt linked to one tenant and invoice.
- Redirect or deep-link the payer to the provider-hosted payment experience.
- Validate every callback hash/signature.
- Poll the official status endpoint before accepting a material state change
  when the provider recommends confirmation.
- Store provider and merchant references, amount, currency, channel, status,
  timestamps, and raw-payload fingerprint.
- Handle duplicate, delayed, out-of-order, disputed, refunded, and reversed
  events idempotently.
- Present confirmation separately from settlement and reconciliation.

This phase can provide EcoCash and OneMoney reach through Paynow where the
tenant’s approved Paynow configuration supports those channels.

### Phase 2 — Direct EcoCash

- Complete EcoCash developer, merchant/biller, commercial, security, and
  production approval.
- Use server-side OAuth and webhook credentials only.
- Validate documented webhook authenticity.
- Support payment request/status, merchant reference, refunds/reversals only
  where contractually and technically available.
- Reconcile provider transactions and settlement reports independently.

### Phase 3 — InnBucks and additional approved providers

- Complete a provider capability questionnaire and sandbox proof.
- Add through the same payment-adapter contract.
- Do not create provider-specific invoice or journal logic.

### Phase 4 — Interoperable QR and bank connectivity

- Implement the applicable RBZ/EMVCo-aligned QR standard through licensed
  providers.
- Add bank-statement/feed adapters and settlement reconciliation.
- Expand by Zimbabwean customer demand, provider evidence, and compliance
  review.

## 4. Payment state model

Keep at least these concepts separate:

- **Payment attempt:** VAKA request to a provider.
- **Provider status:** created, pending, paid/authorised, failed, cancelled,
  disputed, refunded, reversed, or provider-specific intermediate state.
- **Confirmation:** authenticated evidence received and verified from provider.
- **Settlement:** money included in provider/bank settlement evidence.
- **Allocation:** confirmed amount matched to one or more VAKA invoices.
- **Accounting posting:** deterministic payment journal entry.
- **Reconciliation:** provider/bank settlement agrees with VAKA postings and
  fees.

A “Paid” provider status may allow an automatically prepared payment allocation,
but production auto-posting requires an approved policy, exact invoice/currency
match, idempotency, audit, exception handling, and finance sign-off. Ambiguous
payments enter a reconciliation queue.

## 5. Architecture

Create a provider-neutral adapter with operations such as:

- create payment attempt;
- retrieve/poll status;
- verify and normalise webhook;
- request refund where supported and authorised;
- retrieve transaction/settlement evidence; and
- health/capability status.

Provider credentials are tenant-scoped secrets held server-side. Webhooks enter
through provider-specific verification, then become versioned internal events.
Consumers use an outbox/inbox pattern and idempotency keys.

## 6. Controls

- Never trust payer-supplied invoice, tenant, amount, currency, or status.
- Validate signatures/hashes before parsing a callback as authoritative.
- Bind provider references to an existing tenant-scoped payment attempt.
- Use exact money and compare currency as well as amount.
- Prevent replay and duplicate posting.
- Encrypt credentials and support rotation/revocation.
- Redact wallet/card identifiers and personal data in logs.
- Rate-limit initiation and webhook endpoints.
- Audit configuration, initiation, confirmation, allocation, posting,
  reconciliation, refund, reversal, and manual override.
- Require step-up authentication and segregation of duties for credentials,
  refunds, write-offs, and exception overrides.
- Never store wallet PINs, OTPs, raw card data, or customer authentication
  credentials.

## 7. Mobile and invoice integration

- An invoice may display an approved provider payment link or interoperable QR.
- The mobile app may initiate collection but never embed provider secrets.
- A verified callback updates a payment attempt and notifies authorised users.
- The invoice becomes paid only through the existing deterministic
  `recordPayment`/journal workflow.
- Partial, excess, wrong-currency, duplicate, reversed, and disputed payments
  require explicit handling.
- Customers may see status through a secure invoice link or Customer Portal.

## 8. Provider onboarding gate

Before enabling a provider:

- official contract and production credentials;
- regulator/licensing and legal review;
- supported currencies, limits, fees, refunds, disputes, and settlement cycle;
- sandbox and failure-mode evidence;
- webhook authenticity and retry contract;
- data processing, retention, residency, and incident terms;
- tenant credential and merchant-account model;
- support/escalation ownership;
- reconciliation and finance acceptance tests;
- monitoring, kill switch, and rollback; and
- honest availability label.

## 9. Official references

- EcoCash Developer Portal: https://developers.ecocash.co.zw/
- EcoCash merchant information: https://ecocash.co.zw/merchants/
- Paynow Developer Hub: https://developers.paynow.co.zw/
- Paynow transaction initiation:
  https://developers.paynow.co.zw/docs/paynow/initiate_transaction/
- Paynow status updates:
  https://developers.paynow.co.zw/docs/paynow/status_update/
- Paynow test mode:
  https://developers.paynow.co.zw/docs/paynow/test_mode/
- Paynow BillPay webhooks:
  https://developers.paynow.co.zw/docs/billpay/biller/webhooks/
- InnBucks merchants: https://innbucks.co.zw/index.php/home/merchants
- RBZ NPSD Circular 03/2026:
  https://www.rbz.co.zw/documents/Regulations_Acts/2026/NPS_CIRCULAR_MARCH_2026.pdf

