# VAKA Invoice Delivery and Receivables Specification

**Status:** Issued-document snapshot foundation implemented; rendering and delivery pending
**Owner:** Product, Finance, and Engineering
**Last reviewed:** 2026-07-05

## 1. Outcome

Help an authorised business user create a trustworthy invoice, present it under
the company’s identity, deliver it to the correct customer, and understand
which receivables require attention.

This specification does not declare delivery, PDF generation, managed logo
upload, or the Customer Portal live. Repository inspection found those
capabilities incomplete.

## 2. Users and journeys

### Business user

An authorised VAKA workspace user must be able to:

1. create and preview an invoice;
2. issue it through the existing deterministic accounting workflow;
3. download a branded PDF;
4. send it to an approved customer email address;
5. see delivery status without treating delivery as payment;
6. resend or download the exact issued version; and
7. see overdue exposure and ageing priorities on the dashboard.

Creating, issuing, sending, voiding, and recording payment are distinct
actions. Sending must not silently issue a draft or alter accounting records.

### Customer

A customer recipient should be able to open a secure, expiring or revocable
link, view the invoice, and download its PDF without gaining access to any
other customer or tenant record. A fuller authenticated Customer Portal may
later add statements, payment status, and preferences.

## 3. Current implementation

| Capability | Current status |
|---|---|
| Create invoice draft | Working foundation |
| Issue invoice and post accounting/stock effects | Working foundation |
| Record payment and void | Working foundation |
| Aged receivables report | Working foundation |
| Dashboard outstanding/overdue totals | Partial |
| Currency-safe dashboard ageing analysis | Implemented foundation; pending release verification |
| Company logo field and branding update API | Partial; URL only |
| Managed logo upload | Missing |
| Immutable issued invoice-document snapshot | Implemented foundation |
| Branded invoice template | Pending renderer |
| PDF generation/download | Missing |
| Invoice email delivery and delivery history | Missing |
| Secure customer invoice link/portal | Expiring/revocable PDF link foundation implemented; fuller portal missing |

## 4. Invoice document requirements

An issued invoice document must include, subject to Zimbabwean professional
review:

- company name, approved logo, physical address, registration details, tax
  number, and VAT number where applicable;
- customer name and billing details;
- immutable invoice number;
- issue date, due date, status, and currency;
- line descriptions, quantities, unit prices, tax, subtotals, and total;
- payment instructions when configured;
- notes and approved terms;
- a clear VAKA-powered attribution policy where required; and
- a stable document/template version.

Financial values must come from authoritative invoice records. PDF or email
templates must never recalculate ledger values independently.

## 5. Branding and logo upload

Users with `settings.manage` may upload or replace the company logo.

The upload service must:

- accept an allow-list of safe raster/vector formats defined by Security;
- validate file signatures rather than trusting extensions or MIME headers;
- enforce file-size and image-dimension limits;
- remove unsafe metadata and reject active content;
- store assets under tenant-scoped, non-guessable keys;
- prevent one tenant from reading or replacing another tenant’s asset;
- provide a fallback when an asset is unavailable;
- preserve accessible contrast and semantic status colours; and
- audit upload, replacement, and removal.

Arbitrary remote logo URLs are not the target production design. Existing URL
support must be migrated safely after the managed asset path is proven.

Issued documents must preserve the branding and legal identity applicable when
they were issued. Later logo or company-detail changes must not silently alter
historical evidence. This may use an issued-document snapshot, a versioned
render record, or an immutable stored PDF; the technical design must select and
test one approach.

## 6. PDF generation and download

- PDF generation occurs server-side from a versioned template.
- The service uses tenant-scoped invoice data and stored branding only.
- Authorisation is checked for every generation and download.
- Generated files use deterministic, safe filenames.
- Responses use appropriate content type, disposition, cache, and security
  headers.
- Sensitive documents are not exposed through permanent public URLs.
- Generation failure does not change invoice or delivery status.
- Downloads and material regeneration are auditable.
- A suspended tenant retains invoice download through the approved read/export
  policy.
- English is the initial reviewed document language; Shona and Ndebele
  templates remain disabled until terminology and layouts are professionally
  reviewed.

## 7. Sending and delivery

The first provider-managed delivery channel should be email through an approved
adapter. Until that provider is configured, VAKA supports a user-controlled
fallback: an authorised user may generate one expiring invoice link and open
their own email client or WhatsApp share screen with the link prefilled. This
does not claim provider delivery, receipt, consent capture, or payment.

Authorised users can review the invoice's share-link history in the workspace,
see whether a link has been viewed or has expired, and revoke active links.
The token itself is never returned by the management endpoint.

Sending requires:

- `accounting.post` or a future narrower `invoices.send` permission;
- an issued or partially paid invoice;
- an explicit recipient preview and user confirmation;
- server-side recipient validation;
- idempotency protection against duplicate submission;
- a transactional outbox or equivalent reliable handoff;
- delivery states such as queued, sent-to-provider, delivered where supported,
  bounced, and failed;
- retry limits and clear operator/user recovery;
- an audit trail containing actor, invoice, recipient reference, template
  version, channel, time, and result without unnecessary message content; and
- no claim that a customer received or paid an invoice merely because a
  provider accepted a message.

## 8. Dashboard ageing analysis

The dashboard must show:

- current, 1–30, 31–60, 61–90, and 90+ day buckets;
- total outstanding and total overdue;
- the customers and invoices contributing most to overdue exposure;
- links to the underlying authorised records;
- an explicit as-at date; and
- helpful empty, loading, error, and stale-data states.

USD and ZWG amounts must never be added without conversion. The default view
must keep buckets separated by currency. A base-currency view may be offered
only when every included invoice has an appropriate historical rate and the UI
clearly identifies the conversion basis. Calculations must use exact decimal
or integer-minor-unit arithmetic, not JavaScript floating point.

VAKA AI may later explain ageing and recommend follow-up. It must use the same
permission-scoped read model, cite the underlying invoices, preserve amounts
and identifiers exactly, and never send reminders without the required
approval.

## 9. Permissions, audit, and tenant isolation

At minimum:

- `accounting.read` controls invoice view and authorised PDF access;
- `accounting.post` controls draft, issue, send, payment, and void until
  narrower permissions are introduced;
- `reports.read` controls aggregate and item-level ageing analysis;
- `settings.manage` controls branding assets;
- customer links grant access only to one intended document/customer scope;
- every lookup includes tenant scope derived from authenticated server context;
  and
- issue, send, logo, download, void, and payment events follow the audit policy.

## 10. Localisation, accessibility, and mobile

- All new interface and document copy uses typed catalogues.
- Templates tolerate text expansion and launch-language characters.
- PDFs have a logical reading order and selectable text where the renderer
  supports it.
- Send/preview/download flows work at mobile, tablet, and desktop widths.
- Delivery status does not rely on colour alone.
- Dates, numbers, and currency follow the selected locale without changing
  stored values.

## 11. Safest implementation order

1. Correct the ageing read model for exact, currency-separated amounts and add
   regression tests.
2. Add typed dashboard copy and render ageing buckets/priorities responsively.
3. Define versioned invoice-document and branding snapshot contracts. **Implemented:** issue-time snapshot v1.
4. Add secure tenant-scoped logo storage behind an asset abstraction.
5. Build and test the server-side branded PDF renderer from the issue-time snapshot.
6. Add authorised preview and PDF-download controls.
7. Add delivery records and transactional outbox.
8. Integrate an approved email provider and confirmation UI.
9. Add secure customer document links with expiry and revocation. **Implemented foundation:** one-invoice PDF share links with opaque stored-hash tokens, 1–30 day expiry, revocation and audit evidence.
10. Extend into the authenticated Customer Portal, statements, and reviewed
    multilingual templates.

## 12. Acceptance criteria

- A permitted user can issue, preview, download, and send the correct branded
  invoice without duplicate accounting effects.
- The PDF matches authoritative values and the branding snapshot.
- Logo access is tenant-isolated and unsafe files are rejected.
- Delivery is confirmed, recoverable, idempotent, and audited.
- A customer link cannot expose another invoice, customer, or tenant.
- Dashboard ageing reconciles to invoice balances and remains currency-safe.
- Existing invoice issue, stock, journal, payment, void, and export behavior
  continues to pass.
- Responsive, accessibility, localisation, security, and failure-path checks
  pass.

## 13. Dependencies and unresolved decisions

- Approved object/file storage and malware/content-validation approach
- Approved email provider, sender-domain setup, and delivery webhook policy
- Zimbabwean accountant/tax review of invoice content
- Legal/privacy review of customer links, retention, and communications
- Document snapshot versus immutable rendered-file retention decision
- Narrow invoice-send permission and approval policy
- Customer identity/link revocation model
- Reviewed Shona and Ndebele financial terminology

No provider should be selected or production claim made until these decisions
are approved.
