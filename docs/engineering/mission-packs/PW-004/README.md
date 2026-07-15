# PW-004 — Task centre surface (first build-dark consumer)

**Status:** Implemented
**Programme:** PW — Workflow (Master Build Plan Part II, Wave 1)
**Depends on:** PW-003 task engine; FLAG-001/002 feature flags

## Outcome

The task centre is now a visible product surface — and the first real
consumer of the build-dark gate. The entire surface (API and UI) is governed
by the `workflow.centre` tenant feature flag:

- `GET/POST /tasks`, `POST /tasks/:id/close` and the
  `GET/PUT /settings/automation-rules` endpoints now sit behind
  `requireFeature("workflow.centre")` and fail closed with
  `FEATURE_DISABLED`.
- The event-automation subscriber also checks the flag, so disabling the
  feature silences automation even where rules were previously enabled.
- Web: a "Tasks" navigation item and workspace page
  (`web/src/tasks/tasks-workspace.tsx`) appear only when `/me.features`
  contains `workflow.centre` — Open/Done/Dismissed tabs, manual task
  creation, and Done/Dismiss actions. The UI is never the security boundary.

To pilot: a platform admin enables `workflow.centre` for a tenant via the
step-up-protected FLAG-001 endpoint; the tenant then opts into automation
rules in Settings.

## Behaviour note

PW-003 shipped the task API ungated for one commit; PW-004 corrects that to
the build-dark standard before any tenant ever saw it. Production tables were
empty throughout.

## Explicit non-scope

Workbench widget and notification-on-assignment (later PW polish mission);
Shona/Ndebele copy (PI18N).

## Verification

`task-automation.test.ts` extended: proves `FEATURE_DISABLED` before the flag
is enabled, then the full PW-003 suite runs with the flag on (automation,
dedupe, isolation, audit). Web: typecheck, vite build and the navigation
model tests (16/16) green — the nav item is invisible without the flag.
