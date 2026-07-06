# Contact CSV Import

**Status:** First self-service import slice implemented
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

## Controls

- The CSV is parsed server-side and staged before writes.
- Files with malformed quotes or unsafe limits are rejected.
- Formula-like values and malformed emails are rejected.
- Existing and within-file duplicate names/emails are skipped.
- Only `VALID` rows can be committed.
- Commit is tenant-scoped, transactional and cannot be replayed.
- Preview and completion create audit evidence.
- Invalid and duplicate rows remain in the batch history.
- The import never grants additional permissions.

## Next adapters

This batch/staging foundation should be extended to:

- products and price lists;
- opening stock with approval and reconciliation;
- bank CSV and structured statement formats;
- draft invoices, bills and expenses;
- XLSX mapping;
- mobile document capture/OCR; and
- API, email and assisted migration channels.

