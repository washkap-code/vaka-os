# Zimbabwe Black Book professional content-review protocol

**Gate status:** `PENDING_HUMAN_REVIEW`

**Review dataset:** commit
`e1100766ba21f4b1950b93420ad5b5aefeaa16c2`

**Prepared:** 2026-07-15

## Purpose

This protocol turns PB-002's professional content gate into a record-level
review process. It does not certify the dataset by itself. Approval must come
from identifiable human reviewers with relevant Zimbabwe knowledge and must
reference the exact dataset revision and retained evidence bundle.

The review queue is `content-certification-register.json`. It contains one
work item for each of the 256 dataset records without adding fields to the
frozen record contracts.

## Current readiness

| Evidence state | Records | Meaning |
| --- | ---: | --- |
| `READY` | 231 | Recorded facts have official HTTPS evidence and no known non-resolving source-domain risk; human review is still pending. |
| `PARTIAL` | 24 | A compliance guide has unverified fields or a record depends on a provisional or unavailable domain. |
| `BLOCKED` | 1 | `dcip-company-annual-return` is explicitly unverified and cannot be approved for publication or reminders. |

All 256 work items have `humanReviewStatus: "PENDING"`. Evidence readiness is
not a professional opinion and does not permit customer-facing publication.

## Review tracks and reviewer qualifications

| Track | Records | Minimum reviewer profile |
| --- | ---: | --- |
| `DIRECTORY` | 199 | Zimbabwe content reviewer who can validate public bodies, councils, courts, hospitals, utilities, portals and associations against current official sources. Escalate legal mandates or disputed structures to a qualified practitioner or the authority. |
| `COMPLIANCE` | 39 | Qualified Zimbabwe compliance reviewer familiar with the relevant legal and regulatory domain. Tax and NSSA controls require a Zimbabwe tax/accounting or social-security specialist; procurement controls require PRAZ/public-procurement expertise. |
| `REGULATORY_GUIDE` | 18 | Qualified Zimbabwe legal or regulatory reviewer, with domain specialists for environmental, energy, telecommunications and medicines content. |

One person need not approve every track. Each reviewer signs only the scope
covered by their qualifications. The dataset-level decision must list every
reviewer and their approved record IDs or category scope.

## Derived register fields

- `sourceDomains` is the exact-hostname set extracted from every HTTPS URL in
  the record.
- `sourceRisks` lists any source whose PB-000F status is not `RESOLVING`.
- `evidenceGapIds` links field, event or source-domain gaps from
  `EVIDENCE-GAPS.md`.
- `coverageGapIds` records known omissions that do not make an existing fact
  false, such as missing council contacts.
- `evidenceStatus` is mechanically derived as `READY`, `PARTIAL` or `BLOCKED`.
- `reviewTrack` and `requiredReviewerRole` route the work to an appropriate
  reviewer.
- `humanReviewStatus`, reviewer, dates and decision note are the human control
  fields.

Do not hand-edit derived fields to make a record appear ready. Correct the
underlying source data or source register in a separately reviewed revision,
then regenerate the certification queue.

## Record decision rules

Allowed `humanReviewStatus` values are:

- `PENDING` — not reviewed;
- `APPROVED` — the reviewer confirms that all recorded facts in scope are
  supported, current enough for their cadence, and suitable for the stated
  non-advisory use;
- `NEEDS_CHANGES` — evidence or wording must change before approval; or
- `REJECTED` — the record must not be published in its current form.

An `APPROVED` record requires:

1. an identifiable reviewer and relevant qualification;
2. review of every exact official source used by the record, not only domain
   resolution or a search snippet;
3. confirmation that sources support every recorded fact and relationship;
4. confirmation that the record is within its review cadence or was
   re-verified after a trigger;
5. a durable evidence-bundle reference containing capture date, URL and
   checksum or equivalent integrity evidence;
6. `reviewedAt` and `approvalExpiresAt` dates; and
7. a decision note for any limitation, exception or conflicting source.

A `PARTIAL` record cannot become `APPROVED` until all evidence gaps affecting
the intended publication scope close. It may be excluded from a dataset-level
approval with an explicit exception. A `BLOCKED` record cannot be published or
drive notifications.

## Required review sequence

1. Freeze the dataset commit and regenerate the certification register.
2. Review the single `BLOCKED` record first, then all `PARTIAL` records and
   their linked `EVIDENCE-GAPS.md` controls.
3. Open each exact official source, capture the evidence, and compare every
   populated field and relationship with the source.
4. Route the record to the reviewer profile required by its track and subject.
5. Record `APPROVED`, `NEEDS_CHANGES` or `REJECTED` at record level. Never
   replace absent evidence with customary practice or an estimate.
6. Resolve changes through a new content revision, regenerate the source and
   certification registers, and re-review affected records.
7. Reconcile all record decisions and the evidence bundle before completing
   the dataset-level approval.
8. Keep the PB-001 feature dark until the intended published scope is approved
   and technically imported through an authorised, versioned workflow.

## Dataset-level decisions

The top-level `approval.status` may be:

- `PENDING` — no effective approval;
- `APPROVED` — all 256 records are approved and every programme gate is
  closed;
- `APPROVED_WITH_EXCEPTIONS` — every included record is approved and every
  excluded record or content class is enumerated; or
- `REJECTED` — the revision is unsuitable for publication.

`APPROVED_WITH_EXCEPTIONS` must fail closed: excluded records must not be
imported, searched, displayed or used for reminders. An exception cannot make
an unsupported fee, deadline or legal statement publishable.

## Gates that remain open

- 49 compliance-guide fields across 16 guides;
- the DCIP annual-return event;
- five provisional provincial-office domains;
- the unavailable Liquor Licensing Board portal affecting three records;
- three missing ZRP provincial-headquarters records;
- professional approval of compliance content and effective-dated calendar
  rules;
- durable source snapshots and evidence-history retention; and
- a deliberately versioned importer before compliance guides are consumed.

The indexed Ministry of Justice Client Service Charter appeared in search
results during PB-002 preparation, but its direct official PDF URL returned
404. It therefore does not close the DCIP annual-return or guide gaps.

## Approval record template

Complete this in the controlled evidence system and copy the decision metadata
into the certification register only after evidence review.

```text
Dataset commit:
Certification-register schema version:
Reviewer name:
Organisation or independent capacity:
Qualification and registration, where applicable:
Review track and record/category scope:
Decision: APPROVED | APPROVED_WITH_EXCEPTIONS | REJECTED
Exception record IDs:
Evidence-bundle reference and checksum manifest:
Decision date:
Approval expiry date:
Limitations or conflicts:

Declaration: I reviewed the stated scope against the cited official evidence,
recorded all material exceptions, and did not treat estimates or third-party
summaries as official approval.
```

## Re-review

Approval expires at the shortest cadence applicable to the approved scope and
earlier on any trigger in `REVIEW-POLICY.md`. A changed dataset commit,
official-source conflict, source-domain failure, new Gazette, budget or tariff,
or authority correction invalidates approval for affected records until they
are reviewed again.
