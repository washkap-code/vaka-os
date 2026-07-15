# PB-000C — Completion report

**Branch:** `codex/pb-000c-compliance-guides`
**Base:** local `main` commit `19eff50`
**Status:** Dataset and documentation complete; local JSON, evidence and
relationship validation passed. Professional Zimbabwe compliance review and
downstream registry import remain pending.

## Files created or modified

| File | Change |
| --- | --- |
| `knowledge-system/10-country-packs/Zimbabwe/black-book/schema.md` | Added the compliance-guide entity, field-level evidence semantics, relationship rules and import gates |
| `knowledge-system/10-country-packs/Zimbabwe/black-book/data/compliance-guides.json` | Added one structured guide for each of the 18 PB-000B licence types |
| `docs/engineering/mission-packs/PB-000C/README.md` | Recorded outcome, scope, evidence controls, failure behaviour, verification and rollback |
| `docs/engineering/mission-packs/PB-000C/COMPLETION.md` | Recorded delivery, counts, validation, sources, risks and next mission |

No server, web, API, migration, script, package, lockfile, workflow,
production, database or session-handoff file was changed.

## Dataset summary

| Measure | Count |
| --- | ---: |
| Licence types in PB-000B | 18 |
| Compliance guides | 18 |
| Governed evidence fields | 144 |
| Verified evidence fields | 95 |
| Unverified evidence fields | 49 |
| Unresolved licence references | 0 |
| Unresolved authority references | 0 |

The 144 evidence fields are exactly eight per guide: who needs it, documents,
prerequisites, official fees, processing time, renewal cycle, official links
and steps. Every unverified field has an empty value and a source-gap note;
none contains an estimated value. Every guide has
`lastReviewed: "2026-07-15"`.

## Coverage delivered

- DCIP company and business-entity incorporation.
- ZIMRA taxpayer, VAT and PAYE employer registration.
- NSSA employer registration and PRAZ bidder or contractor registration.
- Harare business licensing and health registration.
- Bulawayo shop licensing and premises registration.
- National liquor licensing through the Liquor Licensing Board.
- EMA ESIA certification and effluent licensing.
- ZERA electricity generation, petroleum retail and LPG retail licensing.
- POTRAZ Unified Telecommunications Services licensing.
- MCAZ medicines-premises licensing.

## Local verification

- All ten Black Book JSON files parsed successfully with the local Node.js
  runtime; each root is an array.
- `compliance-guides.json` contains 18 records and
  `licence-types.json` contains 18 records.
- Each licence type is referenced exactly once by a guide.
- Every guide's `authorityId` resolves and matches the referenced licence
  type's `issuingAuthorityId`: **zero unresolved references**.
- Evidence status, empty/unverified values, verified source presence,
  sequential steps, aggregate-source membership, HTTPS links and uniform
  review dates passed.
- Generated evidence counts are 95 verified and 49 unverified.
- The staged `git diff --check` passed, and the staged path audit contained
  only the two authorised directory roots.

No npm install, application test, database-backed test, database access or
production action was run, as required by the mission boundary.

## Official sources consulted

All populated facts are attributed at field level in the JSON. The official
source set includes:

- [Ministry of Justice DCIP service](https://www.justice.gov.zw/?service=business-consulting)
- [ZIMRA taxpayer registration](https://www.zimra.co.zw/news/22-taxmans-corner/2346-taxpayer-registration), [new-business guidance](https://www.zimra.co.zw/domestic-taxes/corporate/new-businesses), [VAT registration](https://www.zimra.co.zw/frequently-asked-questions/1951-how-does-one-register-for-vat) and [TaRMS](https://mytaxselfservice.zimra.co.zw/)
- [NSSA employer registration](https://selfservice.nssa.org.zw/RegisterEmployer/MainDetails) and [employer guide](https://selfservice.nssa.org.zw/theme/dist/employers%20guide.pdf)
- [PRAZ bidder requirements](https://www.praz.org.zw/public-procurement-matters-registration-of-bidders-and-contractors/), [eGP steps](https://www.praz.org.zw/abridged-version-supplier-registration-stepsegpsystem/) and [eGP portal](https://egp.praz.org.zw/egp-)
- [City of Harare business-licensing resources](https://www.hararecity.co.zw/resources/of/business-licensing), [business form](https://www.hararecity.co.zw/resources/download/51), [health form](https://www.hararecity.co.zw/resources/download/50) and [premises checklist](https://www.hararecity.co.zw/resources/download/40)
- [City of Bulawayo Health Inspectorate](https://www.citybyo.co.zw/Health/Inspectorate), [licensing service](https://www.citybyo.co.zw/AZServices/Licensing) and [Chamber Secretary process](https://citybyo.co.zw/Faq/ChamberSecretary)
- [Ministry of Local Government liquor-licensing service](https://www.mlg.gov.zw/liquor-licensing/?service=liquor-licensing)
- [EMA ESIA guidance](https://ema.co.zw/eia/), [water and effluent guidance](https://ema.co.zw/water-and-effluent/) and [EMA licensing portal](https://acumatica.ema.co.zw/)
- [ZERA electricity forms](https://www.zera.co.zw/electricity-application-forms-regulations/), [petroleum forms](https://www.zera.co.zw/petroleum-application-forms-regulations/), [LPG forms](https://www.zera.co.zw/lpg-application-forms-regulations/) and their linked official forms, checklists, guidelines and statutory fee schedules
- [POTRAZ converged-licence guidance](https://www.potraz.gov.zw/wp-content/uploads/2025/06/Licence-Application-General-Guidelines.pdf) and [licence fee schedule](https://www.potraz.gov.zw/wp-content/uploads/2022/03/Licence-Categories-Including-Fees.pdf)
- [MCAZ licensing guidance](https://www.mcaz.co.zw/licensing-and-enforcement/licensing/), [online licensing services](https://www.mcaz.co.zw/online-services/), official premises form, regulations and fee schedule

## Risks and review notes

- This dataset is research evidence, not legal, tax or regulatory advice. A
  qualified Zimbabwe reviewer must approve customer-facing guidance.
- Authority websites and portal routes change. A future importer needs source
  snapshots, effective dates, review owners, expiry states and non-destructive
  version history.
- Forty-nine fields remain explicitly unverified, concentrated in authority
  fees, end-to-end processing times, renewal cycles and application sequences
  that were not published in current resolving official sources.
- DCIP's indexed service charter did not resolve during review, and the Liquor
  Licensing Board portal was unavailable. Neither was used to promote an
  unsupported fact.
- Harare proposed tariffs and Bulawayo fee ranges were not treated as current
  payable fees. Local-currency equivalents and threshold values were not
  copied where they can change or lacked a durable official rule.
- Formula, category and capacity-based fees must be revalidated for the
  applicant's exact facts before payment.

## Recommended next mission

Proceed to PB-002 for professional compliance-content certification: resolve
the 49 field gaps directly with the issuing authorities and add effective
dates, source snapshots, accountable review owners and publication approvals.
Only after that governance gate should a separate registry-import extension
consume the new `compliance_guide` entity or expose it in the Compliance
Centre.
