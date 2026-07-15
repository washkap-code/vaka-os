# Session handoff — current state and next-session kickoff

**Updated:** 2026-07-15 (after the P9 security cluster, branch consolidation and P2-005 shipped)
**Purpose:** boot a fresh Fable/Cowork session with zero lost context. Paste the
kickoff prompt at the bottom into the new session; everything it needs is in
this repository.

## Where everything lives (unchanged)

- **Code:** this repo (`vaka-os`), branch `main`. Server = Express 5 + Drizzle +
  Postgres; web = React + Vite + TS.
- **Git:** the sandbox has NO push credentials. Commit locally via shell git;
  PUSH via GitHub Desktop (confirm "Current Repository" = `vaka-os` first).
  Pushing `main` auto-deploys to Vercel.
- **Database:** shared Supabase project `vaka-platform` (`kjabilwcdwpncthbskvy`),
  co-located with GENFIN (25 `genfin_*` tables with real data). NEVER run
  `drizzle-kit push` / `db:push` against production. All schema changes are
  hand-applied as idempotent additive SQL via the Supabase MCP `apply_migration`,
  BEFORE the code that uses them is pushed.

## Migration ledger (production truth)

Highest migration on `main`: `0034_accounting_period_close.sql`.
**All migrations through 0034 are applied and verified in production**, including:

| Migration | Mission | Applied |
| --- | --- | --- |
| 0031_refresh_token_rotation | P9-010 | ✅ 2026-07-15 |
| 0032_restore_drill_evidence | OPS-016 | ✅ 2026-07-15 |
| 0033_finance_report_snapshots | P7-002 | ✅ 2026-07-15 |
| 0034_accounting_period_close | P2-005 | ✅ 2026-07-15 |

New migrations continue from **0035**.

## Shipped and live on `main` (this working period)

- **P9-010 v2** refresh-token rotation + replay containment (unique `jti` per
  access token; HttpOnly path-restricted cookie; single-flight web renewal).
- **P9-011 v2** privileged step-up: `/auth/step-up`, `X-Vaka-Step-Up` proof on
  owner team management, owner immediate contact deletion + APPROVE decisions,
  platform staff management, and (after OPS-016) restore-drill review. Finance
  routes deliberately excluded.
- **P4-004** supplier analytics (read-only, no DDL).
- **OPS-016** restore-drill evidence (extracted clean from the stale stack;
  review route step-up protected).
- **P7-002** immutable finance report snapshots (adapted to main's
  `report-pdf.ts`/`getReportBranding`; the stale "P2-008 branded report preview"
  twin was superseded by main's `aa34817` and must never be merged).
- **P7-003** is docs-only (mission defined, NOT implemented).
- **P2-005** financial period close (postJournal funnel + DB trigger; Owner-only
  audited reopen; Reports "Period close" tab; **accountant gate**).
- **CO-006** Paynow was already live; verified in production. **P5-001** already merged.

## Stale branches — do not merge

`codex/p9-010-refresh-token-rotation`, `codex/p9-011-privileged-step-up`,
`codex/ops-016-restore-drill-evidence`, `codex/p7-002-secure-report-snapshots`,
`codex/p7-003-secure-report-email-delivery`, `codex/p2-008-branded-finance-report-preview`
— all superseded by v2/extracted equivalents on `main`. They re-add old
0024/0025 migrations and pre-P9-009 auth. Safe to delete after review.

## Verification pattern that works (Linux sandbox, 45s bash cap)

Copy `server/` to `/tmp` (exclude node_modules), `npm install`, install
`embedded-postgres`; initdb a data dir; background processes are reaped between
calls but `/tmp/pgdata` persists, so restart pg in each call via a sourced
helper script. Create an empty db whose name contains "test", `drizzle-kit push
--force` into it, apply finance + procurement + finance-report-snapshot
integrity scripts, seed (needs `PLATFORM_ADMIN_PASSWORD` env), then run vitest
per-file in batches under 45s. Known quirk: `platform-admin-analytics.test.ts`
and `restore-drill-evidence.test.ts` rotate the seeded admin credential — reset
the admin password hash between reruns on the same scratch db.

## Remaining launch workstreams (in order)

1. **P2-007 payroll** (PAYE + NSSA, effective-dated). Largest remaining build.
   "Coming Soon" until a Zimbabwean accountant signs off. Note: the existing
   `docs/engineering/mission-packs/P2-007/` is the *invoice detail* mission —
   payroll needs a NEW mission id/pack (suggest P2-007-GA or P2-009-PAYROLL) to
   avoid the P2-008 id-collision mistake.
2. **DB-SEPARATION** — move VAKA to its own Supabase project
   (`docs/engineering/DATABASE-SEPARATION-PLAN.md`); needs a Vercel env change
   from the owner.
3. Production hardening: `ALLOWED_ORIGINS`, backup/restore drill, live email
   provider, observability (P10-002).
4. P7-003 secure report email delivery (mission pack exists, unbuilt).
5. Accountant evidence pack + legal pages; pilot; P10 launch checklist.

## Kickoff prompt for the next session (copy-paste)

> You are my technical lead for VAKA OS. Read
> `docs/engineering/SESSION-HANDOFF.md` in the connected "VAKA OS" folder first —
> it has the current state, constraints and verification pattern. Confirm main
> is clean and matches origin, confirm the migration ledger (highest applied =
> 0034, new ones start at 0035), then start the next workstream: [P2-007
> payroll / DB separation / hardening — pick one]. Same discipline as always:
> scoped diffs, scratch-Postgres verification, hand-apply idempotent DDL to
> production BEFORE pushing code, merge to main, push via GitHub Desktop,
> report what was verified and the exact SQL applied.
