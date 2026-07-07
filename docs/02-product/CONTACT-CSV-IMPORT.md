# Self-Service CSV Imports

**Status:** Contact, product, opening-stock and generic bank CSV slices implemented
**Owner:** Product, Engineering, Security, and Data
**Last reviewed:** 2026-07-06

## Available workflow

Authorised tenant Owners and Administrators can:

1. open **Imports**;
2. select a contacts CSV of up to 1 MB and 5,000 rows;
3. preview row-level validation results;
4. review possible duplicates and invalid rows; and
5. explicitly approve the valid rows for import.

Supported headings include name/company name, email, phone, type, customer,
supplier/vendor, address, tax number and semicolon-separated tags.

Authorised Owners and Administrators can use the same staged workflow for
products and services. Supported headings include SKU, name, description, unit
of measure, cost and sale price, USD/ZWG currency, tax rate, reorder level,
stock tracking and active status.

Product imports create catalogue records only. They deliberately do not create
opening quantities, warehouses, stock movements or accounting entries.

Opening-stock CSVs can then map existing SKUs to existing warehouses with a
positive quantity and unit cost in the workspace base currency. Approval:

- refuses products or locations with existing stock;
- requires one consistent unit cost per product across locations;
- creates append-only `OPENING` stock movements;
- updates the product cost used by the current simple-costing model;
- debits Inventory and credits Opening Balance Equity in one balanced journal;
- commits stock, product cost, journal and audit evidence atomically; and
- cannot be replayed.

Owners and Administrators can also register a tenant-owned bank account using a
masked identifier and import a generic bank CSV with date, description, signed
amount and optional reference columns. Debit/credit column pairs are also
supported. These imports:

- normalise exact signed amounts and supported statement dates;
- derive a deterministic per-account duplicate key;
- stage invalid and duplicate rows for review;
- create an unreviewed bank feed only; and
- never post a journal, mark an invoice paid or initiate a payment.

The generic parser is not a claim that every Zimbabwean bank export is already
supported. Bank-specific profiles require consented sample files and pilot
validation.

Positive imported bank lines can also be matched to open customer invoices when
the currency matches. A single line can be matched to one invoice as an exact
or partial payment, or split across multiple invoices when the allocation total
equals the bank line exactly. Approval creates normal invoice payments, posts
deterministic payment journal evidence, links the bank line to that journal
entry, and records audit evidence. The bank account page also shows a read-only
summary of imported lines, matched/unreviewed counts and signed movement
totals, plus a worksheet preview that compares a user-entered statement date
and closing balance against VAKA's imported bank movement. Users can save that
worksheet as a prepared reconciliation report, and approval is blocked unless
the report is balanced with no unreviewed bank lines. Negative bank lines can
now be posted as bank fees by authorised users, creating a Bank Charges & IMTT /
Bank journal entry and audit evidence. Internal transfers, refunds and PDF
reconciliation packs remain later adapters.

## Controls

- The CSV is parsed server-side and staged before writes.
- Files with malformed quotes or unsafe limits are rejected.
- Formula-like values and malformed emails are rejected.
- Existing and within-file duplicate names/emails are skipped.
- Existing and within-file duplicate product SKUs are skipped.
- Prices, tax rates, currencies, reorder levels and product flags are validated.
- Only `VALID` rows can be committed.
- Commit is tenant-scoped, transactional and cannot be replayed.
- Preview and completion create audit evidence.
- Invalid and duplicate rows remain in the batch history.
- The import never grants additional permissions.

## Next adapters

This batch/staging foundation should next be extended to:
- bank-specific CSV profiles and structured statement formats;
- draft invoices, bills and expenses;
- XLSX mapping;
- mobile document capture/OCR; and
- API, email and assisted migration channels.
