# PB-000E — Rural local authorities and directory-source certification

**Status:** Approved for implementation

**Priority:** Zimbabwe directory completeness and evidence quality

**Depends on:** PB-000 through PB-000D and the binding PB-001 registry
contract

**Feeds:** Black Book discovery, geographic compliance routing, source
certification and future directory maintenance

## Outcome

Complete the official Zimbabwe local-authority roster without changing the
PB-001 data contract, then review the known provincial-office and police
directory gaps under an evidence-first control. The mission adds all 60 rural
district councils listed in the Office of the Auditor-General's 2024
local-authorities report. It does not publish guessed council contacts,
canonical hostnames or police headquarters.

Success means:

- `local_authorities.json` contains the 60 official rural district councils in
  addition to the 32 urban authorities delivered by PB-000D;
- every new record has a globally unique kebab-case ID, the
  `local_authority` category, an official HTTPS source and
  `lastReviewed: "2026-07-15"`;
- the current and prior Auditor-General reports resolve the spelling variance
  for Chirumanzu Rural District Council without silently changing source
  evidence;
- candidate canonical provincial-office hostnames and the three remaining ZRP
  provincial-headquarters gaps are promoted only when an official source
  explicitly supports them;
- all Black Book JSON files parse and all relationships resolve; and
- the mission commit changes only `local_authorities.json` and the PB-000E
  mission pack.

## User and business problem

**User:** Zimbabwean business owners and operators, VAKA support teams, and
future directory and compliance-content consumers.

**Problem:** the directory had complete urban-authority coverage but omitted
the rural district councils through which many businesses obtain local
services and approvals. Separately, several provincial-government source URLs
are clearly provisional and three police province pages do not publish enough
information to establish headquarters records safely.

**Measurable result:** 60 source-backed rural district councils are added,
bringing `local_authority` coverage to 92 and the complete Black Book to 256
records. Unsupported contacts and directory claims remain documented gaps
rather than becoming seed data.

## Scope

1. Add the 60 rural district councils in Annexure E of the Auditor-General's
   2024 local-authorities report to the existing `local_authorities.json`.
2. Reconcile the report's Chirumanzu spelling variance against its index and
   the Auditor-General's 2022 report.
3. Review the five provincial-office records that currently rely on
   `testdomain*.gov.zw` sources for a directly supported canonical hostname.
4. Review official ZRP pages for explicit evidence of Bulawayo, Midlands and
   Matabeleland North provincial-headquarters entities or locations.
5. Record unresolved evidence gaps in the completion report without creating
   unverified directory claims.

## Deliberate exclusions

- Changes to `schema.md`, `compliance-guides.json` or any category other than
  `local_authority`.
- Council websites, phones, emails, addresses or headquarters cities not
  explicitly published by an authority-owned source.
- Police province, district or station records that do not satisfy the
  headquarters evidence gate.
- Server, web, API, Drizzle, migration, import, package, script, workflow or
  session-handoff changes.
- Database access, production actions, npm commands or application tests.
- Professional legal, regulatory, public-safety or local-government advice.

## Evidence controls

| Control | Requirement | Evidence or failure behaviour |
| --- | --- | --- |
| Authority identity | The current official Auditor-General report names the council | Attach the report URL to `sources`; omit the record if it is absent |
| Verified status | At least one official HTTPS source supports the record identity | Set `verified: true` only when the evidence gate passes |
| Contact fields | An authority-owned page explicitly publishes the value | Omit the field rather than infer or copy from a commercial directory |
| Canonical hostname | The candidate resolves and presents the official office identity | Keep the disclosed provisional source and gap note if confirmation fails |
| Police headquarters | An official ZRP source explicitly establishes the headquarters entity or location | Do not equate a province page or contact row with a headquarters record |
| Spelling variance | A second official source resolves the variance | Preserve both source URLs and explain the reconciliation in `notes` |
| Registry compatibility | Existing category, field, date, ID and relationship rules pass | Reject the batch on any parse, field, ID or reference failure |

The evidence register is the records' `sources` and `notes` fields together
with the gap register in `COMPLETION.md`. Identity verification does not imply
that omitted contact fields have been verified.

## Failure behaviour

- Omit an unsupported field instead of filling it from memory, search-result
  inference, a third-party directory or an email-domain guess.
- Leave an existing provisional URL unchanged unless a directly supported
  canonical source resolves and identifies the same office.
- Do not create a police headquarters merely because an official page names a
  police province or its officer commanding.
- Reject the batch if a JSON file fails to parse, an ID is duplicated, an
  unknown field appears, a category mismatches its file, a source is not HTTPS
  or a relationship is unresolved.

## Verification

- parse all ten Black Book JSON files using the local Node.js runtime without
  installing dependencies;
- compare the 60 additions with the official rural-authority roster;
- require every new ID to be kebab-case and globally unique;
- require every new record to use only generic fields allowed by the binding
  PB-001 contract;
- require `category: "local_authority"`, `verified: true`, an official HTTPS
  source and `lastReviewed: "2026-07-15"` on every addition;
- resolve every `parentId` and `services` reference across all data files;
- run `git diff --check`; and
- audit the final commit paths against the two authorised directory roots.

No application, npm, database-backed or production test is permitted or
required for this data-and-docs-only mission.

## Rollback

Revert the PB-000E commit before a registry import consumes the additions. If
records have already been imported, retire or supersede them through the
registry's controlled content process while retaining source and review
history; do not silently mutate or delete published directory evidence.
