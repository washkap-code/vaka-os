# PB-000D — Completion report

**Branch:** `codex/pb-000d-directory-expansion`

**Base:** local `main` commit `2bb8b99218c10f18337ca500fd0d3b63e0fd3ae2`

**Status:** Dataset and documentation complete; local JSON, schema-field,
source and relationship validation passed. Registry import and professional
directory-content review remain outside this mission.

## Files created or modified

| File | Change |
| --- | --- |
| `knowledge-system/10-country-packs/Zimbabwe/black-book/data/government_organisations.json` | Added 35 government organisations covering provincial offices, courts, central hospitals and published ZRP provincial headquarters |
| `knowledge-system/10-country-packs/Zimbabwe/black-book/data/local_authorities.json` | Added 27 authorities to complete the Auditor-General's 32-authority urban roster |
| `knowledge-system/10-country-packs/Zimbabwe/black-book/data/services.json` | Added three official directory services for courts, central hospitals and police contacts |
| `docs/engineering/mission-packs/PB-000D/README.md` | Recorded outcome, scope, exclusions, evidence controls, failure behaviour, verification and rollback |
| `docs/engineering/mission-packs/PB-000D/COMPLETION.md` | Recorded delivery, counts, verification, sources, risks and recommended follow-up |

No schema, compliance-guide, server, web, API, Drizzle, migration, script,
package, lockfile, workflow, production, database or session-handoff file was
changed.

## Dataset summary

| Category | Before | Added | After | Added verified | Added unverified |
| --- | ---: | ---: | ---: | ---: | ---: |
| `government_organisation` | 30 | 35 | 65 | 35 | 0 |
| `local_authority` | 5 | 27 | 32 | 27 | 0 |
| `service` | 12 | 3 | 15 | 3 | 0 |
| **Mission total** | **47** | **65** | **112** | **65** | **0** |

The complete Black Book now contains **196 records** across all ten data
files, up from 131 at the base commit. All 65 additions have
`lastReviewed: "2026-07-15"`. A verified record confirms the entity or service
identity from an official source; it does not imply that omitted contact fields
were available or checked.

## Coverage delivered

- **Urban local authorities:** all 32 entities in the Auditor-General's 2024
  roster are now present: eight city councils, nine municipal councils, ten
  town councils and five local boards.
- **Provincial government:** ten provincial-affairs and devolution offices are
  children of `office-president-cabinet`.
- **Courts:** the JSC, Constitutional Court, Supreme Court, High Court, Labour
  Court, Commercial Court and five High Court stations are represented.
- **Central hospitals:** all six mission targets are children of
  `ministry-health-child-care`.
- **Police:** ZRP is a child of the Ministry of Home Affairs and seven
  headquarters records are included where reviewed official pages publish the
  headquarters' existence or location. No headquarters location is inferred.
- **Services:** source-backed court-contact, central-hospital and police
  general-lines directories provide discoverable parent relationships.

## Local verification

- All ten Black Book JSON files parsed successfully; each root is an array.
- The full dataset contains 196 records with zero duplicate IDs.
- Every ID in the three changed files is kebab-case.
- Every changed record uses the category required by its file and only fields
  allowed by the binding generic record contract.
- Every verified changed record has one or more HTTPS sources.
- Every `parentId` and `services` reference resolves across the full dataset:
  **zero unresolved references**.
- Record-count comparison against base commit `2bb8b99` reproduced 35, 27 and
  three additions respectively.
- `git diff --check` and the final commit path audit are required before
  handoff and must contain only the two authorised directory roots.

No npm install, application test, database-backed test, database access or
production action was run, as required by the mission boundary.

## Official sources consulted

The source URLs attached to individual records are the controlling evidence.
The reviewed official source set includes:

- [Office of the Auditor-General — Local Authorities 2024 report](https://auditorgeneral.gov.zw/wp-content/uploads/2025/09/LOCAL-AUTHORITIES-2024.pdf)
- [Zimbabwe Mission in Geneva — Officers of Government and their Functions](https://www.zimgeneva.gov.zw/wp-content/uploads/2025/01/OFFICERS-OF-GOVERNMENT-AND-THEIR-FUNCTIONS.pdf)
- Provincial-office portals for [Bulawayo](https://opcbyometro.gov.zw/), [Harare](https://harareprovince.co.zw/), [Manicaland](https://www.opcmanicaland.gov.zw/), [Mashonaland Central](https://www.testdomain9.gov.zw/?page_id=1352), [Mashonaland East](https://www.testdomain3.gov.zw/), [Mashonaland West](https://www.mashwest.gov.zw/), [Masvingo](https://www.testdomain13.gov.zw/), [Matabeleland North](https://www.opcmatnorth.gov.zw/), [Matabeleland South](https://www.testdomain10.gov.zw/) and [Midlands](https://testdomain25.gov.zw/)
- [Judicial Service Commission](https://www.jsc.org.zw/), [JSC mandate](https://jsc.org.zw/about/), [court contacts](https://www.jsc.org.zw/contacts/) and the official public contacts directory endpoint
- [Ministry of Health and Child Care — Central Hospitals](https://www.mohcc.gov.zw/?page_id=7390)
- [Zimbabwe Republic Police — Police Provinces](https://zrp.gov.zw/?p=7185), [Harare Province](https://zrp.gov.zw/?p=7210), [Masvingo Province](https://zrp.gov.zw/?p=7234), [Mashonaland East Province](https://zrp.gov.zw/?p=7258), [Manicaland Province](https://zrp.gov.zw/?p=7302) and [General Lines](https://zrp.gov.zw/?page_id=7641)

## Risks and review notes

- Five official provincial portals currently use `testdomain*.gov.zw`
  hostnames. These are disclosed in record notes and need canonical-hostname
  confirmation before customer-facing publication.
- The JSC public contacts dataset includes obvious placeholder phone values
  and some non-specific addresses. Those values were deliberately omitted.
- The ZRP General Lines page states that it was updated in June 2022. No phone
  number from that directory was copied into a new headquarters record.
- The Auditor-General report verifies council identity and classification, not
  each council's current website or contact channels. Those fields remain
  omitted for the 27 additions.
- Three geographic police provinces were not converted into headquarters
  records because the reviewed official pages did not establish a headquarters
  entity or location with enough specificity.
- Government structures, office locations and contact channels change. This
  seed requires accountable review ownership, source snapshots and a refresh
  cadence before it becomes a customer-facing directory.
- The data is directory research, not legal, medical, public-safety or other
  professional advice.

## Recommended next mission

Proceed to **PB-000E — rural local-authority and directory-source
certification**: add the 60 rural district councils from official records,
confirm canonical provincial-office hostnames, verify the remaining police
provincial-headquarters locations and enrich council contacts only from
authority-owned sources. Keep that work data-and-docs only and preserve the
existing PB-001 schema.
