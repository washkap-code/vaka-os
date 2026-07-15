# PB-000 — Zimbabwe Black Book seed dataset

**Status:** Approved for implementation
**Priority:** Wave 1 content foundation
**Depends on:** VAKA Constitution; Zimbabwe country pack; Master Build Plan PB
catalogue
**Feeds:** PB-001 registry schema/content governance and PB-002 reviewed
Zimbabwe seed import

## Outcome

Create a version-controlled, machine-readable Zimbabwe Black Book seed dataset
that PB-001 can later import without scraping, guessing contact details or
confusing sourced facts with unverified content.

Success means:

- the data contract defines the required entity types, fields, identifiers,
  verification rules and source provenance;
- each required category has one valid JSON file;
- all current ministries and the named priority regulators, councils,
  utilities, tender portals and business associations are represented;
- every entry has a stable ID, name, category, review date and verification
  state;
- `verified: true` appears only when at least one official source URL is
  recorded; and
- uncertain contact information is omitted rather than inferred.

## User and business problem

**User:** Zimbabwean founders, owner-managers, finance/operations teams and the
PB-001 registry/content team.

**Problem:** government and business-support information is distributed across
many sites, changes over time and is easy to reproduce inaccurately. Importing
unsourced names or guessed contact details would weaken trust in the Black Book
before its registry and review workflow exist.

**Measurable result:** JSON parsing and dataset-invariant checks pass; coverage
and verified/unverified counts are recorded; the branch diff contains only the
country-pack Black Book and PB-000 mission-pack paths.

## Scope

1. Define the Zimbabwe Black Book data contract in `schema.md`.
2. Create one JSON array per entity category:
   `government_organisation`, `regulator`, `local_authority`, `utility`,
   `tender_portal`, `business_association`, `licence_type` and `service`.
3. Cover all ministries listed by the current official Zimbabwe government and
   Parliament sources reviewed during this mission.
4. Cover the named priority organisations: ZIMRA, RBZ, PRAZ, NSSA, ZERA,
   POTRAZ, EMA, DCIP, Harare and Bulawayo councils, ZETDC, ZINWA, TelOne, public
   tender portals, ZNCC, CZI and SME associations.
5. Record official source URLs and a uniform `lastReviewed` date of
   `2026-07-15`.
6. Document omissions, risks and the professional/content review gate.

## Deliberate exclusions

- Application code, APIs, database tables, migrations and import scripts.
- Product search, user interface, content editing or publishing workflows.
- Database access, production actions, npm installation or test execution.
- Unsourced fees, processing times, statutory interpretations or compliance
  deadlines.
- Exhaustive courts, district councils, permits or private tender portals.
- Treating this compilation as official, legal or regulatory advice.

## Data and trust rules

- Entries use stable lowercase kebab-case IDs that remain independent of future
  display-name changes.
- `category` is one of the eight contract entity types and matches its file.
- `name` and `category` are always present; all other descriptive/contact fields
  are optional unless the schema states otherwise.
- `sources` contains absolute URLs. Official government, regulator, statutory-
  body, council or organisation-owned domains support verification.
- `verified: true` requires at least one official URL in `sources` and means
  only that the recorded identity/basic fact was corroborated on the review
  date. It does not approve every service, address or contact field.
- A missing phone/email is preferable to an unverified value. No contact detail
  is copied from search snippets, aggregators or social media.
- `notes` distinguishes scope limitations and facts that need content review.
- PB-001 must preserve entry versions, source history, review ownership and
  expiry/re-review states when importing this seed.

## Failure behaviour

- If no official source is available, retain the entry only when coverage is
  important, set `verified: false`, omit uncertain fields and explain the gap in
  `notes`.
- If official sources conflict, do not choose silently. Record the safest
  bounded identity fact, cite both sources, set `verified: false` where the
  conflict affects the entry and flag it for review.
- If a website is unavailable, do not substitute an unofficial contact detail.
- If the current ministry list cannot be corroborated, the coverage gate fails
  and completion must state the exact gap.

## Verification

- parse every JSON file with the local Node.js runtime without installing
  dependencies;
- require an array root and validate IDs, categories, required fields, review
  dates, unique IDs and source/verification invariants;
- count entries by category and verified state;
- run `git diff --check`;
- compare the branch diff with `main`; and
- confirm every changed path is within the two authorised PB-000 directories.

No application or database test is required or permitted for this data/docs-
only mission.

## Rollback

Revert the PB-000 dataset and mission pack before PB-001 imports it. After an
import exists, retire or supersede entries through PB-001's future versioned
content workflow; do not silently rewrite imported historical source evidence.
