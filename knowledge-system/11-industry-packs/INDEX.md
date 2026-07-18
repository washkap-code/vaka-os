# Index - 11-industry-packs

- `schema.md` — Industry Pack seed data contract (IND-000)
- `validate.mjs` — validation script (adapted from the PB-001 import checks)
- `content-review-register.json` — P-gate review register (PB-002 pattern); all entries PENDING
- `Zimbabwe/retail/` — Retail industry pack seed (IND-000)
- `Zimbabwe/construction/` — Construction industry pack seed (IND-000)
- `Zimbabwe/agriculture/` — Agriculture industry pack seed (IND-000)
- `Zimbabwe/mining/` — Mining industry pack seed (IND-000B)
- `Zimbabwe/healthcare/` — Healthcare industry pack seed (IND-000B)
- `Zimbabwe/manufacturing/` — Manufacturing industry pack seed (IND-000B)

Each industry directory contains `profile.json`, `regulatory-map.json`,
`workflows.json`, `kpis.json`, `glossary.json` and `sources.json`.
Regulatory content cross-references the Zimbabwe Black Book by record ID and
is never duplicated here. Content certification: the IND-000 P-gate (content
review) is OPEN and covers all six packs.
