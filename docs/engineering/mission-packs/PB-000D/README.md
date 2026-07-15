# PB-000D — Zimbabwe Black Book directory expansion

**Status:** Approved for implementation

**Priority:** Zimbabwe directory coverage foundation

**Depends on:** PB-000, PB-000B, PB-000C and the PB-001 registry contract

**Feeds:** Black Book discovery, future directory search, compliance routing
and country-pack content governance

## Outcome

Broaden the Zimbabwe Black Book within the existing PB-001 import contract,
using only `government_organisation`, `local_authority` and `service` records.
The mission adds source-backed urban local authorities, provincial-government
offices, courts, central hospitals and published police provincial
headquarters without changing the schema or application code.

Success means:

- the local-authority dataset covers all 32 urban authorities listed in the
  Auditor-General's 2024 report;
- all ten provincial-affairs and devolution offices are represented under the
  Office of the President and Cabinet;
- the JSC, principal superior courts, Commercial Court and five published High
  Court stations are represented from official JSC sources;
- the six MoHCC central hospitals named in the mission are represented under
  the Ministry of Health and Child Care;
- ZRP and every provincial headquarters whose existence or location was
  explicitly published in the reviewed official ZRP pages are represented;
- all IDs, categories, fields, dates and relationships satisfy the existing
  Black Book contract; and
- the mission commit changes only the three existing data files and the
  PB-000D mission pack.

## User and business problem

**User:** Zimbabwean business owners and operators, VAKA support teams, and
future directory and compliance-content consumers.

**Problem:** the original seed established core national institutions but did
not give a business enough regional coverage to identify the relevant council,
provincial office, court, referral hospital or police provincial point of
reference. Public records are spread across authority websites and some
official directories contain stale, incomplete or placeholder contact values.

**Measurable result:** 65 new records are added across the three permitted
categories; all ten Black Book JSON files parse; every new reference resolves;
every new record uses `2026-07-15`; and the commit contains no schema,
compliance-guide, application, migration, package or handoff change.

## Scope

1. Extend `data/local_authorities.json` from five to the 32 urban authorities
   listed by the Office of the Auditor-General: eight city councils, nine
   municipal councils, ten town councils and five local boards.
2. Add the ten provincial-affairs and devolution offices as children of
   `office-president-cabinet`.
3. Add the Judicial Service Commission, Constitutional Court, Supreme Court,
   High Court, Labour Court, Commercial Court and the Harare, Bulawayo,
   Masvingo, Mutare and Chinhoyi High Court stations.
4. Add Parirenyatwa Group of Hospitals, Sally Mugabe Central Hospital, Mpilo
   Central Hospital, United Bulawayo Hospitals, Chitungwiza Central Hospital
   and Ingutsheni Central Hospital under `ministry-health-child-care`.
5. Add the Zimbabwe Republic Police under
   `ministry-home-affairs-cultural-heritage` and seven provincial-headquarters
   records supported by the reviewed ZRP pages.
6. Add official court-contact, central-hospital and police general-lines
   directory services.

## Deliberate exclusions

- Changes to `schema.md`, `compliance-guides.json` or any other existing data
  category.
- Rural district councils, district police stations, magistrates' courts,
  clinics, general hospitals and private institutions.
- Server, web, API, Drizzle, migration, import, package, script or handoff
  changes.
- Database access, production actions, npm commands or application tests.
- Guessed websites, phone numbers, email addresses, physical addresses or
  implied locations.
- Professional legal, public-safety, medical or regulatory advice.

## Evidence and data-control rules

- A record is `verified: true` only when its identity is supported by an
  official HTTPS government, commission, ministry, hospital-directory or
  police source included in `sources`.
- Verification of an organisation's identity does not verify every possible
  contact field. Unsupported contact fields are omitted rather than inferred.
- Council websites are not copied from commercial directories or guessed from
  names. The Auditor-General report verifies the authority identity and class;
  a later mission may add a council-owned website after separate review.
- Placeholder JSC phone values and non-specific addresses are not copied.
- ZRP headquarters cities and street addresses are included only where the
  reviewed ZRP page explicitly publishes them.
- Every new `parentId` and `services` value must resolve globally, and every
  new record must use a globally unique kebab-case ID.
- Only fields already allowed by the binding PB-001 record contract may be
  present.

## Failure behaviour

- Omit an unsupported contact field instead of filling it from a non-official
  directory or inference.
- Omit a headquarters record when the official source establishes only a
  province and does not establish the headquarters' existence.
- If an official hostname is clearly provisional, retain the source with a
  review note and require canonical-hostname confirmation before publication.
- Reject the batch if a JSON file fails to parse, an ID is duplicated, a
  category mismatches its file, an unknown field appears or a relationship is
  unresolved.

## Verification

- parse all ten Black Book JSON files using the local Node.js runtime without
  installing dependencies;
- validate the three changed files against the generic record field allowlist;
- require kebab-case and globally unique IDs;
- require each verified record to have at least one official HTTPS source;
- require every new `lastReviewed` value to equal `2026-07-15`;
- resolve all `parentId` and `services` references across all data files;
- compare record counts with the local-main base commit;
- run `git diff --check`; and
- audit the final commit paths against the two authorised directory roots.

No application, npm, database-backed or production test is permitted or
required for this data-and-docs-only mission.

## Rollback

Revert the PB-000D commit before a registry import consumes the additions. If
records have already been imported, retire or supersede them through the
registry's controlled content process while retaining source and review
history; do not silently mutate or delete published directory evidence.
