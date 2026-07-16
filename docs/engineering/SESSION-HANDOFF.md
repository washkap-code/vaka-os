# Session handoff — current state and next-session kickoff

**Updated:** 2026-07-16 (session 8, Codex: LP-003 merged through PR #90 at `d883d40`. LP-FIX-001 is complete locally on `fix/step-up-verification-outcome` at `61244eb`: the step-up failure branch now uses an explicit false discriminant and both workspaces pin TypeScript exactly to the Vercel compiler, 6.0.3. Step-up 8/8, full server 95 files/444 tests, both typechecks and web build green. LP-005 remains local at `45f46bc`; LP-006 remains local at `d7fb5fe`; ship them in that order after this micro-fix. Dedicated production is `vaka-os-prod` (`ewljdjvqngxweacgwedu`), provisioned 2026-07-16 at a verified 0045-equivalent baseline; DB-SEPARATION is complete pending owner smoke test and hold, with old `vaka-platform` VAKA tables retained until post-hold decommission. No migration taken; 0046 remains free. NEXT: confirm this fix in Vercel, merge it, then ship LP-005, LP-006 and start LP-007. Owner identity: Dr. Washington Kapapiro, Owner of VAKA OS.)

**Previous:** 2026-07-15 (session 3: PB-000/PB-000B Black Book Zimbabwe dataset reviewed and merged to main (`607a024`) — data + docs only, no code. ✅ PUSH GATE CLEARED: migration 0039 applied to production via a re-authorised VAKA-scoped Supabase MCP and verified — all three document tables exist empty, roles backfilled (Owner/Admin: documents.read+manage; Accountant: read only). Main is safe to push via GitHub Desktop.)

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
- **Production database:** dedicated Supabase project `vaka-os-prod`
  (`ewljdjvqngxweacgwedu`), provisioned 2026-07-16 and verified at an
  0045-equivalent baseline. NEVER run `drizzle-kit push` / `db:push` against
  production. Future schema changes are hand-applied as reviewed additive SQL
  before dependent code or flags are enabled.
- **Former shared project:** `vaka-platform` (`kjabilwcdwpncthbskvy`) remains
  under the cutover hold. Do not restore into it or remove its VAKA tables
  until the owner smoke test and hold period are complete. GENFIN data is out
  of VAKA scope at all times.

## Migration ledger (production truth)

Highest migration on `main`: `0045_schema_runtime_alignment.sql`.
**The dedicated `vaka-os-prod` project is verified at an effective
0045-equivalent baseline as of 2026-07-16.** This is the production truth for
new work. The old shared project remains unchanged through the cutover hold.

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
| 0042_migration_hub | PM-001/002 | ✅ 2026-07-16 dedicated-project baseline |
| 0043_directory_enquiries | PN-003 | ✅ 2026-07-16 dedicated-project baseline |
| 0044_document_approvals | PD-002 | ✅ 2026-07-16 dedicated-project baseline |
| 0045_schema_runtime_alignment | LP-001 | ✅ 2026-07-16 dedicated-project baseline verified |

New migrations continue from **0046**. Coordinate reservations in this ledger
before creating another migration.

## Codex pilot-readiness lane

- **LP-001 complete and merged:** PR #87, merge commit `4afea0e`. Migration
  chain `0000`–`0045` replays transactionally with zero drift. Its original
  production-apply debt is superseded by the dedicated project's verified
  0045-equivalent baseline recorded above.
- **LP-002 complete and merged:** PR #88, merge commit `d91a7b0`, branch
  `test/tenant-isolation-suite`.
  Manifest covers all 240 HTTP endpoints (199 tenant, 7 shared-authenticated,
  24 platform-only, 10 public). The 13-test launch gate found and fixed five
  issues: token/tenant claim mismatch acceptance, silently ignored tenant
  overrides, role lookup without tenant ownership, cross-tenant deal contact
  references, and inconsistent migration-reconciliation not-found status.
  Clean verification: migrations zero drift; 94 files/430 tests; both
  typechecks; runtime-schema check; web production build. No migration taken;
  next remains 0046. Completion report:
  `docs/engineering/mission-packs/LP-002/COMPLETION.md`.
- **Required external gate:** GitHub branch protection for `main` requires
  `Tenant isolation regression` with strict up-to-date checking. Preserve this
  context when editing repository rules.
- **LP-004 complete and merged:** PR #89, merge commit `7bbb43a`, branch
  `feature/email-delivery`. Production SMTP is mandatory and boot-fatal when invalid;
  development/staging default to rendered JSON console output; tests use an
  in-memory assertion transport. Delivery retries at most three times and
  records structured events. Operators can query today's failures through a
  permission-gated endpoint. User invitation, password reset, invoice,
  statement and payment-reminder paths use `NotificationService`. No migration
  taken; 0046 remains free. Completion report:
  `docs/engineering/mission-packs/LP-004/COMPLETION.md`.
- **LP-004 operator action:** before production enablement, select the SMTP
  provider, store all nine `SMTP_*` values, verify aligned SPF/DKIM/DMARC and
  run representative mailbox tests. No live SMTP or DNS was touched by Codex.
- **LP-003 complete and merged:** PR #90, merge commit `d883d40`, branch
  `hardening/cors-config-lp003`. Aggregate fail-fast config, explicit CORS,
  secret hygiene, cookie/header/error controls and acceptance tests are on
  `main`. Completion report:
  `docs/engineering/mission-packs/LP-003/COMPLETION.md`.
- **LP-FIX-001 complete locally:** branch
  `fix/step-up-verification-outcome`, implementation `61244eb` plus this final
  handoff. The false `VerificationOutcome` branch is explicitly discriminated
  before reading `failure`; both workspaces pin TypeScript `6.0.3`. Runtime
  behaviour is unchanged. Completion report:
  `docs/engineering/mission-packs/LP-FIX-001/COMPLETION.md`.
- **LP-005 complete locally, not merged:** branch `ops/health-logging`, final
  commit `45f46bc`. Preserve and ship after LP-FIX-001.
- **LP-006 complete locally, not merged:** branch `ops/backup-restore`, final
  commit `d7fb5fe`. Preserve and ship after LP-005; run the controlled restore
  drill before launch.
   **PD-002 is DONE (2026-07-15, session 3):** document approvals with the
   second-person rule enforced in service AND by DB CHECK (decider ≠
   requester; one PENDING per document via partial unique index; decided
   approvals immutable), pinned to the document's current version;
   retention_until with an archive guard wired into the PD-001 archive
   path; all audited. Verified: document-approvals 4/4; regression
   document-workspace + critical 21/21; typecheck clean. Mission pack:
   `docs/engineering/mission-packs/PD-002/`. Codex lane: PB-002B merged
   (16 gaps closed, 1 evidence-backed verified flip, gate open);
   PB-002C reviewer-handoff prompt issued; IND-000 queued.
   **PN-003 is DONE (2026-07-15, session 3):** consent-first directory
   enquiries behind `network.directory`. Opt-in via `acceptEnquiries` read
   from the FROZEN published snapshot (consent follows publish semantics);
   self-enquiry blocked (DB CHECK); 10/day rolling rate limit per sender
   tenant; enquiries land in a register (crm.read) and NOTHING enters the
   CRM automatically — convert (creates one contact tagged directory-lead)
   or dismiss are explicit crm.write actions; all four events audited.
   Verified: business-profile 18/18; regression critical + migration-hub +
   finance tenant-isolation 27/27; typecheck clean. Mission pack:
   `docs/engineering/mission-packs/PN-003/`. Codex lane: PB-002B in
   flight; IND-000 (industry pack knowledge seed) queued behind it.
   **PM-001 + PM-002 are DONE (2026-07-15, session 3):** Migration Hub
   behind `migration.hub` (fail-closed). PM-001: `migration_projects` +
   `migration_steps` (STAGED/COMMITTED/ROLLED_BACK/DISCARDED) generalise the
   existing import framework into stage → validate → commit → reconcile →
   rollback/discard; contacts/products/opening-stock wired to the existing
   importers unchanged; rollback = guarded hard delete for contacts/products
   (409 if referenced), explicitly unsupported for opening stock v1;
   discard cancels a staged batch permanently; close blocked while STAGED.
   PM-002: opening trial balance resolved against the chart by code —
   commit needs asOfDate, refuses invalid rows and unbalanced TBs to the
   cent, posts ONE journal via postJournal; rollback posts the reversal
   journal (append-only); AR/AP open-item memo registers
   (`migration_open_items`) with contact matching; reconciliation report
   recomputes posted totals from journal_lines; owner-audited accountant
   sign-off on the project (the "P (accountant)" gate applies per real
   migration). Verified in scratch Postgres: migration-hub 12/12
   (incl. unbalanced-TB-leaves-ledger-unchanged and reversal-nets-to-zero
   proofs); regression critical/contact-imports 13/13, finance
   journal-balancing/immutability/tenant-isolation + product-imports 8/8,
   feature-flags/opening-stock-imports 9/9; typecheck clean. NOTE:
   drizzle-kit push does not update CHECK constraints on scratch reruns —
   the DISCARDED status needed a manual ALTER in scratch. The dedicated
   production baseline includes the 0042-equivalent constraint. Mission packs:
   `docs/engineering/mission-packs/PM-001/` and `PM-002/`.
   **CODEX LANE: PB-000F (source register/58 domains, evidence gaps,
   review policy) and PB-002 prep (certification register: 231 READY /
   24 PARTIAL / 1 BLOCKED, 256 human decisions PENDING — Codex correctly
   refused to fabricate approval) both reviewed and MERGED. PB-002B
   (evidence-gap closure sweep) prompt issued.**

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
  deployed, and included in the dedicated production baseline). Employee
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

`fix/migrations-0042-0044`, `test/tenant-isolation-suite`,
`feature/email-delivery` and `hardening/cors-config-lp003` are fully merged
through PRs #87–#90 and are safe to delete. Do not re-merge them.

`fix/step-up-verification-outcome`, `ops/health-logging` and
`ops/backup-restore` are active, isolated, unmerged branches. Preserve them
and ship in that order.

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
   and nav-model 16/16 clean. Migration 0039 was subsequently applied and
   verified; it is included in the dedicated production baseline. To pilot: enable
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
   **PUSH STATUS: owner pushed main twice on 2026-07-15 (latest through
   `8ba4108` — PN-001 + PB-000C live). Check the Actions tab for the CI
   security-gate runs. PN-002 (`22d21ef`, no migration) is safe to push.**
   **PN-002 is BUILT (2026-07-15, session 3) — ⚠️ privacy-review gate OPEN
   before tenant enablement:** business directory over PUBLISHED snapshots
   only. `GET /network/directory[?category|city|q|country]` +
   `GET /network/directory/:id` behind `network.directory`; projections are
   snapshot-only with opaque profile ids (never tenantId/status/draft
   columns); PN-001's DB CHECK makes unpublished ⇒ invisible a database
   invariant. No migration. Verified: business-profile 14/14 (incl.
   stale-draft-never-leaks and unpublish-vanishes proofs); regression
   critical/settings/finance tenant-isolation 19/19; typecheck clean.
   Before enabling the flag for a real tenant, complete the privacy review
   (consent wording, snapshot field set, contact opt-in UX, takedown) and
   record it in `docs/engineering/mission-packs/PN-002/`.
   **Codex lane: PB-000D (directory breadth expansion — councils,
   provincial offices, courts, central hospitals, ZRP provincial HQs;
   data + docs only) prompt issued in session 3, branch
   `codex/pb-000d-directory-expansion` from local main.**
   **Next Part II missions (Wave 1): PN-003 directory enquiries → CRM
   leads; PD-002 approvals/retention; PB-003 directory UI + search (after
   PB-002 content certification). Web UI for PN-001/002 surfaces can ride
   with PN-003.**
1. ~~Deploy P2-009~~ — DONE 2026-07-15: main pushed (auto-deployed to Vercel)
   and 0035 applied + verified in production.
2. **Payroll accountant sign-off**: engage a qualified Zimbabwean accountant
   to verify the 2026 PAYE/AIDS-levy/NSSA config in `zw.ts` (including the
   NSSA-deductibility treatment and the missing ZWG ceiling); on approval flip
   `verification.status` to APPROVED. Follow-on payroll missions when needed:
   non-statutory deductions, ZIMRA P2 export, payslip PDFs, net-pay
   settlement automation, ZWG runs.
3. **DB-SEPARATION — cutover complete, hold open:** dedicated production is
   `vaka-os-prod` (`ewljdjvqngxweacgwedu`) at the verified 0045-equivalent
   baseline. Owner must complete smoke testing and the hold. Decommission old
   VAKA tables in `vaka-platform` only after formal hold closure.
4. Production hardening: merge LP-FIX-001, LP-005 and LP-006; run the encrypted
   backup/non-production restore drill; provision and verify LP-004 SMTP/DNS;
   confirm CORS, health and backup-failure alerts in production.
5. P7-003 secure report email delivery (mission pack exists, unbuilt).
6. Accountant evidence pack + legal pages; pilot; P10 launch checklist.

## NEXT MISSION (session 9): close the micro-fix, then LP-005/LP-006/LP-007

Push `fix/step-up-verification-outcome`, confirm the Vercel production build
and GitHub gates, then merge it. Ship the existing LP-005 and LP-006 branches
in order; do not rebuild them. Run the controlled LP-006 restore drill. Start
LP-007 only after LP-001 through LP-006 are all contained in current `main`.
No migration was taken; 0046 remains free.

## Kickoff prompt for the next session (copy-paste)

> You are my technical lead for VAKA OS. Read
> `docs/engineering/SESSION-HANDOFF.md` and `AGENTS.md` first. Push
> `fix/step-up-verification-outcome`, confirm Vercel and GitHub are green, and
> merge it. Then ship the already-complete `ops/health-logging` and
> `ops/backup-restore` branches in order, run the controlled restore drill, and
> start LP-007 only after all six prerequisite missions are on current main.
> Production is `vaka-os-prod` (`ewljdjvqngxweacgwedu`) at an effective 0045
> baseline; retain the old `vaka-platform` VAKA tables through the owner hold.
> Migration 0046 remains free.
