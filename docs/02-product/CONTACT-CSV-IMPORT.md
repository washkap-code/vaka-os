# Self-Service CSV Imports

**Status:** Contact and product catalogue slices implemented
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

- opening stock with warehouse mapping, approval, valuation and balanced
  opening-equity reconciliation;
- bank CSV and structured statement formats;
- draft invoices, bills and expenses;
- XLSX mapping;
- mobile document capture/OCR; and
- API, email and assisted migration channels.
