# Zimbabwe Black Book evidence review policy

**Effective:** 2026-07-15

**Applies to:** the repository Black Book dataset, its source-domain register,
evidence-gap register and any later registry revision derived from them.

## Policy objective

Keep directory and compliance evidence current without weakening the frozen
record contracts in `schema.md`. Governance metadata belongs in the separate
source and gap registers. Unknown fields must never be added to existing data
records as a shortcut for ownership, expiry or source status.

The dataset is research evidence, not professional approval. A resolving URL
does not prove that a page still supports every recorded fact, and a verified
entity identity does not verify omitted contacts, fees, deadlines or forms.

## Accountable roles

| Role | Accountability |
| --- | --- |
| Zimbabwe Black Book content owner | Owns the review calendar, assigns reviewers, approves evidence changes and ensures overdue or unavailable evidence is not presented as current. |
| Source reviewer | Checks the exact source page, compares it with the affected records, captures review evidence and proposes status changes. |
| Authority liaison | Seeks primary evidence from the relevant ministry, regulator, council, parastatal or association when public sources are incomplete or conflicting. |
| Professional reviewer | Approves customer-facing legal, tax, accounting, environmental, employment or regulatory interpretation within their qualifications. |
| Registry owner | Imports only approved revisions, preserves non-destructive version history and ensures failed validation leaves the registry unchanged. |

Names and contact details for role holders belong in the controlled operating
record, not in the public seed dataset.

## Category review cadence

The baseline cadence below applies from the latest completed human review.
Where a record depends on multiple categories or source domains, the shortest
applicable cadence wins. A re-verification trigger always overrides the
calendar.

| Category | Baseline cadence | Review focus |
| --- | --- | --- |
| `government_organisation` | ANNUAL | Current identity, mandate, parent relationship, portfolio name and official channel. |
| `regulator` | QUARTERLY | Mandate, licensing scope, current forms, portals and published regulatory guidance. |
| `local_authority` | QUARTERLY | Authority identity, council-owned website, contact channels, licensing services and current local rules. |
| `utility` | QUARTERLY | Entity identity, service links, application channels and operational ownership. |
| `tender_portal` | MONTHLY | Portal availability, operator, authentication or registration path and tender-discovery function. |
| `business_association` | ANNUAL | Association identity, mandate, membership channel and current official website. |
| `licence_type` | QUARTERLY | Applicability, issuing authority, statutory basis, documents, renewal rule, form and processing statement. |
| `compliance_event` | MONTHLY | Obligation, cadence, due rule, effective date and authority-assigned exceptions. |
| `compliance_guide` | QUARTERLY | All eight evidence fields, with immediate review for fee, form, law or portal changes. |
| `service` | QUARTERLY | Service identity, owning authority and current transaction or information link. |

Source domains classified `PROVISIONAL` or `UNAVAILABLE` are reviewed monthly
regardless of publisher type. The `reviewCadence` in
`sources-register.json` records that domain-level schedule.

## Source-register semantics

- `domain` is the exact lowercase hostname extracted from any HTTPS URL
  anywhere in a dataset record. Leading `www` and service subdomains are not
  collapsed.
- `recordCount` counts unique records containing at least one HTTPS URL for
  the exact hostname. Multiple URLs from that hostname in one record count
  once.
- `authorityIds` contains authority-type record IDs directly using the domain,
  plus referenced issuing authorities or parent authorities for dependent
  licence, event, guide and service records. It is an impact index, not a
  claim that the publisher owns every listed authority.
- `RESOLVING` means no domain-level outage is recorded in the reviewed
  evidence. It does not certify every path or every fact.
- `PROVISIONAL` means the hostname is disclosed as temporary, test-labelled or
  otherwise unsuitable as a canonical public source.
- `UNAVAILABLE` means the official domain is recorded as unavailable and
  requires a restored service or official replacement.
- `lastChecked` records the human review date for the domain status and must
  not be advanced by merely regenerating counts.

The register is regenerated from the dataset before every publication review.
The domain set, each `recordCount`, all `authorityIds`, the dataset record
coverage and the sum of domain-to-record links must reconcile before approval.
Publisher names, publisher types, reliability notes, cadence and status remain
human-reviewed governance judgments.

## Re-verification triggers

Review affected domains, records and fields immediately when any of the
following occurs:

- a Gazette, Act, statutory instrument, regulation or by-law changes;
- a national or council budget statement, approved tariff or fee schedule is
  issued;
- Cabinet, ministerial portfolios, provincial structures, local-authority
  status or agency mandates change;
- an authority publishes a new form, service charter, portal, checklist,
  licence category, threshold, deadline or processing commitment;
- a source domain stops resolving, fails TLS validation, redirects to an
  unrelated publisher, returns persistent error responses or removes the
  supporting page;
- two official sources conflict or a source no longer supports the recorded
  fact;
- a regulator, council or other authority corrects information directly;
- a user reports that an official form, fee, office, contact or deadline is
  stale; or
- a publication or reminder would rely on evidence older than its cadence.

A search-result snippet, social-media repost, commercial intermediary or
undated screenshot cannot re-verify a record.

## Unavailable-domain rule

When a source domain changes to `UNAVAILABLE`, every dependent record is
queued for the next content review. At that review:

1. Identify all dependent records by exact hostname and confirm whether each
   material fact has another resolving official source.
2. If another official source independently supports every recorded fact,
   retain verification and replace or supplement the unavailable evidence in
   a reviewed revision.
3. If the unavailable domain is the only adequate evidence, downgrade the
   dependent generic record, licence type or compliance event to
   `verified: false`.
4. For a compliance guide, downgrade every field relying solely on that
   domain to `unverified`, clear its value and field sources as required by
   `schema.md`, and rebuild the guide's aggregate source list.
5. Do not silently delete the old URL. Preserve it in version history or the
   evidence log with the failed-check date, result and replacement decision.

This downgrade happens in the next authorised, versioned content revision;
PB-000F itself does not mutate existing records. Until review completes, a
customer-facing consumer must not present the affected evidence as newly
confirmed.

## Review procedure

1. Generate the exact-hostname inventory and dependent-record counts directly
   from all JSON data records.
2. Select domains and records due by the shortest category or domain cadence,
   plus every triggered item.
3. Open the exact official page, confirm publisher control, and compare the
   page with each recorded fact. Domain resolution alone is insufficient.
4. Record the check date, reviewer, page outcome, affected IDs and any
   conflict. Capture a durable snapshot and checksum when the approved
   evidence store becomes available.
5. Update `sources-register.json` status and metadata only from reviewed
   evidence. Update `EVIDENCE-GAPS.md` when a gap opens, changes owner, or
   receives sufficient closing evidence.
6. Propose record changes in a separate authorised content mission. Run the
   full schema, ID, source, date and relationship validation before approval.
7. Obtain professional approval for customer-facing compliance guidance and
   effective-dated calendar rules.
8. Import only an approved revision through the controlled registry workflow,
   preserving the prior version and audit evidence.

## Publication gates

- A `PROVISIONAL` source may support retained research evidence but cannot be
  presented as the canonical customer-facing link.
- An `UNAVAILABLE` source cannot close a new gap.
- `verified: false` compliance events cannot drive reminders or computed
  deadlines.
- Unverified compliance-guide fields remain empty and cannot be filled with an
  estimate, customary practice or third-party fee.
- Compliance guides remain outside the PB-001 import whitelist until PB-002
  resolves the professional-review and field-certification gates and the
  importer is deliberately versioned.
- A grouped evidence gap closes only after every item in its stated coverage
  has compliant evidence or an explicit, approved exclusion.

## Evidence preservation

Evidence reviews are additive. Preserve previous URLs, source status, review
dates, captured documents, checksums, reviewer decisions and supersession
reasons. Never overwrite a source snapshot or erase a failed check to make the
current revision appear continuously verified.

Source material may contain personal or operational contact information.
Capture only what is necessary for the directory purpose, store it in the
approved evidence location, and do not copy secrets, credentials or
unnecessary personal data into the repository.
