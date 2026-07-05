# VAKA Zimbabwe-First Requirements

**Status:** Market requirements draft
**Owner:** Product and Zimbabwe Market Operations
**Last reviewed:** 2026-07-04

## 1. Principle

VAKA launches first in Zimbabwe because the product should be shaped by real Zimbabwean business conditions.

Zimbabwe-first means depth, not limitation.

Requirements unique to Zimbabwe must be implemented through explicit configuration, country packs, and provider adapters so VAKA can expand into other African countries without rewriting the platform.

## 2. USD and ZiG / ZWG

VAKA must support how Zimbabwean businesses operate across USD and ZiG.

Requirements:

- tenant base currency;
- transaction currency;
- approved technical representation of ZiG/ZWG;
- exchange-rate source, date, and time;
- transaction rate snapshots;
- exact money arithmetic;
- reports in base currency with original-currency traceability;
- multi-currency invoices, payments, expenses, purchases, and balances;
- exchange differences;
- clear customer-facing labels; and
- historical integrity when currency policy changes.

Terminology and currency codes must be reviewed as standards/regulation evolve.

## 3. Zimbabwe VAT

Requirements:

- configurable VAT registration status;
- VAT number and business partner/tax identifiers;
- effective-dated VAT rates;
- zero-rated, exempt, and standard-rated treatment;
- tax-inclusive/exclusive pricing where required;
- VAT input and output accounts;
- document-level and line-level tax records;
- credit note/reversal handling;
- VAT reporting and evidence export; and
- accountant review.

Do not hard-code one VAT rate permanently into core logic.

## 4. ZIMRA readiness

VAKA must be structurally ready for Zimbabwe Revenue Authority requirements.

Requirements may include:

- immutable sequential document numbers;
- required supplier/customer fields;
- tax invoice content;
- fiscalisation or e-invoicing adapter;
- device/provider integration;
- submission status and retry;
- offline/failed-submission handling;
- reversal/correction behavior;
- evidence and audit;
- credential/key management; and
- effective-dated regulatory configuration.

“ZIMRA-ready” does not mean integrated or approved. Public claims must state the exact implemented capability.

## 5. PAYE and NSSA payroll readiness

Payroll architecture must support:

- employee tax and statutory identifiers;
- effective-dated tax bands and rules;
- taxable and non-taxable earnings;
- PAYE calculations;
- NSSA employee/employer contributions;
- allowances, benefits, deductions, loans, and arrears;
- pay periods and year-to-date totals;
- payroll approvals;
- payslips;
- statutory summaries and export;
- payroll-to-ledger posting;
- corrections and reversals; and
- secure retention.

Dependencies:

- qualified Zimbabwean payroll/accounting review;
- reliable statutory source and update process;
- comprehensive deterministic test cases;
- segregation of duties;
- strict access to employee data; and
- approved legal/privacy treatment.

Do not claim automated PAYE or NSSA compliance before verification.

## 6. English, ChiShona, and isiNdebele

VAKA must support:

- English;
- ChiShona; and
- isiNdebele.

Requirements:

- native-reviewed catalogues;
- user language selection;
- tenant default;
- English fallback;
- translated onboarding, navigation, help, errors, notifications, documents, and accessibility labels;
- approved business, finance, payroll, and compliance terms;
- mobile text-expansion support; and
- language-specific VAKA AI evaluation.

Language choice must not change permissions, functionality, or service quality.

## 7. Offline resilience

VAKA must remain useful under intermittent or expensive connectivity.

Offline capability must be defined per workflow:

### Safe to cache/read

- product catalogue;
- recent customer list;
- approved price list;
- help content; and
- selected dashboard summaries with timestamp.

### Candidate offline writes

- POS sales;
- stock counts;
- field activities;
- draft orders; and
- draft customer records.

### High-risk operations

- financial posting;
- payroll finalisation;
- permissions;
- exchange-rate changes;
- stock adjustment; and
- statutory submission.

High-risk actions need careful queue, idempotency, conflict, confirmation, and audit rules. “Offline” must never mean silently losing or duplicating transactions.

## 8. Mobile-first usage

Core workflows must work on common mobile devices:

- onboarding;
- customer lookup;
- pipeline updates;
- quotations/orders;
- invoices and payment status;
- stock lookup and count;
- POS;
- approvals;
- dashboard/alerts;
- support; and
- data export where practical.

Requirements:

- touch targets;
- readable type;
- low payloads;
- responsive tables;
- camera/barcode integration where approved;
- clear loading/retry/offline states;
- accessible keyboard/input behavior; and
- testing on modest Android devices and variable networks.

## 9. WhatsApp-friendly onboarding and support

WhatsApp is an important communication channel, but it must be used responsibly.

Requirements:

- clear entry from website/onboarding;
- approved business account/provider;
- consent and opt-out;
- minimal personal/business data in messages;
- no passwords, tokens, or sensitive financial/payroll information;
- secure deep links back into VAKA;
- onboarding checklists;
- support case reference;
- escalation to human support;
- templates approved for tone and language;
- English, ChiShona, and isiNdebele support plan; and
- message delivery/audit status where needed.

WhatsApp must not become the system of record.

## 10. Local business workflows

Research and support:

- cash and bank transfer realities;
- USD/ZiG pricing;
- quotations and pro forma documents;
- customer credit and partial payments;
- informal-to-formal record migration;
- WhatsApp-originated customer conversations;
- owner-managed approvals;
- multiple branches and warehouses;
- supplier purchasing and goods receipt;
- stock shortages and substitutions;
- diaspora ownership/remote oversight;
- month-end reporting;
- tax evidence;
- employee advances and deductions; and
- local document terminology.

Product decisions require user research rather than assumptions.

## 11. Trust, legal, and data protection

Zimbabwe launch requires:

- applicable data-protection assessment;
- clear privacy and data-processing terms;
- access permissions;
- tenant isolation;
- audit logs;
- backup and tested recovery;
- incident response;
- retention and deletion;
- data export;
- support ownership;
- secure hosting and cross-border transfer review; and
- accurate regulatory claims.

Qualified Zimbabwean legal/security review is required.

## 12. Payments and banking

Architecture should support adapters for:

- bank transfers;
- card payments;
- mobile money;
- local payment gateways;
- statement imports;
- reconciliation formats; and
- payment references.

Providers must be selected and reviewed separately. Do not make generic integration claims.

## 13. Zimbabwe country pack

The Zimbabwe country pack should contain:

- `ZW` country identifier;
- supported languages;
- USD and ZiG/ZWG currency configuration;
- tax identifiers and VAT configuration;
- chart-of-accounts template;
- statutory document fields;
- payroll rule pack;
- ZIMRA adapter configuration;
- bank/payment adapters;
- address and phone formats;
- document terminology;
- legal/resource links;
- support channels;
- retention settings; and
- effective dates/version history.

## 14. Africa expansion requirements

Core platform behavior must avoid assuming that all African markets share:

- Zimbabwean currencies;
- VAT rules;
- ZIMRA;
- PAYE/NSSA;
- English/Shona/Ndebele;
- address formats;
- banks/payment providers;
- payroll calendars;
- invoice requirements; or
- data-protection rules.

New markets require their own country packs, professional review, pilot customers, support operations, and go-live approval.

## 15. Launch evidence

Before Zimbabwe production launch, VAKA should demonstrate:

- tested core trade cycle;
- reviewed accounting/VAT behavior;
- tested tenant isolation;
- secure authentication and roles;
- backup restoration;
- reliable USD/ZiG handling;
- mobile acceptance;
- localisation fallback;
- honest payroll/AI availability labels;
- onboarding/support process;
- legal/privacy readiness; and
- monitored production operations.
