# VAKA Self-Service Imports and Document Capture

**Status:** Approved product direction; implementation pending
**Owner:** Product, Engineering, Security, Finance, and Data
**Last reviewed:** 2026-07-05

## Outcome

Authorised users must be able to move existing business information into VAKA
without developer or database intervention. Imports must remain tenant-isolated,
auditable, recoverable and safe for financial and stock records.

## Import channels

VAKA should support:

- CSV, TSV and XLSX with downloadable templates;
- copy-and-paste tables;
- JSON and authenticated APIs;
- bank formats including OFX/QFX, MT940 and ISO 20022 camt.053 where supported;
- PDF and image invoices, receipts, statements and business cards;
- iOS/Android camera and file capture;
- product barcode and QR scanning;
- email-forwarded attachments to a tenant-specific address;
- approved cloud-file providers;
- webhooks and secure scheduled transfer for advanced packages; and
- assisted migration by authorised VAKA or Professional Partner teams.

Support for a channel does not allow uncertain data to post automatically.

## Record types

Initial self-service scope:

- customers, suppliers and contacts;
- products, services, SKUs, barcodes and prices;
- CRM opportunities and tasks;
- opening stock through a controlled workflow;
- draft invoices, bills and expenses;
- bank statement lines; and
- company, branch and approved-user setup.

Opening financial balances, historical journals, payroll, tax submissions and
posted transactions require stronger permissions, reconciliation, approval and
professional review.

## Standard workflow

1. Choose a record type and template/source.
2. Upload into tenant-scoped quarantine storage.
3. Validate file type, size, malware risk and structure.
4. Propose field mappings and require user review.
5. Parse into staging, never directly into authoritative tables.
6. Show valid rows, warnings, errors and possible duplicates.
7. Require confirmation or approval.
8. Process idempotently and transactionally where practical.
9. Produce a result report and audit trail.
10. Permit rollback before posting or controlled reversals afterwards.

## Mobile capture

The mobile apps should provide:

- edge detection, crop, rotation and quality guidance;
- multi-page invoice, receipt and statement capture;
- business-card capture into proposed contacts;
- supplier invoice/receipt capture into draft bills or expenses;
- barcode/QR product lookup, stock count and receiving;
- encrypted offline capture with safe retry; and
- duplicate detection using source fingerprints and business identifiers.

The original document should be retained immutably where policy permits.

## Parsing, OCR and AI

Extraction may use deterministic parsers, OCR and approved AI providers. Output
is a proposal, not an accounting fact.

Extract names, contact details, document numbers, dates, currency, subtotal,
tax, total, line items, identifiers, payment references and addresses where
available. Preserve values and identifiers exactly, retain field confidence,
and send low-confidence or inconsistent results to human review.

## Data quality and safety

- Save reusable mappings per tenant and source.
- Handle locale-specific dates, decimals, currencies and encodings.
- Preserve source row number and original value.
- Detect duplicates with explainable rules; never merge silently.
- Prevent spreadsheet formula injection.
- Use signed, short-lived upload access and encrypted storage.
- Tenant-scope files, staging rows, jobs, previews, logs and exports.
- Exclude secrets and unnecessary personal data from logs and OCR/AI providers.
- Record parser/model version, consent, retention and provenance.

## Permissions

Introduce granular permissions such as:

- `imports.read`, `imports.create`, `imports.approve`, `imports.rollback`;
- `documents.capture`, `documents.review`;
- `contacts.import`, `products.import`, `inventory.opening_import`; and
- `bank_statements.import`.

Uploading does not grant approval or posting authority. Package entitlements
and user permissions remain separate.

## Import batch record

Each batch stores tenant/user, record type, source, file hash, parser/mapping
versions, row counts, created records, approval state, idempotency key, error
report, rollback/reversal state and audit references.

## Implementation order

1. Import batch, staging, source-file and audit schemas.
2. Secure storage, scanning and idempotent jobs.
3. Generic CSV mapping and preview.
4. Contacts and products import.
5. Opening stock and bank CSV workflows.
6. Draft invoice, bill and expense document capture.
7. Mobile camera, barcode and offline capture.
8. XLSX and structured bank adapters.
9. Email, API, webhook, cloud-file and partner channels.

## Acceptance criteria

- Supported imports require no developer intervention.
- Malicious or invalid files create no partial authoritative writes.
- Retry does not duplicate records.
- OCR results remain drafts until reviewed.
- Restricted records require appropriate approval.
- Cross-tenant file, staging and result access is impossible.
- Every batch has a result and audit trail.
- Mobile capture works under constrained connectivity with safe retry.

