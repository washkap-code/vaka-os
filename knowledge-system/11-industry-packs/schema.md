# Industry Pack seed data contract (IND-000)

## Purpose

This directory contains human-reviewed industry knowledge seeds for VAKA OS
industry packs. It follows the PB-000 Black Book dataset pattern: versioned
JSON records, official sources, `lastReviewed` dates, and a
declared-not-guessed evidence discipline. The seed is research and product
input, not professional, legal, tax, licensing, or regulatory advice.

Industry packs do NOT duplicate Black Book content. Regulatory facts live in
`knowledge-system/10-country-packs/<Country>/black-book/`; industry packs
reference those records by ID.

## File layout

Each industry lives at `Zimbabwe/<industry>/` and contains exactly:

- `profile.json` — one `industry_profile` record
- `regulatory-map.json` — `industry_regulatory_link` and `industry_gap` records
- `workflows.json` — `industry_workflow` records
- `kpis.json` — `industry_kpi` records
- `glossary.json` — `industry_term` records
- `sources.json` — the per-industry source register (not entity records)

Every data file's root value is a JSON array.

## Common record fields

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `id` | string | Yes | Globally unique, stable, lowercase kebab-case. Prefix: `zw-<industry>-`. |
| `name` | string | Yes | Human-readable name. |
| `category` | enum | Yes | One of `industry_profile`, `industry_regulatory_link`, `industry_gap`, `industry_workflow`, `industry_kpi`, `industry_term`, matching the containing file. |
| `industryId` | string | Yes | The owning industry profile ID (equals `id` on the profile record itself). |
| `assertionType` | enum | Yes | `external_fact` (a claim about the world) or `product_design` (an internal design assertion about what the ERP should support). |
| `verified` | boolean | Yes | `true` only for an `external_fact` whose claim is directly supported by the recorded facts of the referenced Black Book records or by a cited official HTTPS source. `product_design` and `industry_gap` records must be `false`. |
| `sources` | string array | Yes | Absolute HTTPS URLs. May be empty only when `verified` is `false`. |
| `lastReviewed` | string | Yes | ISO date (`YYYY-MM-DD`) of the human review of THIS record. |
| `notes` | string or null | Yes | Scope, ambiguity, or evidence-gap warning. Never an inferred fee, threshold, or deadline. |

## Source inheritance rule

Where a record's evidence is the recorded content of a Black Book record, the
source URLs are copied from that record and the note must state that they were
inherited from the Black Book dataset (its own `lastReviewed` applies) and not
independently re-fetched in this revision. A linkage claim may be
`verified: true` only when the referenced Black Book record's own recorded
facts (for example its `appliesTo`, `dueRule`, or category) directly support
the applicability statement.

## Category-specific fields

### `industry_profile`

| Field | Type | Rules |
| --- | --- | --- |
| `definition` | string | Descriptive product-design definition; classification alignment is recorded separately. |
| `subSectors` | array of `{name, description}` | Product-design segmentation, not an official taxonomy. |
| `typicalBusinessSizes` | array of `{tier, description}` | Qualitative tiers. |
| `officialSizeThresholds` | evidence field | PB-000C-style `{status, value, sources, note}`. `unverified` ⇒ `value: null`, empty `sources`, explanatory `note`. |

### `industry_regulatory_link`

| Field | Type | Rules |
| --- | --- | --- |
| `obligation` | string | Plain-language statement of what applies. |
| `obligationKind` | enum | `FORMATION`, `TAX`, `EMPLOYER`, `LOCAL_AUTHORITY`, `SECTOR_LICENCE`, `ENVIRONMENT`, `PROCUREMENT`, `ASSOCIATION`, `OVERSIGHT`. |
| `appliesWhen` | string | Trigger/scope in plain language. |
| `blackBook` | object | Optional keys: `authorityIds`, `licenceTypeIds`, `complianceEventIds`, `complianceGuideIds`, `serviceIds`, `tenderPortalIds`, `associationIds`, `utilityIds`. Every ID must resolve in the Zimbabwe Black Book dataset. |

### `industry_gap`

An obligation or authority believed relevant to the industry that is NOT yet
represented in the Black Book. Always `verified: false`. Fields: `description`
(what is missing and why it is a candidate), `proposedBlackBookCategory`, and
an optional `blackBook.authorityIds` pointing at existing related authorities.
A gap record declares a research item; it asserts no fee, form, or deadline.

### `industry_workflow`

`product_design`. Fields: `description`, `stages` (string array),
`erpCapabilities` (string array of VAKA capability names), `relatedKpiIds`
(must resolve to `industry_kpi` records in the same industry).

### `industry_kpi`

`product_design`. Fields: `definition`, `formula` (plain text), `unit`,
`direction` (`HIGHER_IS_BETTER`, `LOWER_IS_BETTER`, `CONTEXT`),
`erpDataSource` (plain text).

### `industry_term`

Fields: `definition`, optional `blackBook` references as above. Statutory or
authority terms supported by Black Book sources may be `external_fact` /
`verified: true`; trade vernacular is `product_design` / `verified: false`.

## Per-industry `sources.json`

Array of register entries: `{id, domain, publisher, publisherType,
inheritedFromBlackBook, usedByRecordIds, note, lastChecked}`. Every source URL
cited by that industry's records must belong to a registered domain.

## Validation

`validate.mjs` in this directory enforces, per the PB-001 checks adapted for
industry packs:

1. Every file parses as JSON with an array root.
2. Required common fields present; category matches the containing file.
3. IDs globally unique across all industry packs.
4. Every Black Book reference resolves against
   `knowledge-system/10-country-packs/Zimbabwe/black-book/data/` with the
   correct category class.
5. Every source URL is absolute HTTPS; `verified: true` requires at least one.
6. `lastReviewed` is a valid ISO calendar date.
7. `product_design` and `industry_gap` records are `verified: false`.
8. `relatedKpiIds` resolve; evidence fields follow PB-000C invariants.
9. Every cited URL's domain is present in that industry's `sources.json`.
