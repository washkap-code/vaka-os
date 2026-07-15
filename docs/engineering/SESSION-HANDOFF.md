# Session handoff — current state and next-session kickoff

**Updated:** 2026-07-15 (session 3: PB-000/PB-000B Black Book Zimbabwe dataset reviewed and merged to main (`607a024`) — data + docs only, no code. ✅ PUSH GATE CLEARED: migration 0039 applied to production via a re-authorised VAKA-scoped Supabase MCP and verified — all three document tables exist empty, roles backfilled (Owner/Admin: documents.read+manage; Accountant: read only). Main is safe to push via GitHub Desktop.)

> **Protocol:** this file is read at the START of every session and updated as the
> FINAL commit of every session (`chore(handoff): session handoff YYYY-MM-DD`).
> See "Session Handoff Protocol" in `AGENTS.md`.
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

Highest migration on `main`: `0041_business_profiles.sql`.
**Migrations through 0041 are applied and verified in production.**
(0036–0038 applied via Supabase MCP on 2026-07-15 BEFORE the code push;
verified: all new tables exist and are empty = flags OFF, no policies, no
rules — defaults unchanged everywhere).

| Migration | Mission | Applied |
| --- | --- | --- |
| 0031_refresh_token_rotation | P9-010 | ✅ 2026-07-15 |
| 0032_restore_drill_evidence | OPS-016 | ✅ 2026-07-15 |
| 0033_finance_report_snapshots | P7-002 | ✅ 2026-07-15 |
| 0034_accounting_period_close | P2-005 | ✅ 2026-07-15 |
| 0035_payroll_foundation | P2-009 | ✅ 2026-07-15 |
| 0036_tenant_feature_flags | FLAG-001 | ✅ 2026-07-15 |
| 0037_approval_policies | PW-002 | ✅ 2026-07-15 |
| 0038_task_automation | PW-003 | ✅ 2026-07-15 |
| 0039_document_workspace | PD-001 | ✅ 2026-07-15 (verified: tables empty, roles backfilled) |
| 0040_blackbook_registry | PB-001 | ✅ 2026-07-15 (verified: 3 tables exist, empty) |
| 0041_business_profiles | PN-001 | ✅ 2026-07-15 (verified: table exists, empty) |

New migrations continue from **0042**. **Migration numbers are reserved by
this (Cowork) session — parallel Codex work must NOT create migrations.**

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
- **P2-009 Zimbabwe payroll — technical preview** (merged to main `c7face0`,
  NOT yet pushed/deployed; migration 0035 pending production apply). Employee
  register, monthly runs, immutable payslips with calculation traces. PAYE
  bands / AIDS levy / NSSA are effective-dated config in
  `server/src/countries/zw.ts`; ZWG NSSA ceiling deliberately unconfigured
  (ZWG payroll fails closed). One balanced journal per posted run via
  postJournal (Dr WAGES_EXPENSE; Cr PAYE_PAYABLE / NSSA_PAYABLE /
  NET_WAGES_PAYABLE — accounts provisioned on demand); reversal-only
  corrections free the month for a re-run. New `payroll.read/manage/post`
  permissions (posting segregable from preparation). Web Payroll workspace
  behind `payroll.read` with the TECHNICAL_PREVIEW banner. Mission pack:
  `docs/engineering/mission-packs/P2-009-PAYROLL/`. **Accountant gate:** 2026
  figures transcribed from public summaries on 2026-07-15 — a qualified
  Zimbabwean accountant must verify the tables and the
  NSSA-deductible-before-PAYE assumption, then the pack `verification.status`
  flips to APPROVED. Verified in scratch Postgres: payroll 21/21;
  regression: period-close/journal-balancing/journal-immutability/
  tenant-isolation 13/13, critical 12/12,
  localisation-runtime/vat-treatment/auth-resolution 12/12; server+web
  typecheck clean; web vite build clean; nav model tests 16/16.

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

0. **NEW STRATEGY (2026-07-15):** the owner has approved building the entire
   remaining platform NOW, going live later, gate by gate. The authoritative
   map is `knowledge-system/13-roadmaps/MASTER-BUILD-PLAN.md` **Part II**
   (§15–§18): build-dark model, full mission catalogues for
   PW/PD/PN/PB/P7+/PM/PV/PS/P8+/PC/PX/PMOB/PI18N/PL, and build waves.
   Part I launch work still wins conflicts.
   **FLAG-001/002 are DONE (2026-07-15):** kernel FeatureFlagService,
   `tenant_feature_flags` (0036, applied to production), fail-closed
   `requireFeature` middleware, `/me.features`, feature-aware nav gating,
   step-up-protected audited admin toggles
   (`GET/PUT /platform/tenants/:id/features[/:key]`). Verified in scratch
   Postgres: feature-flags 8/8; regression platform-runtime/auth-resolution/
   payroll 33/33, critical + finance tenant-isolation 15/15; both typechecks
   and web build clean. Mission pack: `docs/engineering/mission-packs/FLAG-001/`.
   **PW-001 is DONE (2026-07-15):** kernel `ApprovalService`
   (`platform/workflow/approvals.ts`, token `APPROVAL_SERVICE`) owns approval
   outcomes, SoD enforcement and audit action naming; procurement requisition
   + PO approvals routed through it with byte-identical messages/behaviour
   (workflow-approvals 5/5; procurement-lifecycle, critical, supplier-bills,
   platform-runtime all green). No schema change. Mission pack:
   `docs/engineering/mission-packs/PW-001/`.
   **PW-002 is DONE (2026-07-15):** tenant-configurable approval policies
   (threshold + required permission + second person) evaluated fail-closed by
   the kernel ApprovalService; adopted by PO approval and payroll posting;
   audited settings endpoints under `settings.manage`; migration 0037 applied
   to production (empty = defaults unchanged). Verified: approval-policies
   8/8; procurement-lifecycle/payroll/workflow-approvals/critical 41/41.
   Mission pack: `docs/engineering/mission-packs/PW-002/`.
   **PW-003 is DONE (2026-07-15):** tenant task centre (`tenant_tasks`) +
   opt-in event automation from a closed rule catalogue
   (`automation_rules`; procurement-approval-task, supplier-bill-review-task)
   with open-task dedupe per subject; audited task close and rule toggles;
   migration 0038 applied to production. Verified: task-automation 6/6;
   procurement/supplier-bills/critical/events 20/20. Mission pack:
   `docs/engineering/mission-packs/PW-003/`.
   **P9-006 + P9-005 are DONE (2026-07-15):** Codex branch
   `codex/p9-006-ci-security` reviewed and merged to main (`8513676`).
   Scope verified: exactly the 8 authorised files (`.github/**` +
   `docs/engineering/**`), no server/web/migration changes. New CI on PRs and
   `main` pushes: per-workspace `npm audit --audit-level=high`, server+web
   typecheck, Gitleaks full-history secret scan, CodeQL JS/TS analysis,
   CycloneDX SBOM with 30-day artifact retention. Docs:
   `docs/engineering/INCIDENT-RESPONSE.md` and `FORENSIC-QUERIES.md` (8
   read-only SELECT blocks, validated as mutation-free). NOT yet verified:
   actual GitHub-hosted runs — check the Actions tab after the next push;
   Gitleaks may need an org licence (`GITLEAKS_LICENSE` secret) if the repo
   sits in a GitHub organisation. Coordination note: merge `30e87f1` (PW-004)
   had accidentally picked up the then-uncommitted workflows + P9-006 README,
   so those were already byte-identical on main; the P9-005 docs and
   completion reports arrived via this merge. Codex's worktree at
   `/private/tmp/vaka-p9-006-ci-security` shows as prunable from the sandbox
   but exists on the host — prune only from the host once Codex is finished
   with it. Stray `CHANGELOG 2.md` (macOS copy artifact, identical to
   `CHANGELOG.md`) deleted.
   **PW-004 is DONE (2026-07-15):** task centre is the first fully
   flag-governed surface — `/tasks*` and automation-rule settings behind
   `requireFeature("workflow.centre")`, subscriber checks the flag, web
   "Tasks" page + nav visible only with the flag. No migration. Verified:
   task-automation + feature-flags 14/14 (after the documented scratch-db
   admin credential reset); web typecheck/build/nav-model green. To pilot:
   enable `workflow.centre` for a tenant via the platform features endpoint.
   Mission pack: `docs/engineering/mission-packs/PW-004/`.
   **The PW programme (Wave 1 workflow slice) is complete: PW-001→004.**
   **PD-001 is DONE (2026-07-15):** documents workspace — folders (partial
   unique indexes per level), classified documents, immutable version rows
   (capture-storage envelope: PNG/JPEG/PDF ≤1.5 MB, SHA-256 checksums),
   archive/restore, all writes audited. Content reads flow through the
   P1-007 kernel document service via the new `workspace-doc` kind. Routes
   behind `requireFeature("documents.workspace")` + new
   `documents.read/manage` permissions (role backfill for
   Owner/Admin/Accountant in 0039). Web Documents page + flag-gated nav.
   Verified in scratch Postgres: document-workspace 9/9; regression
   critical/document-adapter/capture-documents/feature-flags/
   task-automation/auth-resolution/tenant-isolation/settings/
   journal-balancing/journal-immutability 44/44; both typechecks, web build
   and nav-model 16/16 clean. ⚠️ Migration 0039 NOT yet in production —
   this session's Supabase MCP was scoped to the wrong org (BioCheck).
   Apply `server/drizzle/0039_document_workspace.sql` (idempotent) via the
   Supabase SQL editor or a VAKA-scoped MCP, verify the three tables exist
   empty and roles gained documents.*, THEN push main. To pilot: enable
   `documents.workspace` per tenant via the platform features endpoint.
   Mission pack: `docs/engineering/mission-packs/PD-001/`.
   **HOUSEKEEPING (2026-07-15):** removed 9 macOS "copy" duplicate artifacts
   accidentally committed in 68472b2 (old twins of approvals.ts, tasks.ts,
   migrations 0037/0038, approval-policies tests, PW-002 README) — commit
   `42bc4b4`. Watch for Finder-created " 2"/" 3" files before committing.
   **CODEX LANE — PB-000 + PB-000B are DONE and MERGED (2026-07-15):**
   branch `codex/pb-000-blackbook-dataset` (2 commits, `27d0d02` + `f51e3aa`)
   reviewed and merged to main (`607a024`). Scope audit: 14 files, +2,236
   lines, ALL within `knowledge-system/.../Zimbabwe/black-book/**` and
   `docs/engineering/mission-packs/PB-000*/` — no server/web/migration
   files. Content validation (scripted): 9/9 JSON parse, 113 unique records,
   0 duplicate IDs, 78 cross-references all resolved, every record has
   official sources, all `lastReviewed` = 2026-07-15, exactly 1 unverified
   record (`dcip-company-annual-return`, charter URL unavailable — declared,
   not guessed). Liquor authority correctly recorded as the national Liquor
   Licensing Board under Local Government. The PB-002 "P (content review)"
   gate (fees/deadlines sign-off by a human reviewer) remains OPEN — the
   dataset is merged but not yet content-certified. Codex's worktree at
   `/private/tmp/vaka-pb-000-blackbook-dataset` shows prunable from the
   sandbox but exists on the host — prune from the host when Codex is done.
   **Next Codex mission: PB-000C (licence/permit compliance guides, data +
   docs only — the PB-004 content). Prompt issued in session 3; branch
   `codex/pb-000c-compliance-guides` from local main. Codex must NOT touch
   server/ or drizzle/ — PB-001 was built in parallel in the Cowork lane.**
   **PB-001 is DONE (2026-07-15, session 3):** Black Book registry —
   `blackbook_entries` (unique per country+key, kebab-case/category/status
   checks) + immutable `blackbook_entry_versions` + `blackbook_import_runs`
   (migration 0040, applied to production, tables empty = nothing changes).
   Global platform content, deliberately no tenant_id. Only write path:
   `POST /platform/blackbook/import` (platform.settings.manage + step-up,
   audited `platform_blackbook.imported` to platform_audit_logs);
   all-or-nothing imports implementing schema.md validation checks 1–8 + 10
   (per-category field whitelists, global ID uniqueness, reference
   resolution with authority-category rules, HTTPS sources, ISO dates,
   cadence enums); failed import leaves the registry unchanged. Tenant
   reads `GET /blackbook/entries[/:key]` behind `blackbook.directory`
   (fail-closed), detail responses carry sources + lastReviewed + a
   not-professional-advice notice. Verified in scratch Postgres: blackbook
   27/27 (incl. importing the real 113-record seed with zero errors);
   regression feature-flags/task-automation 14/14, critical 12/12, finance
   tenant-isolation/journal-balancing/journal-immutability 7/7,
   auth-resolution/platform-runtime 12/12; server typecheck clean. No web
   changes (PB-003 delivers UI). To seed production: platform staff POSTs
   the dataset to the import endpoint after the code deploys, then enable
   `blackbook.directory` per pilot tenant. Mission pack:
   `docs/engineering/mission-packs/PB-001/`.
   **HOUSEKEEPING (session 3):** removed 4 more untracked Finder " 2" copy
   artifacts (twins of the PD-001 files, verified byte-identical before
   deletion). Also cleared a stale `.git/HEAD.lock` + tmp object left by a
   sandbox-mount unlink failure during the merge.
   **PN-001 is DONE (2026-07-15, session 3):** opt-in public business
   profile from the canonical Company — `business_profiles` (migration 0041,
   applied to production, table empty = nothing changes; DB CHECK forbids a
   snapshot on non-PUBLISHED rows). Privacy model: nothing public by
   default; edits never leak; OWNER-only publish freezes an explicit
   snapshot (contact details only when showContact=true) that the future
   PN-002 directory reads exclusively; unpublish removes it immediately.
   Routes behind `network.directory` (fail-closed): GET/PUT
   /network/profile (settings.manage, audited), POST
   /network/profile/publish|unpublish (tenant owner, audited). Verified in
   scratch Postgres: business-profile 10/10 (incl. snapshot-freeze and
   contact-exclusion proofs); regression critical+settings 16/16, blackbook
   27/27, feature-flags 8/8 (admin suites per-file with the documented seed
   reset). Server typecheck clean. No web changes (PN-002 delivers UI).
   Mission pack: `docs/engineering/mission-packs/PN-001/`.
   **CODEX LANE — PB-000C is DONE and MERGED (2026-07-15):** Zimbabwe
   licence compliance guides (branch `codex/pb-000c-compliance-guides`,
   commit `4e191a9`, merged `0f98043`). Scope audit clean: 4 files, all in
   black-book/** + mission-packs/PB-000C/**. 18 guides — one per licence
   type, 0 unresolved references, field-level evidence model
   (status verified/unverified per field; 95 verified, 49 unverified with
   explanatory notes and empty values — nothing guessed), lastReviewed
   2026-07-15 throughout. NOTE: `compliance_guide` is deliberately NOT in
   the PB-001 registry import whitelist — guides stay out of the registry
   until PB-002 certification resolves the 49 evidence gaps and the
   importer is deliberately extended (schema.md check 10).
   **PUSH STATUS: owner pushed main through PB-001 (`0636361`) on
   2026-07-15 — deployed via Vercel; first CI security-gate run should be
   checked in the Actions tab. Unpushed: PN-001 + PB-000C merge + this
   handoff. 0041 is already applied, so main is SAFE TO PUSH.**
   **Next Part II missions (Wave 1): PN-002 business directory (privacy
   review gate) now unblocked by PN-001; PB-003 directory UI + search
   (after PB-002 content certification); PD-002 approvals/retention.
   Codex lane: next data/docs mission at owner's discretion (e.g. PB-006
   tender-portal curation dataset or industry-pack knowledge content).**
1. ~~Deploy P2-009~~ — DONE 2026-07-15: main pushed (auto-deployed to Vercel)
   and 0035 applied + verified in production.
2. **Payroll accountant sign-off**: engage a qualified Zimbabwean accountant
   to verify the 2026 PAYE/AIDS-levy/NSSA config in `zw.ts` (including the
   NSSA-deductibility treatment and the missing ZWG ceiling); on approval flip
   `verification.status` to APPROVED. Follow-on payroll missions when needed:
   non-statutory deductions, ZIMRA P2 export, payslip PDFs, net-pay
   settlement automation, ZWG runs.
3. **DB-SEPARATION** — move VAKA to its own Supabase project
   (`docs/engineering/DATABASE-SEPARATION-PLAN.md`); needs a Vercel env change
   from the owner.
4. Production hardening: `ALLOWED_ORIGINS`, backup/restore drill, live email
   provider, observability (P10-002).
5. P7-003 secure report email delivery (mission pack exists, unbuilt).
6. Accountant evidence pack + legal pages; pilot; P10 launch checklist.

## Kickoff prompt for the next session (copy-paste)

> You are my technical lead for VAKA OS. Read
> `docs/engineering/SESSION-HANDOFF.md` in the connected "VAKA OS" folder first —
> it has the current state, constraints and verification pattern. Confirm main
> is clean and matches origin, confirm the migration ledger (all through 0035
> applied in production; new migrations start at 0036), then start the next
> workstream: [payroll accountant sign-off support / DB separation /
> hardening — pick one]. Same discipline as always: scoped
> diffs, scratch-Postgres verification, hand-apply idempotent DDL to
> production BEFORE pushing code, merge to main, push via GitHub Desktop,
> report what was verified and the exact SQL applied.
