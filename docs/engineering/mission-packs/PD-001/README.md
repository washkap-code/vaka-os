# PD-001 — Documents workspace

**Status:** Implemented, verified in scratch Postgres
**Programme:** PD — Documents (Master Build Plan Part II §16, Wave 1)
**Depends on:** P1-007 (document service), FLAG-001/002 (build-dark flags)
**Authority:** VAKA Constitution; Master Build Plan §15 build-dark model; repository `AGENTS.md`

## Outcome

A tenant documents workspace — folders, versioned uploads and classification —
built on the P1-007 kernel document service and shipped dark behind the
`documents.workspace` feature flag.

## What was built

### Data (migration `0039_document_workspace.sql`, additive + idempotent)

- `document_folders` — tenant folders with optional single-level nesting;
  duplicate names blocked per level by partial unique indexes.
- `workspace_documents` — title, classification
  (POLICY/CONTRACT/CERTIFICATE/LICENCE/REPORT/CORRESPONDENCE/OTHER),
  ACTIVE/ARCHIVED status, `current_version` pointer.
- `workspace_document_versions` — immutable version rows: file name, media
  type, byte size, SHA-256 checksum, content as a capture-storage-protected
  data URL (same envelope as mobile capture: PNG/JPEG/PDF, ≤1.5 MB,
  signature-checked). A new upload is always a new version; nothing is edited
  in place.
- Role backfill (precedent 0004/0035): Owner/Admin gain
  `documents.read` + `documents.manage`; Accountant gains `documents.read`.

### Server

- `server/src/document-workspace.ts` — folders, create/list/detail, version
  add (row-locked, concurrency-checked `current_version` bump),
  archive/restore, per-version content resolution. Every write audited
  (`document_folder.created`, `document.created`, `document.version_added`,
  `document.archived`, `document.restored`).
- `server/src/documents.ts` — P1-007 adapter extended with the
  `workspace-doc` kind: content reads flow through the kernel
  `DocumentService` with tenant scoping, byte-size and checksum
  verification.
- Routes under `/api/v1/documents*`, all behind
  `requireFeature("documents.workspace")` (fail-closed FEATURE_DISABLED) and
  `documents.read`/`documents.manage`. Fixed paths registered before
  `/documents/:id` so they are never shadowed. Content responses are
  `Cache-Control: no-store`.
- New permissions appended to the RBAC catalogue in `lib.ts`.

### Web

- `web/src/documents/documents-workspace.tsx` — folder filter, upload with
  client-side type/size validation, classification labels, version history
  with per-version download, archive/restore. Write actions require
  `documents.manage`; the API remains the security boundary.
- Nav: `documents` page gated by BOTH `documents.read` and the
  `documents.workspace` flag (`web/src/shell/navigation.ts`); label + copy in
  `app.en.ts`; lazy route in `App.tsx`.

## Verification (scratch Postgres, 2026-07-15)

- document-workspace 9/9 (build-dark fail-closed, folders + duplicate/
  cross-tenant rejection, envelope + classification validation, versioning +
  per-version kernel content reads, archive lifecycle, tenant isolation,
  permission gates, audit evidence)
- Regression: critical + document-adapter 14/14; capture-documents +
  feature-flags 9/9; task-automation + auth-resolution 10/10; finance
  tenant-isolation 3/3; settings 4/4; journal-balancing +
  journal-immutability 4/4
- Server + web typecheck clean; web vite build clean; nav-model 16/16

## Production rollout

1. Apply `server/drizzle/0039_document_workspace.sql` to the production
   database (idempotent) — BEFORE pushing this code.
2. Push `main` (auto-deploys via Vercel).
3. Pilot: enable `documents.workspace` per tenant via
   `PUT /platform/tenants/:id/features/documents.workspace` (step-up
   protected, audited). Default remains OFF everywhere.

## Deliberately out of scope (later PD missions)

Attach-to-any-canonical-object, approvals and retention policies (PD-002,
Workflow-powered); e-signature (PD-003); larger files / object storage
(needs an ADR — current envelope reuses the 1.5 MB capture limit).
