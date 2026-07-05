# VAKA Zimbabwe Bank Connectivity Specification

**Status:** Approved product direction; bank/provider onboarding pending
**Owner:** Product, Finance, Engineering, Security, and Compliance
**Last reviewed:** 2026-07-05

## 1. Outcome

Allow a Zimbabwean business to bring bank transactions and statements into
VAKA safely, match them to invoices and accounting records, understand cash
position, and complete reconciliation with clear evidence.

Bank connectivity is not permission to move money. Read-only transaction feeds,
statement import, reconciliation, payment initiation, and payment approval are
separate capabilities with different controls.

## 2. Current market posture

Official material reviewed on 2026-07-05 confirms:

- Stanbic Zimbabwe Business Online offers statement access and describes
  integration with accounting systems.
- CBZ internet banking provides transaction statements, e-statement
  subscriptions, PDF statement saving, balances, references, debits, credits,
  and running balances.
- CBZ corporate banking supports controlled file upload, including CSV, for
  bank-facing workflows.
- ZB Bank exposes a documented payment gateway, but that is payment acceptance
  rather than proof of a general account-information API.

No universal, publicly documented Zimbabwe open-banking account-information
standard was verified during this review. VAKA must therefore support several
connection methods and enable only those contractually approved for each bank.

## 3. Connection methods

### Method A — Statement file import

This is the recommended first release.

- Accept bank-exported CSV first.
- Add OFX/QFX, MT940, CAMT.053, or other formats only when a Zimbabwean bank
  actually provides them and fixtures are available.
- Accept PDF statements as a review-assisted fallback, not the preferred
  machine-readable source.
- Maintain versioned parser profiles by bank, account type, currency, and file
  version.
- Show a preview and validation report before import.
- Use a file fingerprint, account, date range, references, and transaction keys
  to prevent duplicates.
- Preserve the original file and parser/version evidence according to retention
  policy.

### Method B — Dedicated statement inbox

A tenant may receive or forward bank-issued e-statements to a VAKA-controlled
address after explicit setup.

- Do not request the user’s banking email password.
- Verify sender and attachment patterns without treating email identity as
  sufficient proof.
- Scan attachments for malicious content.
- Route unexpected formats and password-protected files to review.
- Do not auto-post accounting entries from an emailed statement.

### Method C — Contracted bank feed

Where a bank offers an approved API, SFTP, host-to-host, corporate-integration,
or managed file channel:

- complete commercial and security onboarding with the bank;
- use read-only transaction/account scope first;
- hold credentials server-side in encrypted tenant/provider secret storage;
- use incremental cursors, overlap windows, and idempotent ingestion;
- expose connection health, consent/scope, last successful sync, and
  reauthorisation state;
- reconcile feed totals to bank-provided balances/statements; and
- provide a per-bank kill switch and manual-import fallback.

### Method D — Regulated aggregator

An aggregator may be used only after verifying:

- authority to access each supported Zimbabwean bank;
- consent and credential model;
- licensing/regulatory posture;
- bank coverage and supported account/currency types;
- data accuracy, latency, retention, residency, and incident terms;
- webhook/signature and reconciliation contracts; and
- production references and exit/export capability.

VAKA must not use screen scraping, browser automation, SMS interception, or
stored internet-banking credentials as a shortcut.

## 4. Bank account model

Each connected/imported account must store:

- tenant-owned internal ID;
- bank/provider and connection method;
- masked account identifier;
- account name and type;
- currency, including USD or ZWG;
- opening/available/ledger balance semantics where supplied;
- last statement date and last successful sync;
- connection status and error state;
- consent/scope and credential reference, never raw credentials;
- import/feed provenance; and
- owner, reviewer, and audit timestamps.

USD and ZWG accounts remain separate. Transactions are never combined without
an explicit, evidenced exchange-rate treatment.

## 5. Statement and transaction ingestion

Normalised bank transactions should include:

- account and tenant;
- provider/source transaction ID where available;
- posted date and value date;
- exact amount and currency;
- debit/credit direction;
- description, reference, payer/payee data, and masked counterparty account
  where supplied;
- running balance where supplied;
- source file/feed, row/message reference, and parser/adapter version;
- import batch and idempotency key;
- match/reconciliation status; and
- created/reviewed timestamps.

Unknown fields should be preserved in bounded source metadata where useful, but
secrets and unnecessary personal data must not be retained.

## 6. Reconciliation workflow

1. Import or sync transactions into an unreviewed bank feed.
2. Validate opening/closing balance and statement continuity.
3. Suggest matches using exact currency and amount, reference, customer,
   invoice, date tolerance, and prior rules.
4. Distinguish one-to-one, one-to-many, many-to-one, partial, fee, transfer,
   refund, reversal, and unmatched cases.
5. Require review for ambiguous or policy-sensitive matches.
6. Post through deterministic accounting/payment services.
7. Mark reconciled only when the bank line and ledger effect are linked.
8. Preserve unmatched, excluded, reversed, and corrected history.
9. Produce a reconciliation report with opening balance, movements, closing
   balance, outstanding items, preparer, approver, and date.

Suggested matches are not authoritative. VAKA AI may explain or rank matches,
but deterministic rules and authorised users control posting.

## 7. Valuable bank-connected functionality

### Initial

- bank account dashboard and balance freshness;
- CSV statement import and parser preview;
- payment-to-invoice matching;
- expense and bank-fee categorisation suggestions;
- internal-transfer matching;
- bank reconciliation workspace;
- duplicate and statement-gap detection;
- cash-in/cash-out timeline;
- overdue invoice/payment reference matching;
- downloadable reconciliation reports; and
- mobile upload with review status.

### Later

- contracted automatic feeds;
- daily cash-position and cash-flow forecasting;
- expected-versus-actual collections;
- settlement reconciliation for EcoCash, Paynow, InnBucks, cards, and other
  approved providers;
- bulk payment-file export in a bank-approved format;
- beneficiary and payment initiation through contracted APIs;
- dual approval and payment-status tracking;
- treasury views across banks and currencies;
- anomaly alerts; and
- VAKA AI explanations grounded in reconciled data.

VAKA should begin read-only. Outbound bank payments require a separate threat
model, bank contract, step-up authentication, approval limits, segregation of
duties, fraud controls, and recovery design.

## 8. Mobile behavior

- Upload a bank-exported file from device storage.
- Capture a paper/PDF statement only as an assisted fallback.
- Display connection/sync freshness and exceptions.
- Review suggested matches and approve within role/amount limits.
- Receive privacy-safe notifications for failed sync, unreconciled items, or
  confirmed incoming payments.
- Never store bank credentials in the mobile app.
- Never permit offline final reconciliation or outbound payment release.

## 9. Permissions and approvals

Recommended permissions:

- `bank_accounts.read`;
- `bank_accounts.configure`;
- `bank_statements.import`;
- `bank_transactions.read`;
- `bank_transactions.match`;
- `bank_reconciliation.prepare`;
- `bank_reconciliation.approve`;
- `bank_payments.prepare`;
- `bank_payments.approve`; and
- `bank_connections.manage`.

Connection setup requires Owner or explicitly delegated Administrator authority,
MFA, and audit logging. Accountants may import, match, and prepare
reconciliations. A Finance Approver or Owner approves controlled exceptions and
future outbound payments. Auditors remain read-only.

## 10. Security controls

- Tenant-scope every connection, account, file, transaction, cache, job, secret,
  webhook, and reconciliation record.
- Encrypt provider credentials and separate secret access from ordinary
  application/database access.
- Scan and size-limit files; validate structure before parsing.
- Treat spreadsheet formulas, macros, external links, and malformed PDFs as
  hostile.
- Verify API/webhook signatures and certificate expectations.
- Use read-only consent/scope whenever possible.
- Support credential rotation, revocation, reauthorisation, and account
  disconnection without deleting imported evidence.
- Apply idempotency and overlap windows to prevent missed or duplicated lines.
- Redact account and counterparty data from logs and notifications.
- Audit import, sync, match, unmatch, exclusion, posting, reconciliation,
  configuration, export, and approval.

## 11. Implementation order

1. Define the bank account, import batch, transaction, match, and reconciliation
   contracts.
2. Build exact, tenant-scoped CSV import with a generic mapping preview.
3. Add fixtures/profiles for pilot banks based on real, consented sample exports.
4. Build duplicate, continuity, balance, and parser-validation tests.
5. Add reconciliation workspace and deterministic invoice/payment matching.
6. Add mobile file upload and review.
7. Pilot a dedicated e-statement inbox if customers need it.
8. Complete one contracted read-only bank feed proof with the strongest pilot
   partner.
9. Add aggregator/bank adapters only through the common contract.
10. Consider outbound payment initiation only after read-only reconciliation is
    proven and separately approved.

## 12. Acceptance criteria

- An authorised user imports a supported statement without duplicate lines.
- Opening/closing balances and transaction sums reconcile to the source.
- USD and ZWG remain exact and separated.
- Suggested matches are explainable, reviewable, reversible, and tenant-safe.
- Posting uses existing deterministic accounting/payment services.
- Cross-tenant account, file, transaction, and secret access fails safely.
- Unsupported/corrupt/malicious files fail without partial import.
- The original evidence and complete audit trail remain available.
- Mobile and web workflows handle loading, large files, retry, partial failure,
  accessibility, and localisation.

## 13. Official references

- Stanbic Zimbabwe Business Online:
  https://www.stanbicbank.co.zw/zimbabwe/business/ways-to-bank/business-online
- CBZ statement help:
  https://obdx.cbz.co.zw/webhelp/Content/obdx/retail/accounts/statement.htm
- CBZ corporate file-upload help:
  https://obdx.cbz.co.zw/webhelp/Content/obdx/fileupload/servicing/fileupload.htm
- ZB Smile&Pay developer documentation:
  https://smileandpay.zb.co.zw/documentation
