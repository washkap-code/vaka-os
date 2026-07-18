# IND-000 — Industry Pack knowledge seed (Zimbabwe: Retail, Construction, Agriculture)

**Lane:** Codex (knowledge/content) — queued per SESSION-HANDOFF after PB-002B.
**Branch:** `codex/ind-000-industry-seed` (from `origin/main` `7b6d485`).
**Scope:** data + docs only — `knowledge-system/11-industry-packs/**` and
`docs/engineering/mission-packs/IND-000/**`. No server/, web/, drizzle/ or
workflow changes; no migrations.

## Objective

Create the initial knowledge seed for the first three Zimbabwe industry packs
following the PB-000 Black Book dataset pattern: versioned JSON records,
official sources, `lastReviewed` dates, and declared-not-guessed evidence
discipline (PB-000C field-level precedent).

Per industry: (1) an industry profile (definition, sub-sectors, typical
business sizes); (2) a regulatory/licensing map that cross-references existing
Black Book record IDs instead of duplicating them; (3) common workflows and
KPIs the ERP should eventually support; (4) a terminology glossary; (5) a
per-industry `sources.json` register.

## Evidence rules

- `external_fact` records are `verified: true` only when the referenced Black
  Book record's own recorded facts (its `appliesTo`, `dueRule`, or category)
  directly support the applicability claim; source URLs are inherited from
  those records (their `lastReviewed: 2026-07-15` applies) and were not
  independently re-fetched in this revision — every such note says so.
- Workflows, KPIs and trade vernacular are declared `product_design` and are
  always `verified: false`: they are internal design assertions, not claims
  about the world.
- Regulatory bodies believed relevant but absent from the Black Book (AMA,
  TIMB, veterinary/movement permits, ZINWA abstraction permits, council plan
  approval, contractor registration/categorisation, construction NEC and
  federation, presumptive tax, fiscalisation, withholding tax/ITF 263, VAT
  treatment of produce) are declared as `industry_gap` records with **no
  invented fees, forms or deadlines** — each is a named research item for a
  future PB content mission.
- Official MSME/farm size thresholds are recorded as PB-000C-style unverified
  evidence fields with empty values and explanatory notes.

## Trust and failure behaviour

The seed is research and product input, not professional advice. Product
surfaces consuming it must show sources and review dates and direct users to
the authority for current requirements. A failed validation means the batch is
not usable; nothing partial may be imported.

## Verification

`node knowledge-system/11-industry-packs/validate.mjs` — JSON parse, contract
fields, kebab-case unique IDs, category-per-file, Black Book reference
resolution by category class, HTTPS-only sources, verified⇒sourced,
product-design/gap⇒unverified, ISO dates, evidence-field invariants, workflow
KPI resolution, and source-register domain coverage (checks adapted from
PB-001 / schema.md checks 1–8 and 10).
