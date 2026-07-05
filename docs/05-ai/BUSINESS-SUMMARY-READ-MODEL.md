# VAKA Business Summary Read Model

**Status:** Implemented foundation — deterministic, no AI model
**Owner:** Engineering, Product, and Security
**Last reviewed:** 2026-07-05

## 1. Purpose

`get_business_summary` is the first provider-independent foundation for VAKA AI. It produces bounded, permission-scoped, source-linked business context using existing VAKA records and deterministic database calculations.

It does **not**:

- call an AI provider;
- accept prompts;
- generate recommendations;
- write business records;
- use conversational memory;
- run proactively; or
- authorise future AI access automatically.

## 2. Endpoint

```text
GET /api/v1/ai/read-models/business-summary
```

Authentication and the existing tenant lifecycle gate apply.

The endpoint requires `reports.read`. Additional sections use the caller’s existing permissions:

| Section | Permission |
|---|---|
| Financial performance | `reports.read` |
| Receivables | `accounting.read` |
| Inventory attention | `inventory.read` |
| Pipeline attention | `crm.read` |

An unavailable optional section returns `PERMISSION_REQUIRED`. It is never represented as zero or empty activity.

## 3. Query

Optional ISO date parameters:

- `from`
- `to`

Rules:

- `from` must not be after `to`;
- the period may not exceed 366 days; and
- the default is the beginning of the current UTC month through generation time.

## 4. Contract

The response includes:

- schema version and stable kind;
- generation timestamp;
- server-derived tenant and actor IDs;
- tenant base currency;
- period and `Africa/Harare` presentation time zone;
- freshness metadata;
- explicit limitations;
- financial performance;
- receivables totals by currency and bounded overdue items;
- bounded low-stock items; and
- bounded pipeline totals by stage and currency.

Money is represented as exact two-decimal strings. Stock quantity is represented as an exact three-decimal string.

## 5. Trust boundaries

- Tenant ID is derived from the authenticated request.
- Every SQL query filters by tenant.
- Contact joins require matching invoice and contact tenant IDs.
- No tenant ID is accepted from the query.
- The endpoint performs no mutation except a data-minimised audit event.
- No raw business summary content is written to the audit log.
- No provider credentials or AI dependencies are present.

## 6. Source and calculation basis

### Financial performance

Calculated from posted journal entries and ledger lines for the selected period in the tenant’s base currency.

### Receivables

Calculated from current issued and partially paid invoices. Totals remain separated by invoice currency.

### Inventory attention

Calculated from current stock-level records and product reorder levels.

### Pipeline attention

Calculated from current non-won/non-lost deals, grouped by stage and currency.

## 7. Known limitations

- This is a current-state context contract, not an AI interpretation.
- Receivables, inventory, and pipeline are evaluated at generation time rather than reconstructed historically.
- Financial values rely on existing ledger correctness and database numeric aggregation.
- The current implementation identifies the presentation time zone but does not yet accept a tenant-specific time zone.
- Section permissions reuse existing module permissions; a dedicated AI permission remains a later migration decision.
- The endpoint is not yet connected to a user interface or model gateway.

## 8. Tests

The synthetic integration suite covers:

- exact financial and receivables values;
- source record identifiers;
- bounded inventory and pipeline data;
- cross-tenant non-disclosure;
- section-level permission behaviour;
- endpoint permission denial;
- invalid and overlong periods; and
- data-minimised audit logging.

## 9. Next step

Run the read-model suite in a reproducible PostgreSQL test environment and resolve all failures. Then create the provider-independent evaluation dataset and scoring harness.

Do not connect a model until tenant isolation, permissions, exactness, bounds, and audit tests pass.
