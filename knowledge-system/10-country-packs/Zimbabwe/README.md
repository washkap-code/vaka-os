# Country Pack — Zimbabwe (ZW)

**Status:** Launch market · Active
**Owner:** Product + Zimbabwe Market Operations
**Authoritative requirements:** `docs/02-product/ZIMBABWE-FIRST-REQUIREMENTS.md`
**Architecture standard:** `docs/03-technical/LOCALISATION.md`

Zimbabwe is VAKA's first market and the reference implementation for the country-pack framework. Everything here must be expressible as configuration so the next countries (South Africa, Zambia, Botswana, …) are additive, never rewrites.

## 1. Currency

| Item | Value |
|---|---|
| Currencies | USD, ZiG (technical code **ZWG**) |
| Customer-facing label | **ZiG** (never expose "ZWG" or "tenant" to customers) |
| Money representation | Exact integer cents; per-transaction exchange-rate snapshots |
| Reporting | Base currency with original-currency traceability |

Implemented in the live product (tenant base currency, dual-currency workflows, rate snapshots).

## 2. Tax

| Item | Value | Status |
|---|---|---|
| VAT standard rate | 15% (effective-dated, configurable — never hard-coded) | Live as ledger accounts; accountant sign-off pending |
| VAT treatments | Standard, zero-rated, exempt | Framework required |
| Tax authority | ZIMRA | Fiscalisation integration is Phase 3 |
| Company identifiers | BP number, VAT number | Fields live on tenant + customers |

## 3. Payroll (not live — Coming Soon everywhere it appears)

- PAYE (ZIMRA tax tables, effective-dated)
- NSSA contributions
- Must not ship without a Zimbabwean accountant's sign-off (`docs/02-security-compliance.md`)

## 4. Data protection & compliance

| Obligation | Reference |
|---|---|
| Cyber and Data Protection Act [Ch 12:07] — POTRAZ registration, DPO | Security & compliance doc |
| Cross-border transfer notification (encrypted off-site backups) | Deployment doc |
| Data subject rights (access, correction, deletion, export) | Live export endpoints + audit trail |
| Breach response | Incident-response plan required before launch |

## 5. Banking & payments

- Bank statement CSV import (generic compatibility layer) — live
- Bank reconciliation (worksheets, matching, sign-off) — live
- Zimbabwean payment providers, payment links, settlements — planned (`docs/02-product/ZIMBABWE-PAYMENTS-INTEGRATION.md`)
- Contracted read-only bank feeds — planned, per-bank

## 6. Languages

| Language | Status |
|---|---|
| English | Live |
| ChiShona | Native-speaker review in progress |
| isiNdebele | Native-speaker review in progress |

## 7. Black Book seeds (future)

ZIMRA · POTRAZ · RBZ · NSSA · PRAZ · Registrar of Companies · local authorities. To be populated when the Black Book programme opens.

## 8. Expansion rule

Any Zimbabwe-specific behaviour found hard-coded in core modules is a defect against this pack. Raise a mission to move it into configuration. Mission **P2-001** defines the extraction of the country-pack engine.
