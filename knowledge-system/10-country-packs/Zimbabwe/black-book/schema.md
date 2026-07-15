# Zimbabwe Black Book seed data contract

## Purpose

This directory contains the human-reviewed seed data for Zimbabwe's Black Book. PB-001 may import these records into the platform registry, but this repository data remains the reviewable source package.

The seed is a directory, not professional, legal, tax, licensing, or regulatory advice. Requirements, forms, fees, office details, and institutional mandates can change. Product experiences using this data must display the source and review date and direct users to the relevant authority for current requirements.

## File layout

Each file in `data/` is a JSON array containing exactly one category:

- `government_organisations.json`
- `regulators.json`
- `local_authorities.json`
- `utilities.json`
- `tender_portals.json`
- `business_associations.json`
- `licence_types.json`
- `services.json`

## Entity types

The `category` value must be one of:

| Category | Meaning |
| --- | --- |
| `government_organisation` | A ministry, department, office, legislature, or other public body. |
| `regulator` | A public authority that regulates, supervises, licenses, registers, or enforces a sector or statutory obligation. |
| `local_authority` | An urban or local council responsible for municipal administration and services. |
| `utility` | A public or state-owned provider of electricity, water, telecommunications, postal, or related network services. |
| `tender_portal` | A public procurement or tender-notice portal operated by a public entity. |
| `business_association` | A membership body, chamber, confederation, or union representing businesses or employers. |
| `licence_type` | A licence, permit, registration, or regulatory certificate a business may need. |
| `service` | A discrete service, registration, application, lookup, or transaction offered by another directory entity. |

## Record fields

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `id` | string | Yes | Globally unique, stable, lowercase kebab-case identifier. Do not recycle an ID for another entity. |
| `name` | string | Yes | Official or source-supported public name. |
| `category` | enum string | Yes | One of the eight entity types above and consistent with the containing file. |
| `parentId` | string | No | ID of a related parent, issuing authority, operator, or service owner in this dataset. Omit when the relationship is uncertain. |
| `website` | string | No | Canonical HTTPS website or service page. |
| `phones` | string array | No | Published organisational phone numbers copied from an official source. Do not infer or reformat uncertain numbers. |
| `emails` | string array | No | Published organisational email addresses copied from an official source. Do not infer an address from a domain. |
| `physicalAddress` | string | No | Published physical address. Do not combine fragments from different sources. |
| `city` | string | No | City explicitly associated with the entity or address. |
| `services` | string array | No | IDs from `services.json`. References must resolve to existing records. |
| `verified` | boolean | Yes | `true` only when at least one URL in `sources` is an official source that supports the entity's identity and recorded facts. |
| `sources` | string array | Yes | Absolute HTTPS source URLs. Use the most direct official page available. An unverified record may use an empty array or retain clearly identified discovery sources for later review. |
| `lastReviewed` | string | Yes | ISO 8601 calendar date (`YYYY-MM-DD`) for the most recent human source review. |
| `notes` | string | No | Concise scope, ambiguity, or freshness warning. Do not place unverified contact details or professional advice here. |

## Verification semantics

`verified: true` means that the entry's identity and the facts recorded in that entry were corroborated against an official source on `lastReviewed`. It does not mean that every service requirement, fee, form, processing time, office hour, or contact channel has been independently guaranteed.

Verification must be downgraded to `false` when:

- the only source is a news report, commercial intermediary, search result, social-media repost, or community directory;
- the official source no longer resolves or no longer supports the recorded identity;
- two official sources conflict and the conflict cannot be resolved; or
- a material fact in the record was inferred rather than published.

## Relationship rules

- IDs are global across every category file.
- Every `parentId` must resolve to an existing record.
- Every value in `services` must resolve to a `service` record.
- A service's `parentId` identifies the body that owns or delivers that service.
- A licence type's `parentId` identifies its issuing or administering authority.
- Omit a relationship instead of guessing it.

## Example

```json
{
  "id": "example-authority",
  "name": "Example Authority",
  "category": "regulator",
  "website": "https://example.gov.zw/",
  "services": [
    "example-registration-service"
  ],
  "verified": true,
  "sources": [
    "https://example.gov.zw/about/"
  ],
  "lastReviewed": "2026-07-15",
  "notes": "Example only; not a seed record."
}
```

## PB-001 import validation

Before importing a revision, PB-001 should reject the full batch when any of these checks fail:

1. Every file parses as JSON and its root value is an array.
2. Every record contains `id`, `name`, `category`, `verified`, `sources`, and `lastReviewed`.
3. Every category matches both the allowed enum and the containing file.
4. Every ID is unique globally and every relationship resolves.
5. Every `verified: true` record contains at least one official HTTPS URL in `sources`.
6. Every `lastReviewed` value is a valid ISO calendar date.
7. No unknown field is silently accepted; schema changes require review and versioned migration.

Importers should preserve source URLs and review dates, record the dataset revision, and make changes auditable. A failed import must leave the existing registry unchanged.
