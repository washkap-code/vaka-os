# VAKA OS — Super Admin Compliance Centre Missions (LP-008 → LP-010)

**Programme:** Pilot Launch Readiness — Compliance & Governance Tooling
**Repository:** vaka-os
**Prerequisites:** LP-001 (migrations) and LP-002 (tenant isolation) merged. May run in parallel with LP-003–007 on separate branches, but LP-008 → LP-009 → LP-010 must run in this order relative to each other.
**Launch note:** LP-008 and LP-009 are required before launch (they hold the compliance evidence and schedule). LP-010 (AI layer) is desirable but not launch-gating.
**Standing rules:** Same as all VAKA missions — no architecture redesign, no scope expansion, reuse existing platform services (auth, roles, document storage, notifications, audit), all existing tests pass, standard completion report.

**REPO-SPECIFIC RULES (from docs/engineering/SESSION-HANDOFF.md — binding):**
- New migrations continue from **0045**, idempotent additive SQL only. Migration numbers are reserved by the Cowork session — before writing any migration, CHECK SESSION-HANDOFF.md for the current highest number and record the numbers you take in your completion report so the ledger can be updated.
- NEVER run `drizzle-kit push` / `db:push` against production. Migrations are hand-applied via the Supabase MCP / SQL editor BEFORE the code using them is pushed.
- Note: migration `0032_restore_drill_evidence` (OPS-016) already exists — LP-008/LP-009 MUST inspect it first and reuse/extend it for drill evidence instead of creating a parallel structure.
- All new surfaces flag-gated and failing closed, consistent with existing conventions (see 0036_tenant_feature_flags usage).

Copy each mission into Codex verbatim, one at a time, after the previous PR is merged.

---

## MISSION LP-008 — Super Admin Document Management System (Compliance Vault)

```
MISSION ID: LP-008
BRANCH: feature/superadmin-dms
PRIORITY: High — launch-gating.

OBJECTIVE
Build a platform-level (NOT tenant-level) document management area inside the
Super Admin section of VAKA OS, where the platform owner stores and controls
all governance documents: compliance sign-offs, runbooks, policies, terms,
user manuals, support documentation and drill evidence.

READ FIRST
- Existing roles/permissions model (Super Admin role and how admin-only routes
  are protected).
- Existing document/file storage service (reuse it — do not build new storage).
- Existing audit service.
- docs/ops/RUNBOOK-RESTORE-DRILL.md and docs/ops/ROLLBACK-CRITERIA.md
  (these are seed content).

SCOPE — DATA MODEL
Create platform-scoped entities (no tenantId — these belong to the platform,
and must be invisible and unreachable from any tenant context):

1. AdminDocument
   - id, title, description, category, fileRef (existing storage), mimeType,
     version (integer, auto-increment per document), status
     (DRAFT | ACTIVE | SUPERSEDED | ARCHIVED),
     effectiveDate, reviewDueDate (nullable),
     uploadedBy, createdAt, updatedAt.
   - Uploading a new file to an existing document creates a new version and
     marks the previous version SUPERSEDED. All versions remain retrievable.
2. AdminDocumentCategory (seeded, fixed set, extensible by Super Admin):
   - COMPLIANCE_SIGNOFF   (Legal, Accountant, Black Book sign-off packs)
   - RUNBOOKS_OPS         (restore drill runbook, rollback criteria, ops docs)
   - POLICIES_TERMS       (privacy policy, terms of use, pilot agreement)
   - USER_GUIDES          (user manual, admin guides)
   - SUPPORT_DOCS         (support procedures, FAQs)
   - DRILL_EVIDENCE       (completed drill evidence logs, incident reviews)
   - CERTIFICATES_LICENCES (POTRAZ licence, insurance, company documents)

SCOPE — ACCESS CONTROL
- Only users with the SUPER_ADMIN role (and the DELEGATED_OPS role created in
  LP-009) may list, view, upload or manage these documents.
- DELEGATED_OPS may view all categories but may upload only to DRILL_EVIDENCE
  and SUPPORT_DOCS. Only SUPER_ADMIN may change status, delete/archive, or
  manage categories.
- CRITICAL: add tests proving that (a) tenant users receive 403/404 on every
  DMS endpoint, (b) DMS documents never appear in tenant search results or
  tenant document listings. Extend the LP-002 isolation suite with these cases.

SCOPE — API AND UI
- REST endpoints under the existing admin route namespace: list (with
  category/status filters and search by title), get, download, upload new
  document, upload new version, change status, manage categories.
- Super Admin UI page "Documents" with: category sidebar, document table
  (title, category, version, status, effective date, review due), upload
  modal, version history drawer, download.
- Every view/download/upload/status-change writes an audit event
  (who, what, when, document id, version).

SCOPE — SEEDING
- Seed script (idempotent) that creates the categories and registers the two
  ops documents from docs/ops/ as ACTIVE documents under RUNBOOKS_OPS,
  reading the files from the repo.
- Placeholder ACTIVE entries (documents to be uploaded by the owner) are NOT
  to be fabricated — seed only what exists in the repo.

DO NOT
- Build tenant-facing document features (tenants have their own document
  system — untouched).
- Build e-signature, OCR, or retention automation. Storage, versioning,
  access control, audit only.

ACCEPTANCE CRITERIA
- Super Admin can upload, version, categorise, download and archive documents.
- DELEGATED_OPS restrictions enforced by tests.
- Tenant inaccessibility proven by tests added to the isolation suite.
- Audit events verified by tests.
- Seed script registers the two ops documents.

COMPLETION REPORT
Standard report PLUS: endpoint list, new permissions added, and confirmation
that the isolation suite was extended (test names).
```

---

## MISSION LP-009 — Operational Task Scheduler & Management Calendar

```
MISSION ID: LP-009
BRANCH: feature/ops-scheduler-calendar
PRIORITY: High — launch-gating.
PREREQUISITE: LP-008 merged (tasks link to documents and file evidence
into the DMS).

OBJECTIVE
Build a platform-level operational task scheduler and management calendar in
the Super Admin section. The calendar is anchored on an Official Launch Date
and automatically derives when recurring compliance/ops tasks are due,
reminds the responsible person before the deadline, and escalates missed
deadlines. Tasks can be executed (marked complete with evidence) by Super
Admins or by a delegated staff member.

READ FIRST
- LP-008 code (DMS, roles).
- Existing notification service (email + in-app from LP-004/LP-005 work).
- Existing user model for assigning owners.
- docs/ops/RUNBOOK-RESTORE-DRILL.md and docs/ops/ROLLBACK-CRITERIA.md —
  the seeded tasks below come from these documents.

SCOPE — ROLES
- Create role DELEGATED_OPS: a staff user who can view the calendar, be
  assigned tasks, and complete tasks assigned to them. Cannot create/edit
  task definitions, cannot change the launch date, cannot reassign tasks.
- SUPER_ADMIN: full control — define tasks, set/change launch date, assign
  and reassign owners, complete any task, override due dates (audited).

SCOPE — DATA MODEL (platform-scoped, no tenantId, isolation-tested)
1. PlatformSetting: officialLaunchDate (date, settable only by SUPER_ADMIN;
   every change audited and recalculates the schedule).
2. OpsTaskDefinition
   - id, name, description, linkedDocumentId (nullable FK to AdminDocument),
     scheduleType (ONE_OFF | ANCHORED_TO_LAUNCH | RECURRING),
     anchorOffsetDays (for ANCHORED_TO_LAUNCH, e.g. -14 = 14 days before
     launch), recurrenceRule (RRULE string or simple enum
     MONTHLY | QUARTERLY | ANNUALLY with day-of-month),
     defaultOwnerId, requiresEvidence (boolean), active (boolean),
     reminderOffsets (array of days-before, default [7, 1, 0]).
3. OpsTaskOccurrence (generated instances)
   - id, definitionId, dueDate, ownerId, status
     (UPCOMING | DUE | COMPLETED | MISSED | WAIVED),
     completedAt, completedBy, evidenceDocumentId (nullable FK — the
     completed evidence file stored in the DMS under DRILL_EVIDENCE),
     completionNote, waivedBy/waivedReason (SUPER_ADMIN only, audited).

SCOPE — SCHEDULING ENGINE
- A daily job (use the existing job/cron mechanism if present; otherwise a
  simple interval scheduler in-process) that:
  a. Generates occurrences from active definitions a rolling 12 months ahead.
  b. Recalculates ANCHORED_TO_LAUNCH occurrences when launch date changes.
  c. Sends reminders per reminderOffsets (in-app notification + email to the
     occurrence owner, cc Super Admins on day-0 reminders).
  d. Marks occurrences MISSED at due date + 1 day if not completed, and sends
     a missed-deadline alert to ALL Super Admins (email + in-app, marked
     high priority).
  e. Emits structured log events (task.reminder.sent, task.missed,
     task.completed) consistent with LP-005 logging.

SCOPE — COMPLETION FLOW
- Completing a task where requiresEvidence=true REQUIRES either attaching an
  existing DMS document or uploading a new one (stored under DRILL_EVIDENCE)
  plus a completion note. Completion without evidence must be impossible for
  such tasks — enforced server-side, tested.
- Every completion, waiver, reassignment and due-date override is audited.

SCOPE — SEED TASK DEFINITIONS (idempotent seed, all assigned by default to
the Super Admin account; owner will reassign in the UI)
1. "Backup restore drill" — ANCHORED_TO_LAUNCH −14 days (pre-launch drill),
   then RECURRING monthly. requiresEvidence=true.
   Linked document: Restore Drill Runbook.
2. "Verify nightly backup age" — RECURRING weekly. requiresEvidence=false.
3. "Review rollback criteria & incident readiness" — RECURRING quarterly.
   Linked document: Rollback Criteria. requiresEvidence=false.
4. "POTRAZ data controller licence renewal application" — RECURRING annually,
   reminderOffsets [90, 60, 30, 7] (renewal must be filed 3 months before
   expiry). requiresEvidence=true.
5. "Legal sign-off review" — ONE_OFF, ANCHORED_TO_LAUNCH −7 days.
   requiresEvidence=true (signed pack filed to COMPLIANCE_SIGNOFF).
6. "Accountant sign-off review" — same pattern as 5.
7. "Black Book content sign-off" — same pattern as 5.
8. "Pilot agreement signed by each tenant" — ONE_OFF, ANCHORED_TO_LAUNCH
   −3 days. requiresEvidence=true.
9. "Post-launch 72h heightened monitoring review" — ONE_OFF,
   ANCHORED_TO_LAUNCH +3 days.
10. "Monthly pilot review (metrics, incidents, tenant feedback)" —
    RECURRING monthly from launch.

SCOPE — CALENDAR UI (Super Admin section, "Management Calendar")
- Month view and agenda/list view. Occurrences colour-coded by status
  (upcoming / due soon / completed / missed).
- Launch date shown as a pinned banner event; changing it (SUPER_ADMIN only)
  previews the recalculated schedule before confirming.
- Click an occurrence → drawer: description, linked document (opens from
  DMS), owner, history, complete/waive actions per role.
- Filters: owner, category, status. A "Pending & Overdue" panel is the
  default landing view — the admin should see what needs attention first,
  not an empty grid.
- Dashboard widget on the Super Admin home page: count of due-this-week and
  missed tasks, linking to the calendar.

DO NOT
- Build tenant-facing calendars.
- Build external calendar sync (Google/Outlook) — out of scope for pilot.
- Add a message queue; the daily job runs in-process.

ACCEPTANCE CRITERIA
- Setting launch date generates the full seeded schedule; changing it
  recalculates anchored tasks (tested with fixed clock).
- Reminders and missed-deadline alerts fire correctly (tested with fake
  timers/clock injection, not real waiting).
- Evidence-required completion enforced server-side.
- DELEGATED_OPS can complete only their assigned tasks (tested).
- Tenant users cannot reach any scheduler endpoint (isolation suite extended).
- All events audited and structured-logged.

COMPLETION REPORT
Standard report PLUS: seeded task table (name, schedule, reminders), the
structured event names added, and screenshots or route list of the calendar UI.
```

---

## MISSION LP-010 — AI Compliance Assistant for the Management Calendar

```
MISSION ID: LP-010
BRANCH: feature/calendar-ai-assistant
PRIORITY: Medium — NOT launch-gating. Do not start until LP-009 is merged
and LP-003–007 are complete or in review.

OBJECTIVE
Add an AI assistant layer to the Management Calendar so Super Admins get an
intelligent daily briefing and can ask natural-language questions about
compliance status. The AI observes and reminds; it never acts.

READ FIRST
- Existing AI integration/orchestration code in the repo (reuse the existing
  provider wiring; do not add a second AI vendor).
- LP-009 scheduler data model and LP-008 DMS.

SCOPE
1. Daily Admin Briefing
   - Generated each morning for Super Admins (in-app card + optional email):
     tasks due in the next 7 days, overdue tasks with days overdue, documents
     whose reviewDueDate has passed, drill-evidence recency (days since last
     passed restore drill), and days-to-launch countdown.
   - Implementation: deterministic data assembly first (a plain function that
     produces the structured facts), THEN the AI turns facts into a concise
     narrative. If the AI call fails, fall back to rendering the structured
     facts directly — the briefing must never silently not appear.
2. Ask-the-Calendar
   - A chat box on the calendar page. Grounding: ONLY the scheduler,
     settings, DMS metadata (titles/categories/status — never document file
     contents in v1) and audit summaries. The assistant answers questions
     like "what is pending this month?", "when is the next restore drill?",
     "which sign-offs are filed?", "what did we miss?".
   - Every answer must cite the underlying records (task/document IDs
     rendered as links).
3. Guardrails (hard requirements, tested)
   - The AI has READ-ONLY tools. It cannot complete tasks, change dates,
     waive tasks, upload or modify documents, or send notifications itself.
   - Prompt-injection safety: document titles and task notes are user-entered
     text; treat them as data, never as instructions.
   - Every AI interaction is audit-logged (who asked, what was asked, which
     records were retrieved).
   - Access: SUPER_ADMIN and DELEGATED_OPS only; DELEGATED_OPS answers are
     scoped to tasks they can see.

DO NOT
- Give the AI write access to anything.
- Index tenant data into this assistant. Platform/ops data only.
- Build voice, multi-agent, or cross-module AI features.

ACCEPTANCE CRITERIA
- Briefing renders with real data and degrades gracefully without AI.
- Ask-the-Calendar answers the four example questions correctly against
  seeded fixtures (integration tests with a mocked model asserting the
  retrieved grounding facts are correct — test the retrieval, not the prose).
- Guardrail tests: attempted write actions via the AI path are impossible;
  injection strings in task notes do not alter behaviour.

COMPLETION REPORT
Standard report PLUS: the read-only tool list exposed to the AI, and the
audit event names for AI interactions.
```

---

## Owner actions after these missions ship (Dr. Kapapiro)

1. Log into Super Admin → Documents and upload: the signed Legal, Accountant and Black Book packs (COMPLIANCE_SIGNOFF), Privacy Policy / Terms of Use / Pilot Agreement (POLICIES_TERMS), POTRAZ licence and insurance (CERTIFICATES_LICENCES), and user manuals as they are written (USER_GUIDES).
2. Set the Official Launch Date in the Management Calendar and review the auto-generated schedule.
3. Reassign task owners: restore drill and backup checks → Mr. Anthony Kakurira (create his account with the DELEGATED_OPS role); sign-off and licence tasks remain with you.
4. Complete pre-launch tasks as they come due, attaching evidence — the calendar then becomes your single compliance control panel.
