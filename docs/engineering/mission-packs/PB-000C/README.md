# PB-000C — Zimbabwe licence and permit compliance guides

**Status:** Approved for implementation
**Priority:** Wave 1 compliance-content foundation
**Depends on:** PB-000 and PB-000B Zimbabwe Black Book datasets
**Feeds:** PB-002 compliance content; PB-004 licensing guides; future
Compliance Centre registry and content-governance work

## Outcome

Add one structured, source-backed application guide for every licence type in
the PB-000B Zimbabwe Black Book without adding registry code, application
behaviour or database state.

Success means:

- all 18 licence types have exactly one compliance guide;
- every guide uses its existing licence and authority IDs;
- eligibility, documents, prerequisites, fees, processing time, renewal,
  official links and steps are independently evidenced;
- unsupported fields are explicitly `unverified`, empty and accompanied by a
  review note instead of a guessed value;
- every verified fact points to an official government, regulator, council or
  official portal URL;
- every JSON file parses and every relationship resolves; and
- the mission commit contains only the Zimbabwe Black Book and PB-000C
  mission-pack paths.

## User and business problem

**User:** Zimbabwean founders, owner-managers, compliance teams and the future
VAKA Compliance Centre content team.

**Problem:** a licence name does not tell a business who must apply, what
evidence to prepare, what prior approvals are needed, how to file, or which
authority source supports a fee or timing rule. Requirements are spread across
different official websites and are published with uneven completeness.
Treating an absent fee or a renewal form as proof of a value would create
material compliance risk.

**Measurable result:** 18 guides parse; the eight governed evidence fields per
guide produce reproducible verified and unverified counts; every licence and
authority reference resolves; all records use the mission review date; and the
commit path audit contains no application, migration, package or handoff file.

## Scope

1. Extend `schema.md` with the `compliance_guide` entity, field-level evidence
   rules, relationships and import validation gates.
2. Add `data/compliance-guides.json` with one guide per PB-000B licence type.
3. Cover DCIP, ZIMRA, NSSA, PRAZ, Harare, Bulawayo, the Liquor Licensing
   Board, EMA, ZERA, POTRAZ and MCAZ.
4. Preserve every PB-000B licence and authority ID without altering its source
   record.
5. Set `lastReviewed` to `2026-07-15` on every guide.
6. Record every unavailable fee, processing time, prerequisite, renewal rule
   or step sequence as an explicit evidence gap.

## Deliberate exclusions

- Application code, APIs, databases, migrations, import scripts, registries,
  reminders and user-interface content.
- Changes to PB-000B licence types, compliance events or authority records.
- Database access, production actions, npm installation or application tests.
- Estimated fees, inferred processing times, currency conversions or deadlines.
- Commercial filing services and non-official explainers as evidence.
- Legal, tax, employment, environmental, municipal, energy, health or
  telecommunications advice.

## Evidence and compliance-control rules

- Eight fields are counted per guide: `whoNeedsIt`, `documents`,
  `prerequisites`, `officialFees`, `processingTime`, `renewalCycle`,
  `officialLinks` and `steps`.
- Each field has `status`, `value`, `sources` and `note`. A verified field has
  a non-empty value and one or more official HTTPS sources. An unverified field
  has a null or empty value, no sources and an explanatory note.
- An official page that merely names a licence does not verify a fee,
  processing time or application sequence.
- A renewal form verifies that a renewal route exists, but not its frequency.
- A correction deadline or meeting frequency is not represented as an
  end-to-end processing time.
- Formula fees are copied as formulas. No currency is converted and no
  volatile local-currency equivalent is treated as durable seed data.
- `sources` on each guide is the deduplicated union of its field evidence and
  official links. Consumers must keep the field-level attribution.
- Later publication requires effective dates, source snapshots, accountable
  review ownership and professional Zimbabwe compliance review.

## Failure behaviour

- If a current official source does not establish a value, keep the field
  unverified and route it for authority confirmation.
- If an official portal is unavailable, do not promote its indexed content to
  verified application instructions.
- If official sources conflict or a fee schedule has uncertain currency,
  suppress the value rather than choose an interpretation.
- If a licence or authority reference does not resolve, reject the full guide
  batch instead of importing an orphan.
- If a future source change invalidates one field, downgrade and review that
  field without erasing the evidence status of unrelated fields.

## Verification

- parse every Black Book JSON file with the local Node.js runtime, without
  installing dependencies;
- require exactly 18 guides and a one-to-one mapping to the 18 licence types;
- validate evidence-field status, value, source and note invariants;
- require every guide authority to equal its licence type's
  `issuingAuthorityId` and resolve to an existing PB-000 record;
- require sequential verified steps and HTTPS official links represented in
  aggregate sources;
- require the uniform `2026-07-15` review date;
- run `git diff --check`; and
- audit the final commit paths against the two authorised directory roots.

No application, package, database or test-suite command is required or
permitted for this data-and-docs-only mission.

## Rollback

Revert the PB-000C commit before a registry importer consumes it. Once guide
versions are imported, supersede them non-destructively and retain the prior
field evidence, source URLs, review date and publication decision.
