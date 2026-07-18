# Draft Codex mission prompt — ZIMRA tax-administration extras (gap-closure 1 of 10)

Status: DRAFT — issue from the session that owns the Codex lane; renumber to
the next free PB number in the handoff before issuing.

---

You are the knowledge/content lead for VAKA OS. Read
`docs/engineering/SESSION-HANDOFF.md` and `AGENTS.md` first; do NOT edit the
handoff and do NOT commit to `main`.

Mission: close the ZIMRA-anchored research gaps declared by IND-000 (see
`docs/engineering/mission-packs/IND-000/GAP-BACKLOG.md`, mission slice 1).
Research from official sources ONLY (zimra.co.zw and gazetted statutory
instruments) and add Black Book records for, where evidence supports them:

1. Presumptive taxes for informal traders (categories as compliance events;
   no rate restated unless the official source states it and you cite it).
2. Fiscalisation of VAT operators (obligation, device categories, deadlines
   only as published).
3. Contract withholding tax and the tax clearance certificate (ITF 263).
4. Excise registration/duties for excisable products (obligation only).
5. Non-profit income-tax/VAT treatment (record only what ZIMRA publishes;
   otherwise declare unverified per PB-000C).
6. VAT treatment of agricultural produce and inputs (same rule).

Pattern: PB-000/PB-000C — licence_type / compliance_event / compliance_guide
records per `knowledge-system/10-country-packs/Zimbabwe/black-book/schema.md`,
field-level evidence status, empty values + notes for anything unverifiable,
`lastReviewed` dates, HTTPS official sources on every record. Update
`sources-register.json` for any new domains. Remember schema.md check 10: new
record kinds enter the PB-001 import whitelist only by deliberate extension —
do not modify server code.

Hard constraints: NEW worktree, NEW branch `codex/pb-tax-zimra-extras` from
current `origin/main`. Files ONLY under
`knowledge-system/10-country-packs/Zimbabwe/black-book/**` and
`docs/engineering/mission-packs/<assigned-PB-number>/**`. No server/, web/,
drizzle/ or workflow changes; no migrations; never commit a root
`package-lock.json`.

Finish with: the PB-000 validation checks passing (JSON parse, unique IDs,
resolvable references, HTTPS sources, guide invariants), a mission README +
COMPLETION declaring the content-review P-gate OPEN, and the branch committed
but unpushed with a summary.

Follow-up (separate mission, IND-000D): once these records merge, upgrade the
corresponding `industry_gap` records in
`knowledge-system/11-industry-packs/Zimbabwe/**` to verified
`industry_regulatory_link` records and regenerate the IND register.
