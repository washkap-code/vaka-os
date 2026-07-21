# Session handoff — current state and next-session kickoff

**Updated:** 2026-07-18 (session 22, Codex AI-foundation lane, branch
`feature/ai-foundation`: **owner-issued MISSION P12-001 AI Foundation
implemented and verified, but local commits are BLOCKED by the Codex approval
service usage limit.** The working tree contains the complete implementation
and must not be discarded. Migration `0056_ai_foundation.sql` adds governed
`ai_agents`, tenant/user-scoped conversations/messages/evidence and call facts
in `ai_audit`; its seed defines a read-only `object-summariser` with
zero tools and scopes limited to the six MetadataRegistry objects currently
marked AI-visible. A request-bound ContextAssemblyService requires exact
authenticated user+tenant identity, enforces the canonical object read
permission before any query/model call, binds every read to tenant_id, and
projects only `aiReadable` fields. Employee/User and unknown objects fail
closed. Timeline before/after values are re-filtered through the same field set;
workflow comments, notification bodies and unrestricted event payloads never
enter model context. Every canonical record and timeline fact becomes evidence
on the resulting assistant message. The provider-neutral ModelClient has one
dependency-free Anthropic HTTP adapter with lazy env-secret configuration;
non-AI startup remains available when AI config is absent. Every attempted
model call records only a SHA-256 prompt hash, model/token counts and evidence
count in `ai_audit`; no business-table mutation exists, enforced by an
architecture test. `POST /api/v1/ai/summarise` is authenticated, tenant scoped,
permission bounded and returns the summary plus persisted evidence. Store
P16-001 is a sibling branch, not merged into this P1-006 base, so the
conditional `requireFeature('ai')` guard is intentionally deferred to branch
integration. Migration reservations 0052–0055 preserve the already-issued
Network, Black Book, Migration and Store filenames; 0056 is the AI migration.
Verification on isolated PostgreSQL 18: final clean replay `0000`–`0051`, then
`0056`, with zero Drizzle drift; AI context/provider/write-boundary unit tests
12/12; endpoint/container/tenant-isolation tests 25/25; final server typecheck
clean; full server suite 112/112 files and 539/539 tests (258.87s). The guarded
down migration is present and statically reviewed, but its disposable execution
was not completed because the approval service rejected the final database
command after reporting its usage quota exhausted. The same quota then rejected
`git add`, so neither the implementation commit nor the mandatory final handoff
commit could be created. **NEXT SESSION FIRST ACTIONS:** preserve the current
working tree; once approvals are available, execute the 0056 down migration on
a disposable database, stage all implementation files except this handoff and
commit `feat(platform): add governed AI foundation`, then stage only this file
and create the mandatory final commit `chore(handoff): session handoff
2026-07-18`. Configure the requested branch upstream before its first GitHub
Desktop push. **DEPENDENCY TRUTH:** fresh fetch still showed `origin/main` does
not contain local P1-006; this branch is correctly based on P1-006 handoff
`1c4a182`. Reconcile/merge P1-003→P1-006 and the migration-0052→0055 module
branches before P12, then apply migrations in numeric order. Production remains
through 0047. Recommended next mission after integration: provider operations
hardening (secret provisioning, budgets/rate limits, redacted telemetry and
evaluation gates) plus the Store `ai` entitlement guard. No code/test blocker
remains; only the approval-quota commit/rollback proof and owner push/hosted
gates remain. Stale/dependency branches requiring reconciliation include the
local P1-003 through P1-006 stack plus Mail, Network, Black Book, Migration and
Store sibling branches.)

**Updated:** 2026-07-18 (session 21, Codex universal-audit lane, branch
`feature/platform-universal-audit`, implementation commit `ba0e12b`:
**owner-issued MISSION P1-006 Universal Audit & Timeline implemented and
verified.** Migration `0051_platform_universal_audit.sql` adds the singular,
tenant-scoped `audit_log` ledger without modifying the existing plural
`audit_logs` finance evidence table. A same-transaction database trigger
mirrors every authoritative legacy/finance append into the universal ledger;
canonical Company, Customer, Supplier, Product and Employee create/update/
delete paths additionally record metadata-registry-derived changed-field
snapshots through a transaction-scoped helper. Per-tenant writers serialize on
an advisory lock and SHA-256-chain `prev_hash + canonical record content`.
UPDATE and DELETE are blocked by revoked public grants plus a database trigger.
`GET /api/v1/objects/:type/:id/timeline` supports all eight canonical objects
and merges universal audit entries, `platform_events`, `workflow_actions` and
bounded notification facts in reverse chronology with pagination, tenant
scope, object permissions and API-exposed-field filtering; Invoice/Payment
history requires `accounting.read`. Platform staff with
`platform.tenant_audit.read` can run
`GET /api/v1/platform/audit/verify?tenantId=<uuid>`; the endpoint reports chain
integrity without exposing hashes or record content. The guarded down migration
was exercised on a disposable database and removed only `audit_log`, preserving
legacy `audit_logs`; it correctly refuses to discard non-derived auto-audit
evidence. Verification on isolated PostgreSQL 18: clean replay `0000`–`0051`
with zero Drizzle drift; runtime-schema readiness; idempotent test-control
installer; append-only/tamper, five-object CRUD diff, finance mirror, timeline
merge/order/pagination/permission/cross-tenant tests; focused supplier/audit
11/11; root server+web typecheck; web Vite production build; and exact final
server suite 107/107 files, 523/523 tests (290.15s). Hosted PostgreSQL 17 remains
the production-major gate. **DEPENDENCY TRUTH:** after a fresh fetch,
`origin/main` remains `d473650` (P1-002); P1-003, P1-004 and P1-005 are verified
local dependency commits but are not all present remotely. This branch is
correctly stacked on local P1-005 handoff `da46507`. Push/merge/reconcile in
strict order: P1-003, P1-004, P1-005, then P1-006. Production is applied through
0047; apply 0048, 0049, 0050 and 0051 in order before deploying P1-006.
**RISKS/NEXT:** tenant audit appends are intentionally serialized and can add
latency for unusually high write volume; retention/legal hold/export,
correlation IDs and integrity-failure alerting/recovery remain later work.
Recommended next mission: audit operations hardening (scheduled verification,
incident alerting, retention/legal-hold policy and governed export), after the
P1 dependency stack is merged. No implementation blocker remains beyond owner
push, strict dependency order and hosted gates. Stale/dependency branches to
reconcile: local `feature/platform-workflow-engine` and
`feature/platform-notification-service` are ahead of their remotes; local
`feature/platform-event-bus` and this P1-006 branch have no remote branch tip.)

**Previous:** 2026-07-18 (session 20, Codex event-platform lane, branch
`feature/platform-event-bus`, implementation commit `ca467bf`: **owner-issued
MISSION P1-005 Event Bus Hardening implemented and verified.** Migration
`0050_platform_event_bus.sql` adds tenant-scoped `platform_events` facts and
`processed_events` handler evidence; the guarded down migration was exercised
successfully on a disposable database clone. The composition root now uses a
PostgreSQL-backed, persist-first bus. Named handlers check durable idempotency
evidence, successful handlers preserve existing synchronous projections, and a
failed handler is isolated, recorded through status/retry count and structured
logging, retried three times with bounded in-process backoff, then marked
`failed` without failing the originating request. All domain/workflow events
remain queued until their owning transaction commits. `EventType` is a closed
typed union; `docs/platform/event-catalogue.md` lists the exact 24-event union,
payloads, publishers and subscribers and is enforced by test. Canonical minimal
facts now cover invoice/customer/product/employee creation, invoice approval,
and payment receipt; free-text invoice void reasons remain in audit evidence
and are deliberately excluded from persisted event payloads. Operations staff
with `platform.operations.read` can query a required tenant scope through
`GET /api/v1/platform/events` with bounded pagination/status/type filters.
Verification: migration replay `0000`–`0050` with zero structural drift;
runtime-schema readiness; down migration; focused event/workflow/notification/
tenant-boundary tests; root server+web typecheck; and complete server suite
105/105 files, 515/515 tests. Local database verification used the installed
PostgreSQL 18 runtime; hosted PostgreSQL 17 gates remain required because 17 is
the production major. **DEPENDENCY TRUTH:** `origin/main` remained at `d473650`
(P1-002) after a fresh fetch despite the kickoff saying P1-004 was merged. This
branch is correctly stacked on verified local P1-004 tip `8196582`, containing
P1-003 then P1-004. Merge/push in strict order: P1-003, P1-004, then P1-005,
reconciling each with current main. Production remains applied through 0047;
apply 0048, 0049 and 0050 in order before deploying this branch. **RISKS/NEXT:**
retries are process-local; a crash can leave `pending`/`retrying` events for a
future recovery worker, and synchronous persistence/delivery adds request-path
latency (the definitive local full suite took 249.88s). Recommended next mission: a leased
event recovery/replay worker and operator retry controls, without introducing
an external broker. No implementation blocker remains beyond dependency merge
order, owner push and hosted gates. Stale/dependency branches to reconcile:
local `feature/platform-workflow-engine` is ahead of its remote, local
`feature/platform-notification-service` is ahead of its remote, and this new
P1-005 branch has no remote commit yet.)

**Updated:** 2026-07-18 (session 16d, Cowork i18n lane, branch `feature/pi18n-001-locale-framework` at `904cacb`: **PI18N-002 and PI18N-003 gates CLOSED by owner self-certification — ChiShona and isiNdebele are now certified, not draft.** Owner decision (Dr. Washington Kapapiro, 2026-07-18): given dialect variation across ChiShona varieties and regional isiNdebele, VAKA standardises on widely understood standard varieties and the owner certifies the four dictionary files himself, superseding the external-translator gate. Certification records: `docs/engineering/mission-packs/PI18N-002/CERTIFICATION.md` and `.../PI18N-003/CERTIFICATION.md` — both records state honestly that the dictionaries were machine-drafted in-session and that this is owner-level product acceptance, NOT an independent professional translation review. Changes: four dictionary headers DRAFT→CERTIFIED; `languageDraftNotice` replaced by `languageReferenceNotice` ("English remains the authoritative reference version" in each language) in the account menu; landing language labels lose their draft suffixes; landing languageNotice, 'Local languages' capability and the Shona/Ndebele FAQ answer updated to certified phrasing; the pinned homepage-regression contract string updated to match. English remains the authoritative reference and runtime fallback (unchanged framework). Web-only; no server, schema or migration change; next free migration remains 0048. Verification: scoped typecheck over every file touched this round clean (full-project tsc and vite build could not complete inside the sandbox call limit this round — hosted CI remains the authoritative gate and must be green before merge); homepage regression 4/4 (updated contract); navigation-model 19/19; design-token + accessibility conformance green; runtime locale checks + override-key validation 10/10. SANDBOX NOTE: the main-checkout was switched to `test/full-suite-green` by a parallel lane mid-session, so this round was done in a dedicated worktree (`wt-pi18n`); stale unlink-blocked lock files now exist at `.git/worktrees/wt-pi18n/{HEAD.lock,index.lock}` in addition to any earlier tmp objects — the owner should delete all `.git/**/*.lock` and `.git/objects/**/tmp_obj_*` files from the host, plus the Jul-15 Finder artifacts `.git/{AUTO_MERGE 3,CHERRY_PICK_HEAD 3,MERGE_MSG 3}`. OWNER ACTIONS: (1) clean the stale git files above, (2) push `feature/pi18n-001-locale-framework` and open its PR — merge on green hosted gates, (3) prior queue unchanged. Owner identity: Dr. Washington Kapapiro, Owner of VAKA OS. RECONCILIATION: this branch was merged with origin/main (`fb91f6f`, LP-007 + PR #95) — the only conflict was this handoff file; main's session-16c LP-007 block is preserved below.)

**Previous:** 2026-07-18 (session 16b, Cowork i18n lane, branch `feature/pi18n-001-locale-framework` at `1d73033`: **PI18N-001 locale framework BUILT — draft ChiShona (sn) and isiNdebele (nd) now render across the workspace and the public site.** Web-only; no server, schema or migration change (next free migration remains 0048). New `web/src/locales/index.ts`: English (`app.en.ts`/`home.en.ts`) stays the authoritative baseline; sn/nd are partial override dictionaries deep-merged over English at runtime with per-key English fallback, so untranslated keys never break the UI. The active dictionary is updated IN PLACE (object identity preserved at every level) because several modules capture subtrees at module scope (`const copy = appEnglish.stepUp` etc.); `App.tsx`'s module-scope `AGEING_BUCKET_LABELS` became a lazy `ageingBucketLabels()` for the same reason. All 12 `appEnglish` import sites now alias the live dictionary (`import { appStrings as appEnglish } from "../locales"`) — zero call-site churn. Language preference persists in the existing shared `vaka_home_language` key; the landing selector (previously stored the choice but always rendered English) now renders the selected language via `homeCopyFor(locale)` and syncs the shared store; a new switcher in the workspace account menu (EN/ChiShona/isiNdebele + draft notice) triggers `<App key={locale}/>` remount from `main.tsx`. HONESTY CONTRACT UPDATED WITH BEHAVIOUR: `home.en.ts` languageNotice/labels/FAQ/'Local languages' copy now state that drafts are AVAILABLE pending native-speaker review, and the pinned contract string in `scripts/homepage-regression.test.mjs` was updated to match. Coverage: app sn 842 and nd 842 of 1,592 keys (all core flows — shell/nav/search/notifications, auth/step-up/holding, dashboard, contacts, suppliers, deals, products, invoices, tasks, documents, blackbook, payroll, billing, settings core, activity, imports core, reports core); the VAKA-staff `platformAdmin` console is DELIBERATELY English-only; home 93/148. **PI18N-002/PI18N-003 gate P remains OPEN: both dictionaries are machine-assisted DRAFTS and must be certified by qualified native-speaker translators before leaving draft labelling.** CORRECTION to the parallel session-16 note below: the untracked `web/src/locales/*` files it attributed to the PN-UI lane were THIS lane's PI18N-001 work in progress, now committed on this branch — no PN-UI relocation is needed for them. Verification: web typecheck clean; homepage regression 4/4 (updated contract); navigation-model 19/19; design-token + accessibility conformance green; `vite build` green in a Linux clean-room copy (the sandbox mount's macOS `node_modules` cannot run rolldown — not a regression); 13 runtime locale checks (translation, fallback, captured-subtree liveness, placeholder preservation, key-structure parity) plus override-key validation all pass. SANDBOX INCIDENTS: (1) mid-session, all tracked-file edits in the main worktree were externally reverted once while untracked files survived (consistent with a GitHub Desktop discard during the parallel lane's merge work) — changes were re-applied and re-verified; (2) a stale `.git/index.lock` (09:35) plus git tmp objects could not be unlinked from the sandbox (host-mount restriction) — commits were made with a detached `GIT_INDEX_FILE`; the owner should delete `.git/index.lock` and any `.git/objects/**/tmp_obj_*` files from the host, after which `git status` will read clean. OWNER ACTIONS: (1) delete the stale lock/tmp files above, (2) push `feature/pi18n-001-locale-framework` via GitHub Desktop and open its PR — merge on green hosted gates (routes untouched; no manifest impact expected), (3) engage qualified ChiShona and isiNdebele translators to certify the four dictionary files (PI18N-002/003), (4) prior queue below unchanged. Owner identity: Dr. Washington Kapapiro, Owner of VAKA OS.)

**Previous:** 2026-07-18 (session 16c, Cowork: **LP-007 COMPLETE — engineering gates for pilot are met.** Merged via `b83ae1e` + PR #95 (`77b1822`, current origin/main tip), all hosted gates green. Delivered: CI service containers pinned `postgres:16`→`postgres:17` (production major — `vaka-os-prod` is 17.x); single documented command `npm run test:full` (root + server) = migration replay + drift check → seed → entire vitest suite, wired into the `verify` job; `postgresql-client-17` installed from PGDG (the runner's preinstalled pg_dump 16 aborted with "server version mismatch" against PG 17 — the only defect found, environment class, fixed in PR #95); skip audit clean (zero .skip/.todo; four skipIf(env) guards that always execute in CI). Full report: `docs/engineering/mission-packs/LP-007/COMPLETION.md`. **PROCESS INCIDENT + STANDING RULE:** the first LP-007 commit reached `main` by DIRECT PUSH — a branch created from `origin/main` inherits it as upstream, and GitHub Desktop pushes there; ALWAYS run `git config branch.<name>.remote origin && git config branch.<name>.merge refs/heads/<name>` before a new branch's first push (PR #95's branch did, and pushed correctly). The post-hoc main-push CI validated the direct-pushed commit. With LP-001→LP-007 merged, the pilot-readiness engineering lane is CLOSED; the remaining launch items are operational, not code: LP-006 operator drill, monitoring/alert config, accountant + legal sign-off, staging acceptance, controlled onboarding. ANOTHER LANE COMPLETED THIS DAY (see 16b below): PI18N-001 locale framework on `feature/pi18n-001-locale-framework` (`1d73033`) — awaiting push/PR; sn/nd dictionaries stay DRAFT until certified translators close PI18N-002/003. REMAINING QUEUE: (1) LP-006 operator drill, (2) authenticated smoke (holding-page 200/400 matrix + step-up), (3) push/PR/review the parallel-lane branches (pi18n, PN-UI, IND-000) as they complete, (4) Wave 2 modules per MASTER-BUILD-PLAN §17 (PN-004/005, PB-005, P7-005→008, PV-003). Next free migration remains **0048**. Owner identity: Dr. Washington Kapapiro, Owner of VAKA OS.)

**Previous:** 2026-07-18 (session 16b, Cowork i18n lane, branch `feature/pi18n-001-locale-framework` at `1d73033`: PI18N-001 locale framework built — draft ChiShona and isiNdebele render across the workspace and public site; web-only, no migration; English remains authoritative with per-key fallback; verification green in a Linux clean-room build; the untracked `web/src/locales/*` files earlier attributed to the PN-UI lane were this lane's work in progress, since committed on its branch. Owner: push the branch, open its PR, merge on green; engage certified sn/nd translators for PI18N-002/003.)

**Previous:** 2026-07-18 (session 16, Cowork: **ALL THREE PRs MERGED and migration 0047 APPLIED — the merge lane is fully closed.** Merged to `main`: PR #92 PB-003 Black Book UI (`883cec7`), PR #93 LP-006 backup/restore (`7b6d485`), PR #94 PV-002 verification workflow (`3437c41`, current origin/main tip). Every merge followed Update-branch + full green hosted gates. **PV-002 needed three engineering fixes to get green, all on the branch before merge:** (1) its nine endpoints were missing from the tenant-isolation manifest — added (3 tenant `/verification/*`, 6 platform `/platform/verification/*`; exception count stays 22); (2) SCHEMA DRIFT: the composite-FK targets were declared `uniqueIndex()` in schema.ts but `drizzle-kit push` emits indexes AFTER foreign keys, so the reference build died mid-way — fixed by declaring the three targets (workspace_documents id+tenant, workspace_document_versions doc+version+tenant, verification_evidence id+tenant) as UNIQUE CONSTRAINTS in both schema.ts and 0047 (guarded DO-block ALTERs, still idempotent), plus dropping the two `DESC` index qualifiers 0047 had that the model doesn't emit; (3) the regression suite's FK introspection cross-multiplied composite-FK columns via information_schema (uuid=integer crash) — rewritten to zip conkey/confkey positionally via pg_constraint. LESSON for future migrations: composite-FK targets must be UNIQUE CONSTRAINTS, not bare unique indexes, and index definitions must match what drizzle-kit emits (no DESC). **Migration 0047 APPLIED + VERIFIED on `vaka-os-prod`** (2026-07-18): four verification tables exist empty, 4 triggers active, 3 composite unique constraints present, PRINCIPAL_ADMIN + OPERATIONS_ADMIN gained `platform.verification.review`. 0046+0047 are both live; `verify.centre` remains OFF everywhere (correct — PV-002's P-gate on VERIFIED policy meaning is open). PB-003 stays dark behind `blackbook.directory` pending PB-002 content certification. Next free migration: **0048**. PARALLEL LANES: `feature/pn-ui-network-surfaces` (PN-UI web surfaces) and `codex/ind-000-industry-seed` (industry knowledge seed) are active; NOTE the PN-UI session was observed writing `web/src/locales/*` files into the MAIN worktree instead of its own — those files are untracked and were never committed here; that session must relocate to its own worktree. REMAINING QUEUE: (1) LP-006 operator drill (backup role/key/dir/cron/alerts + encrypted backup and non-prod restore), (2) LP-007, (3) authenticated smoke (holding-page 200/400 matrix + step-up), (4) review/merge the two parallel-lane branches when complete, (5) Wave 2 modules per MASTER-BUILD-PLAN §17 (PN-004/005, PB-005, P7-005→008, PV-003 next). Owner identity: Dr. Washington Kapapiro, Owner of VAKA OS.)

**Previous:** 2026-07-17 (session 15c, summarised; its commit was superseded during merge churn: PRs #92 and #93 merged after green gates; parallel lanes launched.)

**Previous:** 2026-07-17 (session 15b, Cowork, same day continuation: **push-session incidents contained + PB-003 reviewed.** Facts: despite the owner reporting a merge, `origin/main` contains neither PV-002 nor LP-006 — PRs #91 (ops/backup-restore), #92 (codex/pb-003-blackbook-ui) and #93 exist unmerged. Incident 1: owner push commit `6b78a59` ("push") added the DPO study files and a macOS-generated root `package-lock.json`; the resulting production deploy FAILED on Vercel (`Cannot find module '../rolldown-binding.linux-x64-gnu.node'` — missing Linux optional dep). Production remains healthy on `57a6752`. Contained by `b8e35b4` on local `main`: removes the root lockfile, gitignores `/package-lock.json`, relocates the DPO pack to `docs/compliance/dpo/`. Incident 2: GitHub Desktop wrote two accidental "Force Push" commits onto `origin/ops/backup-restore` that DELETE the session-14 homepage media and re-add stale handoff text; local `ops/backup-restore` was rebuilt clean at `64efdb7` (= origin/main + the two LP-006 commits only) — it must be FORCE-pushed over the broken remote before PR #91 is merged, and PR #93 should be closed. **PB-003 REVIEWED — APPROVE (dark):** scope clean (no drizzle/migration files, routes behind `requireFeature("blackbook.directory")`, universal search checks the flag per tenant server-side and filters country+ACTIVE; registry stays read-only; completion report credible). Rebased onto current origin/main as local `codex/pb-003-blackbook-ui` at `b396023` (handoff chore dropped; one conflict resolved: shared-authenticated exception count 21→22 for the new `/blackbook/search`). Local gates green on the rebase: server+web typecheck, navigation-model suite, design-token + accessibility conformance. DB-backed blackbook suite runs on hosted CI at PR #92. NOTE: PV-002 and PB-003 both extend routes/manifest — whichever PR merges second must re-run the manifest count (expect one more reconciliation). PUSHES EXECUTED (Cowork drove GitHub Desktop, same session): `main` pushed through `ad75d94`; both feature branches were then REBUILT on the fixed main (their first rebases sat on `6b78a59` whose broken lockfile failed their Vercel builds) and force-pushed to their FINAL heads: `ops/backup-restore` = `f033f24`, `codex/pb-003-blackbook-ui` = `fce01f1` — all verified against origin refs; the PB-003 Vercel preview at `fce01f1` built READY, and production is READY on the fixed main. The accidental "Force Push" commits and the 28-file spurious worktree state were discarded, never committed. PR CORRECTION: the open PRs are **#93 = LP-006 (`ops/backup-restore`)** and **#92 = PB-003 (`codex/pb-003-blackbook-ui`)**; #91 is already closed. Do NOT close #93 — it now carries the repaired branch. REMAINING OWNER ACTIONS: (1) merge #93 and #92 when their hosted gates are green on the new heads, (2) open the PV-002 PR from `feature/pv-002-verification-workflow` (`b3e26f4`) and merge on green, (3) after PV-002 merges, apply 0047. ROOT-CAUSE NOTE for future sessions: GitHub Desktop's linked-worktree view shows stale Codex worktrees whose branch refs have moved — their working trees present massive spurious "changes" (including web-media deletions). ALWAYS discard those changes, never commit them; prefer pushing from the Main Worktree. Gate rule reminder: hosted CI must pass before every merge. Owner identity: Dr. Washington Kapapiro, Owner of VAKA OS.)

**Previous:** 2026-07-17 (session 15, Cowork reconciliation: **the LP-FIX lane is CLOSED.** Ground truth from git + production, superseding sessions 11–14 claims: LP-FIX-001 (`0fd3f5d`), LP-FIX-002 (`254abcd`) and LP-FIX-003 (`fd45d7d`) are all contained in `origin/main` and deployed — production `/healthz` and `/readyz` both pass and report version `5617f51` (= current `origin/main` tip), smoke-verifying LP-FIX-002 and proving the LP-FIX-001 build fix live. Remaining manual smoke: the authenticated holding-page 200/400 URL matrix and the step-up flow (LP-FIX-003/001 behavioural proof). **Migration 0046 is APPLIED and VERIFIED on `vaka-os-prod`**: `verification_evidence` exists with 0 rows and 4 indexes; Owner/Admin gained `verify.read`+`verify.manage`, Accountant `verify.read` — the "0046 not applied" entries below are historical. 0047 remains NOT applied (correct: waits for the PV-002 merge). **LP-006 rebased onto current `main`**: `ops/backup-restore` is now `f93c4dc` (feat) + `81855ea` (docs) on top of `5617f51`, with the two stale handoff chore commits dropped; all five shell scripts pass `bash -n`. Origin still holds the old `cb0a3cd` — the owner must FORCE-push this branch, then open its PR (hosted CI runs the seeded backup→restore gate); the operator encrypted-backup + non-production restore drill remains open. **PV-002** is pushed at `b3e26f4` with zero file overlap against `main`; open the PR and use GitHub's "Update branch" to satisfy strict up-to-date — no local rebase needed; the branch-local `ecb62f2` handoff commit is superseded by this file and need not be pushed. **Main's SESSION-HANDOFF.md contained 93 committed merge-conflict-marker lines** (sessions 8–13 collided); this commit restores the clean session-14 text and adds this block. The uncommitted `landing.css/tsx` working-tree changes found on the PV-002 checkout were already on `main` as `5617f51` — nothing was lost. Hygiene: untracked DPO study-guide files (`0*_DPO_*.md`, `04_HIT_*.md`, `output/DPO_Certification_Pack/`, root `package-lock.json`) sit in the repo root — unrelated content, do NOT commit. OWNER ACTIONS: (1) push `main` (this handoff commit), (2) force-push `ops/backup-restore`, (3) open PRs for LP-006 and PV-002, merge on green gates, (4) after PV-002 merges, apply 0047 to `vaka-os-prod`, (5) run the LP-006 operator drill. NEXT SESSION: apply 0047 post-merge, run authenticated smoke (holding-page matrix + step-up), then LP-007 and the PB-003 Black Book UI review (`codex/pb-003-blackbook-ui`), then Wave 2 modules. Owner identity: Dr. Washington Kapapiro, Owner of VAKA OS.)

**Previous:** 2026-07-17 (session 14, Cowork: **public marketing site redesign shipped to `main`** — commits `5a246d6` + `12c0bc2`, pushed (`fd45d7d..12c0bc2`) and auto-deploying to Vercel. Web-only; no server, schema or migration change. Adds photorealistic Zimbabwean business imagery, a cinematic hero video loop, a "Who VAKA is for" audience band with hover-to-play card loops, an editorial portrait, site-wide `prefers-reduced-motion`-safe scroll reveal, premium photographic treatment on the sign-in (`.auth`) and tenant holding screens, and a branded 1200×630 OG/Twitter share image wired into `web/index.html`. Assets under `web/public/media/`; new governed `--vaka-home-motion-*` tokens in `design-system/tokens.css`. Homepage guardrails green: design-token + accessibility conformance, homepage regression 4/4, server+web typecheck, web build. **PV-002 business verification workflow implemented and pushed** to `feature/pv-002-verification-workflow` at `b3e26f4` (sits on top of the two web commits). It adds the DRAFT→SUBMITTED→IN_REVIEW→APPROVED|REJECTED / APPROVED→REVOKED state machine, one-open-request-per-tenant partial unique index, append-only frozen evidence snapshots, kernel ApprovalService + P9-011 step-up review, a new platform verification permission, DB transition triggers, and migration `0047_verification_workflow.sql` (TAKEN on the branch; **NOT on `main`, NOT applied to production**). Ships dark behind `verify.centre`; VERIFIED policy meaning stays behind the P-gate. Server+web typecheck clean; the DB-backed server suite must run under CI or a local test env (`DATABASE_URL` + `CAPTURE_ENCRYPTION_KEY`/`PAYNOW_ENCRYPTION_KEY`). NEXT: open the PV-002 PR for hosted gates, then apply 0046 (PV-001) and 0047 to `vaka-os-prod` before enabling `verify.centre`; the LP-FIX / LP-006 lane is unchanged. Owner: Dr. Washington Kapapiro.)

**Previous:** 2026-07-17 (session 13, reconciled handoff: **DB SEPARATION EXECUTED 2026-07-16** — production runs on the dedicated Supabase project `vaka-os-prod` (`ewljdjvqngxweacgwedu`, eu-west-2, PostgreSQL 17.6; Ziproh organisation upgraded to Pro). The verified 0045-equivalent baseline was provisioned from Drizzle-generated DDL plus the integrity delta and proven byte-identical to the CI-chain replay. Five platform roles, four plans and the existing platform-administrator password hash were copied from `vaka-platform`; no reseed was required. Vercel `DATABASE_URL` was switched and production configuration was set for `MFA_ENCRYPTION_KEY`, `PAYNOW_ENCRYPTION_KEY`, `ALLOWED_ORIGINS`, `PUBLIC_APP_URL` and the full Fasthosts SMTP transport including `SMTP_REPLY_TO`. Application and SQL smoke tests passed: one tenant/contact/invoice/payment, two journals, debits and credits both `8050.00`, zero unbalanced journals and 26 audit rows. The owner-confirmed rollback hold ends **2026-07-23**; unless the owner explicitly extends it, preserve the former project's VAKA tables and keys through that date, then decommission and rotate them only after formal owner closure using the runbook in owner outputs. The cutover satisfied the former 0042–0045 production debt. Smoke testing exposed three micro-defects: LP-FIX-001 (step-up `VerificationOutcome` narrowing under Vercel TypeScript 6.0.3), LP-FIX-002 (health endpoints unreachable through Vercel rewrites, requiring API-prefixed aliases plus root rewrites) and LP-FIX-003 (holding-page settings 500 because `new URL()` could throw inside a Zod refine). All three now have locally complete isolated branches and branch-local completion reports, but remain unpushed/unmerged and require hosted gates plus post-deployment smoke proof. LP-006 is rebased and locally verified at `cb0a3cd`, also unpushed/unmerged. PV-001 is implemented in the effective merged baseline, ships dark behind `verify.centre`, took migration 0046 and leaves 0047 next; production application of 0046 remains required before enablement. Hygiene: tracked Finder artifact `approvals 4.ts` was removed. The PB-003 Black Book UI was issued to the Codex lane with no migration allowed; LP-007 remains queued after LP-005/006 containment. NEXT: push/review the micro-fixes independently, deploy and smoke-test them, close out LP-006, and proceed to LP-007. Owner identity: Dr. Washington Kapapiro, Owner of VAKA OS.)

**Previous:** 2026-07-17 (session 12, Codex: LP-FIX-001, LP-FIX-002 and LP-FIX-003 were locally complete on their isolated branches; LP-FIX-003 implementation was `9e01cd5`, LP-FIX-002 final handoff was `12c7987`, and LP-006 remained rebased and verified locally at `cb0a3cd`. Dedicated production was recorded at its 0045-equivalent baseline. The hold-end date was then awaiting owner confirmation and is now resolved to 2026-07-23.)

**Previous:** 2026-07-16 (session 8, Codex: LP-004 merged through PR #89 at `7bbb43a`; LP-003 merged through PR #90 at `d883d403`, with every quality, security, CodeQL and preview gate green. LP-005 completed locally at `ff2dd29` and was then awaiting owner push; it is now on `origin/main`. It added dependency-free liveness, schema/DB/SMTP readiness, one redacting JSON logger with request context, optional Sentry-compatible error capture, crash discipline, metrics-lite events and operator documentation. Final clean-room proof: migrations through 0045 with zero drift, tenant isolation 13/13, full server suite 96 files/454 tests, both typechecks and web build green. LP-005 took no migration; LP-006 was next.)

**Previous:** 2026-07-15 (session 3: PB-000/PB-000B Black Book Zimbabwe dataset reviewed and merged to main (`607a024`) — data + docs only, no code. ✅ PUSH GATE CLEARED: migration 0039 applied to production via a re-authorised VAKA-scoped Supabase MCP and verified — all three document tables exist empty, roles backfilled (Owner/Admin: documents.read+manage; Accountant: read only). Main is safe to push via GitHub Desktop.)

> **Protocol:** this file is read at the START of every session and updated as the
> FINAL commit of every session (`chore(handoff): session handoff YYYY-MM-DD`).
> See "Session Handoff Protocol" in `AGENTS.md`.
**Purpose:** boot a fresh Fable/Cowork session with zero lost context. Paste the
kickoff prompt at the bottom into the new session; everything it needs is in
this repository.

## Where everything lives

- **Code:** this repo (`vaka-os`), branch `main`. Server = Express 5 + Drizzle +
  Postgres; web = React + Vite + TS.
- **Git:** the sandbox has NO push credentials. Commit locally via shell git;
  PUSH via GitHub Desktop (confirm "Current Repository" = `vaka-os` first).
  Pushing `main` auto-deploys to Vercel.
- **Production database:** dedicated Supabase project `vaka-os-prod`
  (`ewljdjvqngxweacgwedu`), provisioned and cut over on 2026-07-16, running
  PostgreSQL 17.6 in `eu-west-2` under the Pro-tier Ziproh organisation, and
  verified at an effective 0045 baseline. NEVER run
  `drizzle-kit push` / `db:push` against production. Future schema changes are
  hand-applied as reviewed idempotent additive SQL through the approved
  Supabase SQL/MCP path before dependent code or flags are enabled.
- **Former shared project:** `vaka-platform` (`kjabilwcdwpncthbskvy`) remains
  intact as rollback protection through **2026-07-23**. Do not restore into it
  or remove its VAKA tables before the owner formally closes the hold. It is
  co-located with 25 `genfin_*` tables containing real GENFIN data; those
  tables and data are outside VAKA scope at all times.

### Dedicated-production cutover evidence (2026-07-16)

- Vercel production `DATABASE_URL` was switched to `vaka-os-prod`; required
  production configuration was set for `MFA_ENCRYPTION_KEY`,
  `PAYNOW_ENCRYPTION_KEY`, `ALLOWED_ORIGINS`, `PUBLIC_APP_URL` and the full
  Fasthosts SMTP transport including `SMTP_REPLY_TO`. No secret values belong
  in this repository.
- The 0045-equivalent schema was built from Drizzle-generated DDL plus the
  integrity delta and proven byte-identical to the CI migration-chain replay.
  Reference data copied from the former project comprised five platform roles,
  four plans and the existing platform-administrator credential hash; no
  reseed was required.
- Application and SQL smoke checks passed: one tenant, contact, invoice and
  payment; two journals; debits and credits both `8050.00`; zero unbalanced
  journals; 26 audit rows.
- The rollback hold ends **2026-07-23**, unless the owner explicitly extends
  it. The former project's VAKA tables and credentials may be decommissioned
  or rotated only after owner sign-off at formal hold closure, using the
  runbook retained in the owner outputs.

## Migration ledger (production truth)

Highest reserved/implemented migration in the active AI-foundation branch:
`0056_ai_foundation.sql`. Production is currently applied through
`0047_verification_workflow.sql`.
**The dedicated `vaka-os-prod` project was verified at an effective
0045-equivalent baseline on 2026-07-16.** This cutover satisfies the former
0042–0045 production debt; those migrations do not need to be hand-applied
again to the dedicated project.

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
| 0046_verification_vault | PV-001 | ✅ 2026-07-17 applied + verified on `vaka-os-prod` (table empty, 4 indexes, roles backfilled) |
| 0047_verification_workflow | PV-002 | ✅ 2026-07-18 merged and applied to `vaka-os-prod` |
| 0048_platform_workflow_engine | P1-003 Workflow Engine | ⚠️ TAKEN on `feature/platform-workflow-engine`; NOT applied to production; apply before deploying this branch |
| 0049_platform_notification_service | P1-004 Notification Service | ⚠️ TAKEN on `feature/platform-notification-service`; NOT applied to production; apply after 0048 and before deploying this branch |
| 0050_platform_event_bus | P1-005 Event Bus Hardening | ⚠️ TAKEN on `feature/platform-event-bus`; NOT applied to production; apply after 0049 and before deploying this branch |
| 0051_platform_universal_audit | P1-006 Universal Audit & Timeline | ⚠️ TAKEN on `feature/platform-universal-audit`; NOT applied to production; apply after 0050 and before deploying this branch |
| 0052_business_network_directory | P10-001 Business Directory Core | ⚠️ TAKEN on `feature/network-directory`; NOT applied to production |
| 0053_blackbook_core | P11-001 Black Book Core | ⚠️ TAKEN on `feature/blackbook-core`; NOT applied to production |
| 0054_migration_core | P15-001 Migration Hub Core | ⚠️ TAKEN on `feature/migration-core`; NOT applied to production |
| 0055_store_core | P16-001 Store Core | ⚠️ TAKEN on `feature/store-core`; NOT applied to production |
| 0056_ai_foundation | P12-001 AI Foundation | ⚠️ TAKEN in the uncommitted working tree on `feature/ai-foundation`; NOT applied to production |

The 2026-07-16 cutover includes 0042–0045 and eliminated the former production
debt; old `vaka-platform` application rows are historical rollback evidence.
Migrations **0046 and 0047 are applied to production**. Migrations **0048**
through **0056** are allocated across the owner-issued platform and module
missions above; none is applied to production. Reconcile and merge their
branches, then apply the migrations in numeric order before deploying P12-001.
The next free migration is **0057**; reserve it in this ledger before creating
another migration.

## Part II verification lane

- **PV-001 implemented, merged and production-applied:** the verification evidence vault ships
  dark behind `verify.centre`; flag-off APIs fail closed and its table ships
  empty. Implementation commit `be455d4`, merged-baseline handoff `9a3b4ce`.
  Migration `0046_verification_vault.sql` is applied to `vaka-os-prod`.
  Completion report:
  `docs/engineering/mission-packs/PV-001/COMPLETION.md`.
- **PV-002 implemented, merged and production-applied:**
  business verification workflow on `feature/pv-002-verification-workflow`,
  implementation `b3e26f4` (sits on top of the two marketing-site commits now
  on `main`). Tenant request state machine DRAFT→SUBMITTED→IN_REVIEW→
  APPROVED|REJECTED with APPROVED→REVOKED; one open request per tenant
  (partial unique index); append-only frozen evidence snapshots pinned at
  submission; platform review via the kernel ApprovalService + a fresh P9-011
  step-up proof; a new platform verification permission; every transition
  enforced in service code and by a DB transition trigger. Reviewer-anonymous
  tenant status; tenant-isolated read model for later PV-003. Ships dark
  behind `verify.centre`; VERIFIED policy meaning stays behind the P-gate.
  Migration `0047_verification_workflow.sql` is merged and applied to
  production. Mission pack: `docs/engineering/mission-packs/PV-002/README.md`.
- **Coordination:** PV-001 removed the tracked, unreferenced Finder artifact
  `server/src/platform/workflow/approvals 4.ts`. PB-003 Black Book UI was
  issued to the Codex lane with an explicit no-migration constraint. LP-007
  remains queued until LP-005 and LP-006 are contained in current `main`.

## Codex pilot-readiness lane

- **LP-001 complete and merged:** PR #87, merge commit `4afea0e`. Migration
  chain `0000`–`0045` replays transactionally with zero drift. Its original
  production-apply debt was satisfied by the dedicated project's verified
  0045-equivalent baseline on 2026-07-16.
- **LP-002 complete and merged:** PR #88, merge commit `d91a7b0`, branch
  `test/tenant-isolation-suite`.
  Manifest covers all 240 HTTP endpoints (199 tenant, 7 shared-authenticated,
  24 platform-only, 10 public). The 13-test launch gate found and fixed five
  issues: token/tenant claim mismatch acceptance, silently ignored tenant
  overrides, role lookup without tenant ownership, cross-tenant deal contact
  references, and inconsistent migration-reconciliation not-found status.
  Clean verification: migrations zero drift; 94 files/430 tests; both
  typechecks; runtime-schema check; web production build. No migration taken.
  Completion report:
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
  taken. Completion report:
  `docs/engineering/mission-packs/LP-004/COMPLETION.md`.
- **LP-004 production state:** the Fasthosts SMTP transport, including
  `SMTP_REPLY_TO`, was configured during the 2026-07-16 cutover. Confirm
  aligned SPF/DKIM/DMARC and representative mailbox delivery if that evidence
  is not already in the owner's cutover record. No secret values belong here.
- **LP-003 complete and merged:** PR #90, merge commit `d883d403`, branch
  `hardening/cors-config-lp003`; implementation commits `33666b5` and
  `072f14d`. The reconciliation audited every LP-003
  criterion and closed the remaining boot-config, CORS, secret-fallback, CSP
  and explicit-test gaps. A CodeQL alert then removed the remaining
  credentialed development-origin reflection, so every credentialed origin is
  now configuration-backed. No suspected real credential was found. Completion
  report: `docs/engineering/mission-packs/LP-003/COMPLETION.md`.
- **LP-005 complete and on `origin/main`:** implementation `ff2dd29`, handoff
  `45f46bc`. Adds `/healthz`, `/readyz`, one redacting JSON logger with request,
  tenant and user context, optional Sentry-compatible capture, fatal process
  handling, metrics-lite events and an operator monitoring page. Completion
  report:
  `docs/engineering/mission-packs/LP-005/COMPLETION.md`.
- **LP-FIX-001 complete locally, not pushed or merged:** branch
  `fix/step-up-verification-outcome`, implementation `61244eb`, final handoff
  `2dd6f96`. The failure branch now discriminates `VerificationOutcome` before
  accessing `.failure`, preserving the success and failure responses while
  aligning typechecking with Vercel's TypeScript 6.0.3 build. Completion
  report exists on that branch at:
  `docs/engineering/mission-packs/LP-FIX-001/COMPLETION.md`.
- **LP-FIX-002 complete locally, not pushed or merged:** branch
  `fix/health-endpoints-vercel-routing`, implementation `015d4a2`, final
  handoff `12c7987`. Root health URLs rewrite to the function ahead of the SPA
  fallback; root and `/api/v1/` Express registrations share the original
  unauthenticated handlers. Clean evidence: migrations zero drift, focused
  observability 11/11, full server 96 files/456 tests, both typechecks and web
  build. Production smoke verification remains required after deployment.
  Completion report exists on that branch at:
  `docs/engineering/mission-packs/LP-FIX-002/COMPLETION.md`.
- **LP-FIX-003 complete locally, not pushed or merged:** branch
  `fix/holding-page-url-validation`, implementation `9e01cd5`, final handoff
  `f8b16c6`. The exception-safe HTTPS predicate covers both holding-offer and
  branding URLs; empty/malformed/HTTP/HTTPS behaviour is regression-tested.
  Focused settings 5/5, migrations, both typechecks and web build are green.
  Local aggregate runs were degraded by host saturation; merge requires a
  clean hosted full-server gate. Completion report exists on that branch at:
  `docs/engineering/mission-packs/LP-FIX-003/COMPLETION.md`.
- **LP-FIX ledger reconciliation:** all three branch-local reports were written
  before PV-001 took migration 0046 and therefore record 0046 as free. That
  historical statement is superseded by the production-truth ledger above;
  the next free migration is 0047.
- **LP-006 rebased and verified locally, not pushed or merged:** branch
  `ops/backup-restore`, final commit `cb0a3cd`. The combined CI retains
  LP-005's full-server coverage and adds LP-006's seeded backup → throwaway
  restore → matching 10-table signature gate. No migration was taken.
  Completion report exists on that branch at:
  `docs/engineering/mission-packs/LP-006/COMPLETION.md`. Its historical
  statement that 0046 was free is likewise superseded by PV-001.
- **LP-006 operator gate:** provision the backup role, independent encryption
  key, encrypted directory, optional object storage, cron and alert; run one
  controlled encrypted backup and non-production restore drill before launch.
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
   the DISCARDED status needed a manual ALTER in scratch (production gets
   it via 0042 directly). Mission packs:
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
  deployed 2026-07-15; migration 0035 applied and verified). Employee
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

## Public marketing site — redesign shipped to `main` (2026-07-17, session 14)

Web-only redesign of the public site (`web/`), commits `5a246d6` + `12c0bc2`,
pushed to `main` and auto-deploying to Vercel. No server, schema or migration
change. Highlights: photorealistic Zimbabwean business imagery (six webp) and
five compact H.264 loops under `web/public/media/`; a cinematic hero video
loop and a "Who VAKA is for" audience band with hover-to-play card loops; an
editorial portrait in the story section; site-wide scroll reveal; premium
photographic treatment on the sign-in (`.auth`) and tenant holding screens;
and a branded 1200×630 OG/Twitter share image wired into `web/index.html`.
All motion is `prefers-reduced-motion` safe and gated to large screens; new
governed `--vaka-home-motion-*` tokens live in `design-system/tokens.css`.
Guardrails green: design-token + accessibility conformance, homepage
regression 4/4, server+web typecheck, web build. Imagery and video generated
via Higgsfield. This work did not touch any Part I/Part II platform mission.

## Stale branches — do not merge

`codex/p9-010-refresh-token-rotation`, `codex/p9-011-privileged-step-up`,
`codex/ops-016-restore-drill-evidence`, `codex/p7-002-secure-report-snapshots`,
`codex/p7-003-secure-report-email-delivery`, `codex/p2-008-branded-finance-report-preview`
— all superseded by v2/extracted equivalents on `main`. They re-add old
0024/0025 migrations and pre-P9-009 auth. Safe to delete after review.

`fix/migrations-0042-0044`, `test/tenant-isolation-suite`,
`feature/email-delivery`, `hardening/cors-config-lp003` and
`ops/health-logging` are fully contained in `origin/main` and are safe to
delete after review. Do not re-merge them.

Active local branches — **not stale and not contained in this reconciled
baseline**:
`fix/step-up-verification-outcome`,
`fix/health-endpoints-vercel-routing`,
`fix/holding-page-url-validation` and `ops/backup-restore`. Preserve them until
their independent reviews and merges are complete. The
`feature/pv-001-verification-vault` history is contained in this reconciled
baseline; preserve its branch until the owner push is confirmed, then it is
safe to delete after review.

`feature/platform-metadata-registry` is contained in `origin/main` through PR
#98 and is safe to delete after owner review. `feature/platform-workflow-engine`
is not yet contained in `origin/main` and must be pushed/merged first.
`feature/platform-notification-service` is the active stacked branch; preserve
it, push its two local commits, and merge it only after P1-003.

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
   **Wave 1 coordination:** PN-003 directory enquiries and PD-002
   approvals/retention are implemented. PB-003 directory UI + search was
   issued to the Codex lane with no migration allowed and remains gated by
   PB-002 content certification. Web UI for PN-001/002 surfaces can ride with
   PN-003.**
1. ~~Deploy P2-009~~ — DONE 2026-07-15: main pushed (auto-deployed to Vercel)
   and 0035 applied + verified in production.
2. **Payroll accountant sign-off**: engage a qualified Zimbabwean accountant
   to verify the 2026 PAYE/AIDS-levy/NSSA config in `zw.ts` (including the
   NSSA-deductibility treatment and the missing ZWG ceiling); on approval flip
   `verification.status` to APPROVED. Follow-on payroll missions when needed:
   non-statutory deductions, ZIMRA P2 export, payslip PDFs, net-pay
   settlement automation, ZWG runs.
3. **DB-SEPARATION — cutover complete, hold open through 2026-07-23:**
   dedicated production is `vaka-os-prod` (`ewljdjvqngxweacgwedu`) at the
   verified 0045-equivalent baseline. The production smoke test passed.
   Preserve the old VAKA tables in `vaka-platform` through the full hold and
   decommission them only after the owner formally closes it. Treat
   2026-07-23 as authoritative unless the owner explicitly extends the hold.
4. Production hardening: push/review/merge LP-FIX-001, LP-FIX-002 and
   LP-FIX-003 independently; deploy and smoke-test the fixes; push and merge
   LP-006; run the encrypted backup and non-production restore drill; verify
   LP-004 SMTP/DNS, `ALLOWED_ORIGINS`, health monitors and backup-failure
   alerts.
5. P7-003 secure report email delivery (mission pack exists, unbuilt).
6. Accountant evidence pack + legal pages; pilot; P10 launch checklist.

## NEXT MISSION (session 20): merge the platform stack, then recover persisted events

Push and merge the platform branches in strict dependency order: P1-003
workflow, P1-004 notifications, then P1-005 events. Rebase or merge current
`origin/main` at each review boundary and require the hosted PostgreSQL 17
quality gates. Apply migrations 0048, 0049 and 0050 in order only after their
corresponding branches merge. The next free migration is 0051. After P1-005 is
contained, implement a leased recovery/replay worker for persisted
`pending`/`retrying`/`failed` events plus permission-gated operator retry
controls; preserve the closed catalogue, minimal payloads and broker-free
architecture.

## Kickoff prompt for the next session (copy-paste)

> You are my technical lead for VAKA OS. Read
> `docs/engineering/SESSION-HANDOFF.md` and `AGENTS.md` first. P1-005 Event Bus
> Hardening is complete on `feature/platform-event-bus` above local P1-004 and
> P1-003. Fetch and verify remote truth, then push/review/merge P1-003, P1-004
> and P1-005 in that order with hosted PostgreSQL 17 gates green. Production is
> applied only through 0047; apply 0048, 0049 and 0050 in order after the
> corresponding merges. The next free migration is 0051. Then build a leased,
> broker-free event recovery/replay worker and admin retry controls for
> persisted pending/retrying/failed events. Preserve minimal typed payloads,
> tenant scope, handler idempotency and post-commit dispatch. The old
> `vaka-platform` rollback hold still ends 2026-07-23 unless the owner extends
> it.
