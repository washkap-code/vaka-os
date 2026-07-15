# PB-000F — Black Book source certification and refresh controls

**Status:** Approved for implementation

**Priority:** Evidence ownership, freshness and publication safety

**Depends on:** PB-000 through PB-000E, the frozen Black Book contracts and
the PB-001 registry validation model

**Feeds:** PB-002 professional content certification, future source snapshots,
registry revision approval and customer-facing Black Book publication

## Outcome

Add a governance layer around the 256-record Zimbabwe Black Book without
changing any existing data record or schema contract. The mission inventories
every exact HTTPS source hostname, maps it to dependent records and
authorities, consolidates inherited evidence gaps, and defines accountable
review cadences and downgrade behaviour.

Success means:

- one source-register entry exists for each exact HTTPS hostname used anywhere
  in the ten data files;
- each domain's record count and authority impact index are reproducibly
  derived from the dataset;
- all PB-000 through PB-000E evidence gaps are visible with closing evidence
  and a likely holder;
- every Black Book category has a review cadence and immediate re-verification
  triggers;
- an unavailable domain causes dependent records to be re-reviewed and
  downgraded when no alternate official evidence remains; and
- only five new governance and mission-pack files are committed.

## User and business problem

**User:** the Zimbabwe Black Book content owner, professional reviewers,
registry operators and VAKA teams consuming directory or compliance content.

**Problem:** source URLs and review dates exist inside the dataset, but the
dataset had no consolidated domain inventory, owner impact map, review
calendar, outage response or single register of unresolved evidence. That
makes stale official pages and partially verified compliance content difficult
to govern safely at 256-record scale.

**Measurable result:** 58 exact hostnames reconcile to 297 unique
domain-to-record links across all 256 records; 67 gap controls are documented;
and all eleven JSON files, including the new source register, parse locally.

## Deliverables

1. `sources-register.json` — exact-host inventory with publisher,
   publisher type, affected authority IDs, unique dependent-record count,
   reliability note, review cadence, last-check date and status.
2. `EVIDENCE-GAPS.md` — 49 guide-field gaps plus event, source-domain,
   directory-coverage and inherited publication controls.
3. `REVIEW-POLICY.md` — ownership, category cadences, trigger-based review,
   source-status semantics, evidence preservation and publication gates.
4. PB-000F mission README and completion report.

## Derivation rules

- Traverse every value in every `data/*.json` record and collect every string
  beginning with `https://`.
- Use the URL's exact lowercase hostname. Do not collapse `www`, portal or
  service subdomains.
- Count a domain once per record even when the record contains multiple URLs
  from that hostname.
- Include authority-type records directly using the domain and referenced
  issuing or parent authorities for dependent licence, event, guide and
  service records.
- Derive counts and authority IDs mechanically; review publisher identity,
  reliability, cadence and status as governance judgments.
- Treat `RESOLVING` as a domain-level working state, not proof that every page
  still supports every fact.

## Evidence and status controls

- `PROVISIONAL` is used for the five disclosed provincial test-domain hosts.
- `UNAVAILABLE` is used for the Liquor Licensing Board portal recorded as
  unavailable in PB-000C.
- Every other domain remains `RESOLVING` unless a reviewed domain-level outage
  is established.
- Provisional and unavailable domains receive monthly review regardless of
  publisher type.
- A failed bulk DNS probe in the execution environment is not evidence that
  otherwise known official domains are unavailable; persistent, reproducible
  checks and page review are required.
- A domain becoming unavailable does not silently erase evidence. Its
  dependants are reviewed, alternate official support is assessed, and
  unsupported records or guide fields are downgraded in a separately
  authorised, versioned content revision.

## Scope and exclusions

Included:

- governance metadata derived from all existing dataset URLs;
- known evidence gaps and likely evidence holders;
- category and domain review cadences;
- re-verification, downgrade, preservation and publication rules; and
- local JSON, reconciliation and path validation.

Excluded:

- edits to `schema.md` or any existing `data/*.json` record;
- adding contacts, canonical domains, guide values, fees, deadlines or police
  headquarters;
- server, web, API, Drizzle, migration, package, script, workflow or handoff
  changes;
- registry imports, database access, production actions, npm commands or
  application tests; and
- professional legal, tax, accounting, regulatory or localisation approval.

## Failure behaviour

- Reject the register if a dataset hostname is absent, an extra hostname is
  present, a record count differs, an authority impact list differs or a
  register enum is invalid.
- Do not convert a transient local DNS timeout into an unavailable status.
- Do not close a gap with a search snippet, third-party directory, inferred
  contact, customary fee or undated screenshot.
- Do not add governance fields to frozen data records.
- Do not publish content whose required professional or source certification
  gate remains open.

## Verification

- parse all ten existing data files and the new source register;
- require 256 unique dataset IDs and at least one HTTPS URL in every record;
- regenerate exact hostnames, unique per-domain record counts and associated
  authority IDs, then compare them byte-for-byte with the register values;
- reconcile 58 domains, 633 URL occurrences, 297 domain-to-record links and
  224 authority impact links;
- validate publisher type, cadence, status and date enums;
- count all 49 unverified guide fields directly from their evidence status;
- confirm the evidence-gap table contains every derived guide gap and each
  named inherited gap class;
- run `git diff --check`; and
- audit the final commit against the Black Book and PB-000F authorised roots.

No npm install, application test, database-backed test, database access or
production action is permitted or required.

## Rollback

Revert the PB-000F commit. Existing data records and registry content are
unchanged, so rollback removes only the governance documents and derived
source register. Preserve any review evidence or decisions created after this
mission in the approved evidence system before reverting.
