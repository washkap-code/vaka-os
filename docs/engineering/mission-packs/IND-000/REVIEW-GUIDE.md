# IND-000 — Content reviewer guide (closing the P-gate)

**Gate:** IND-000-P (content review) — OPEN.
**Register:** `knowledge-system/11-industry-packs/content-review-register.json`
(477 entries at base commit `4807127`, all `PENDING`).
**Validation:** `node knowledge-system/11-industry-packs/validate.mjs` must pass
after every register edit; it enforces that decided entries carry a reviewer
and date and that PENDING entries carry neither.

## Who reviews what

| Review track | Entries | Required role | What sign-off means |
| --- | ---: | --- | --- |
| `REGULATORY_LINK` | 110 | ZIMBABWE_CONTENT_REVIEWER | The applicability claim is correct for the industry and matches the referenced Black Book record; the note's caveats are adequate. |
| `RESEARCH_GAP` | 57 | ZIMBABWE_CONTENT_REVIEWER | The gap is real and correctly framed (or should be rejected/merged); confirmed gaps feed the PB backlog in `GAP-BACKLOG.md`. |
| `TERMINOLOGY` | 23 | ZIMBABWE_CONTENT_REVIEWER | The term's definition is accurate against the cited source. |
| `PRODUCT_DESIGN` | 287 | PRODUCT_REVIEWER | The workflow/KPI/vernacular content is sensible for the Zimbabwe market; no factual claim is smuggled into design text. |

Evidence statuses: `READY` (131) — supported by Black Book recorded facts;
`PARTIAL` (59) — declared gaps plus 2 honestly-unverified facts (the
Competition and Tariff Commission links); `DESIGN_ONLY` (287).

## Review mechanics

1. Work from the register; the record's full content lives in the industry's
   JSON files. Source URLs on verified records are inherited from the Black
   Book dataset (`lastReviewed: 2026-07-15`) and were not re-fetched — spot
   re-fetching during review is encouraged and any dead or contradicting
   source must downgrade the record.
2. Record each decision by setting `humanReviewStatus`
   (`APPROVED`/`NEEDS_CHANGES`/`REJECTED`), `reviewer`, `reviewedAt` and a
   `decisionNote` where the decision is not obvious.
3. Never add a fee, threshold, or deadline during review unless it comes with
   an official source — the correct route for new facts is a PB content
   mission, not an edit to an industry-pack note.
4. When all entries are decided, complete the top-level `approval` block and
   flip `gateStatus`. Partial certification (per-industry) is acceptable via
   the `exceptions` list, matching the PB-002 pattern.

## What the gate does NOT cover

Product enablement. Even after certification, industry-pack content reaches
tenants only through a deliberate product mission with its own feature flag
and importer decision (schema.md check-10 precedent: nothing enters a registry
import whitelist implicitly).
