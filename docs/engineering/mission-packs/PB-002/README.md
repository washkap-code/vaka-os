# PB-002 — Zimbabwe Black Book professional content certification

**Status:** REVIEW READY — professional content gate OPEN

**Programme:** PB — Black Book

**Gate:** P (content review)

**Depends on:** PB-001 registry, PB-000 through PB-000E dataset, and PB-000F
source governance

**Feeds:** PB-003 directory UI, PB-004 licence knowledge publication, PB-005
compliance reminders and future grounded Black Book advice

## Outcome

Turn the 256-record Zimbabwe Black Book into an auditable human-certification
queue without claiming professional approval that has not occurred. Every
record receives a derived evidence state, source-domain impact, linked gap
controls, review track and blank human decision fields. A separate protocol
defines who may approve each content class and what evidence is required.

This mission prepares the P gate; it does not close it.

## User and business problem

**User:** Zimbabwe content owners, qualified professional reviewers, registry
operators and product teams waiting on trustworthy Black Book content.

**Problem:** the dataset is extensively sourced, but evidence readiness and
professional approval are different controls. A blanket statement such as
“reviewed” would hide 49 guide-field gaps, source-domain risks and the one
unverified compliance event.

**Measurable result:** all 256 records appear exactly once in the certification
register: 231 evidence-ready, 24 partial and one blocked. All 256 human
decisions remain pending until identifiable reviewers sign their qualified
scope.

## Deliverables

1. content-certification-register.json — one work item per dataset record,
   tied to the PB-000F base commit.
2. PROFESSIONAL-REVIEW.md — reviewer qualification matrix, decision rules,
   review sequence, open gates and approval template.
3. PB-002 mission README and completion-status report.

## Evidence-state derivation

- BLOCKED when the source record is explicitly verified false.
- PARTIAL when a compliance guide has any unverified evidence field or the
  record uses a PROVISIONAL or UNAVAILABLE source domain.
- READY when recorded facts have official HTTPS sources, the record is not
  explicitly unverified, guide fields are complete where applicable, and all
  used domains have the PB-000F resolving working state.
- A coverage omission, such as missing council contacts, is linked separately
  and does not make an existing supported identity fact false.
- Evidence state never substitutes for human approval.

## Review tracks

- DIRECTORY — 199 government, regulator, council, utility, portal,
  association and service records.
- COMPLIANCE — 39 licence types and compliance events.
- REGULATORY_GUIDE — 18 field-level-evidenced guides.

Directory review requires Zimbabwe source knowledge. Compliance and guide
review requires a qualified Zimbabwe reviewer appropriate to the subject:
tax/accounting, legal and corporate, public procurement, environmental, energy,
telecommunications, medicines or local-authority regulation.

## Gate behaviour

- All record-level humanReviewStatus values start PENDING.
- READY records still require source-by-source human review.
- PARTIAL records must close their evidence gaps or be explicitly excluded.
- The BLOCKED DCIP annual-return event cannot be published or drive reminders.
- A field may be upgraded to verified only when a newly found, resolving
  official source is cited in that field and in the guide's aggregate sources;
  reviewer approval alone cannot upgrade evidence.
- Dataset-level approval must reference the exact commit, reviewer
  qualifications, scope, evidence bundle, exceptions, decision date and expiry.
- The gate closes only when the signed human-review pack is returned and
  recorded in `docs/engineering/mission-packs/PB-002/`.
- Compliance guides remain outside the PB-001 importer until their content gate
  closes and an importer extension is deliberately versioned.
- No content is imported, published or enabled by this mission.

## Scope and exclusions

Included:

- one mechanically derived certification queue entry per record;
- record and domain impact reconciliation;
- reviewer routing and approval criteria;
- explicit retention of every inherited evidence and publication gate; and
- local JSON, count, reference and path validation.

Excluded:

- claiming or fabricating professional approval;
- declaring PB-002 certified before the signed pack is recorded in the PB-002
  mission directory;
- editing any existing data record, source register, schema contract or gap
  status;
- filling guide fields, fees, deadlines, contacts or statutory interpretations
  without closing evidence;
- server, web, API, migration, Drizzle, package, script, workflow or handoff
  changes;
- registry imports, database access, production actions, npm commands or
  application tests.

## Failure behaviour

- Reject the certification register if a dataset record is missing, duplicated
  or assigned a mismatched category, source domain, source risk or evidence
  state.
- Keep the dataset gate pending while any intended published record lacks an
  approved human decision.
- Never promote search-index text when the direct official source is
  unavailable. During preparation, the indexed DCIP Client Service Charter
  still returned 404 at its official URL.
- Reject an approval that lacks reviewer identity, relevant qualification,
  exact scope, evidence reference, date or exceptions.
- Fail closed on excluded, partial, blocked, expired or invalidated content.

## Verification

- parse all ten dataset files, the PB-000F source register and the PB-002
  certification register;
- require 256 unique dataset IDs and 256 unique certification work items;
- require every category, review date and exact source-domain set to match;
- recalculate source risks and evidence states from the underlying data;
- require 231 READY, 24 PARTIAL and one BLOCKED record;
- require 199 directory, 39 compliance and 18 guide work items;
- require all 256 human review decisions to remain PENDING;
- validate every referenced evidence or coverage gap ID against
  EVIDENCE-GAPS.md;
- run git diff --check; and
- audit the final commit against the Black Book and PB-002 mission-pack roots.

No npm install, application test, database test, database access or production
action is permitted or required.

## Rollback

Revert the PB-002 preparation commit. Existing data and registry state remain
unchanged. Preserve any human decisions or evidence captured after preparation
in the controlled evidence system before reverting.
