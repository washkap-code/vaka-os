# PB-000B — Zimbabwe licences, permits and compliance calendar dataset

**Status:** Approved for implementation
**Priority:** Wave 1 compliance-content foundation
**Depends on:** PB-000 Zimbabwe Black Book seed dataset
**Feeds:** PB-002 compliance guides; future Compliance Centre registry and
calendar

## Outcome

Extend the PB-000 Zimbabwe Black Book with source-backed licence,
registration, permit and compliance-event records that a later mission can
turn into reviewed guidance and calendar controls without scraping deadlines
or treating guessed values as law.

Success means:

- the data contract defines licence-specific and compliance-event fields,
  relationship rules, verification semantics and allowed cadences;
- every licence and event points to an authority already present in PB-000;
- current official sources support every verified obligation, cadence and
  deadline;
- DCIP, ZIMRA, NSSA, PRAZ, Harare, Bulawayo and EMA coverage is represented;
- fees, thresholds and deadlines are omitted when the reviewed official
  source does not support them; and
- all JSON and reference-integrity checks pass without application, database
  or package changes.

## User and business problem

**User:** Zimbabwean founders, owner-managers, finance, payroll and operations
teams, plus the PB-002 compliance-content team.

**Problem:** incorporation, tax, social-security, procurement, municipal and
environmental obligations are administered by different authorities. A list
of names alone does not show who must act, whether an item recurs, or what
official evidence supports a due rule. Guessing a fee, threshold or deadline
would create material compliance risk.

**Measurable result:** the two PB-000B JSON files parse; every authority and
licence reference resolves; every record carries the mission review date;
verified/unverified totals are recorded; and the PB-000B commit contains only
the Black Book and PB-000B mission-pack paths.

## Scope

1. Extend `schema.md` with contracts for `licence_type` and
   `compliance_event`.
2. Rename the original PB-000 `licence_types.json` to the contract filename
   `licence-types.json`, preserve its IDs, and enrich those records.
3. Add company incorporation; ZIMRA taxpayer, VAT and PAYE registrations;
   NSSA employer registration; PRAZ supplier registration; Harare and
   Bulawayo municipal approvals; and overview-level environmental, liquor and
   health licensing.
4. Add one-time, monthly, quarterly, annual and trigger-based compliance
   events for the reviewed obligations.
5. Record official authority URLs, stable PB-000 authority relationships and
   a uniform `lastReviewed` date of `2026-07-15`.
6. Preserve unresolved source freshness as an explicit unverified state.

## Deliberate exclusions

- Application code, APIs, databases, migrations, import scripts and product
  notification logic.
- Database access, production actions, npm installation or test execution.
- Fees, monetary thresholds, tax calculations or assumptions about eligibility.
- A universal deadline for obligations whose timing is taxpayer-assigned,
  licence-specific, trigger-based or absent from a current official source.
- Legal, tax, environmental, employment or licensing advice.
- Exhaustive sector licensing beyond the named PB-000B coverage targets.

## Data and compliance-control rules

- IDs are stable, global and lowercase kebab-case. Existing PB-000 licence IDs
  are not replaced merely because their record shape is enriched.
- `issuingAuthorityId` and `authorityId` resolve to PB-000 public bodies;
  `licenceTypeId`, when supplied, resolves to the enriched licence file.
- `ONCE`, `MONTHLY`, `QUARTERLY`, `ANNUAL` and `OTHER` describe source-backed
  cadence only. `OTHER` covers triggers, authority-assigned periods and
  multi-year renewals.
- `dueRule` is human-readable source evidence, not an executable date formula.
- A deadline is written only when a current official source states it. Where
  timing remains uncertain, the rule instructs the consumer to confirm it.
- `verified: true` requires an available official source that supports the
  obligation and all material populated facts, not merely the authority's
  identity.
- Each future product control must retain its authority, source version,
  effective date, review owner, evidence expectation and exception path. This
  seed supplies authority and source evidence; PB-002 must add the remaining
  operational controls.

## Failure behaviour

- If an official source is unavailable, keep essential review evidence only
  where useful, set the affected event to `verified: false`, and avoid a
  precise deadline.
- If two official sources conflict, do not select the more convenient rule.
  Downgrade verification and route the item to Zimbabwe compliance review.
- If a frequency is authority-assigned, model each supported case explicitly
  or use `OTHER`; do not pretend that one cadence applies to every business.
- If an authority relationship cannot be resolved, reject the full dataset
  revision instead of importing an orphan record.

## Verification

- parse every JSON file with the local Node.js runtime, without installing
  dependencies;
- require array roots, global ID uniqueness, source/verification invariants and
  the uniform review date;
- validate allowed renewal/cadence enums and required licence arrays;
- resolve every `issuingAuthorityId`, `authorityId`, `licenceTypeId`,
  `parentId` and service reference;
- count licence and compliance-event entries by verification state;
- run `git diff --check`; and
- confirm the PB-000B commit diff contains only the two authorised directory
  roots.

No application, package, database or test-suite command is required or
permitted for this data-and-docs-only mission.

## Rollback

Revert the PB-000B commit before PB-002 or an importer consumes it. Once a
versioned registry exists, supersede rules non-destructively and retain the
source and effective-date history; never silently rewrite a compliance event
that may already have generated guidance or reminders.
