# Zimbabwe industry packs

Seed knowledge for the first three Zimbabwe industry packs: **retail**,
**construction**, and **agriculture** (IND-000).

Each pack contains an industry profile, a regulatory/licensing map that
cross-references the Zimbabwe Black Book by record ID (never duplicating it),
common workflows and KPIs the ERP should eventually support, a terminology
glossary, and a per-industry source register. The data contract and evidence
discipline are defined in `../schema.md`.

Evidence rules in brief: regulatory linkages are `verified: true` only when
the referenced Black Book record's own recorded facts support the claim;
product-design content (workflows, KPIs, vernacular terms) is always declared
`product_design` and `verified: false`; known regulatory gaps (bodies not yet
in the Black Book, e.g. sector marketing authorities or employment councils)
are declared as `industry_gap` records with no invented fees, forms, or
deadlines. Nothing in this directory is professional advice.

Content certification: the IND-000 P-gate (content review) is OPEN — see
`docs/engineering/mission-packs/IND-000/COMPLETION.md`.
