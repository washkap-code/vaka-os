# P1-004 — Notification service adapter (email + persisted in-app)

**Status:** Implemented and verified — internal foundation; provider/adoption gates remain
**Programme:** 1 — Platform
**Type:** Infrastructure + thin feature (additive)
**Depends on:** P1-002 (merged), P1-001 notification contracts

## Objective

Give VAKA one place to send notifications. Bind the existing
`NotificationServiceContract` / `NotificationGateway` (from P1-001) to real
delivery: an **email provider adapter** and a **persisted in-app notification
store**, resolved from the kernel as `NOTIFICATION_SERVICE`. SMS and WhatsApp
are wired as **contract-complete placeholders** (registered channels that
record intent but do not transmit) so later missions add providers without
touching call sites.

This mission delivers the *capability and seam*. It does **not** rewire
existing invoice/statement emails yet — that adoption is P7-001. One low-risk
internal notification (e.g. an admin/security notice already audited) may be
emitted through the new service purely to exercise the path end-to-end.

## Why now

P5-004 (low-stock alerts), P7-001 (invoice/statement/reminder delivery) and
P6-002 (in-app notification menu) all depend on a single notification service.
Building it once here prevents three modules re-implementing delivery.

## Deliverables

1. **Channel gateways** — `server/src/platform/notifications/adapters/`
   - `emailGateway(send)` — `NotificationGateway` for `EMAIL`, delegating to an
     injected transport function (`(msg) => Promise<{providerMessageId?}>`).
     Default transport is a config-driven SMTP/provider call; in tests the
     transport is injected and asserted. No provider secrets committed.
   - `inAppGateway(persist)` — `NotificationGateway` for `IN_APP` that writes a
     row via an injected writer (mirrors the audit-sink pattern), so the
     platform layer stays free of a hard `db` dependency.
   - `noopGateway(channel)` — records acceptance for `SMS`/`WHATSAPP` without
     transmitting; clearly marked not-live.
2. **Routing service** — extend/instantiate `NotificationService` so `send()`
   dispatches by `request.channel` to the correct gateway; unknown channel
   fails closed; `dedupeKey` suppresses duplicate sends within a tenant.
3. **Persistence** — Drizzle migration adding `notifications` table:
   `id, tenant_id (fk), recipient, channel, template, locale, variables (jsonb),
   status ('accepted'|'sent'|'failed'), provider_message_id, dedupe_key,
   created_at`. Tenant-scoped index on `(tenant_id, created_at)`. Append-only:
   status transitions are new rows or an update to status only — never deletes.
4. **Composition** — register `NOTIFICATION_SERVICE` token in
   `platform-runtime.ts`; default gateways bind to app db + configured email
   transport; `buildPlatformKernel` accepts overrides for tests.
5. **Read path** — a tenant-scoped `listNotifications(tenantId, opts)` for the
   future in-app menu (no UI in this mission; server function + test only).

## Business rules / non-negotiables

- Every notification is tenant-scoped from the caller's verified context; a
  request without a tenant is rejected before any gateway runs.
- Sending is **audited** via the kernel audit facade (`notification.sent`).
- No PII in logs; recipient is stored but never logged in plaintext error paths.
- Templates are keys resolved against locale catalogues (English first); no raw
  copy embedded in code.
- SMS/WhatsApp must not appear to users as live until a provider mission ships.
- No provider credentials in the repo; read from env via `config.ts` with
  production boot-time validation.

## Forbidden

- Rewiring existing invoice/statement email call sites (that is P7-001).
- Changing `audit()`/`audit_logs`, auth, or finance behaviour.
- Adding an outbound provider SDK that transmits by default in tests.
- Destructive migrations.

## Test plan

- Unit: email gateway calls the injected transport with the rendered message and
  returns `providerMessageId`; in-app gateway persists the exact row shape;
  routing dispatches per channel; unknown channel throws; dedupe suppresses the
  second identical send.
- Tenant isolation: two tenants' notifications never cross; missing tenant fails
  closed with nothing written.
- Composition: kernel resolves `NOTIFICATION_SERVICE`; overrides honoured.
- DB-backed: migration applies; `listNotifications` returns only the caller's
  tenant rows, newest first.

## Acceptance criteria

- `npm run typecheck` (server + web) clean.
- Full DB-backed suite green (`cd server && npm run test:db:prepare && npm test`).
- New notification tests pass; zero change to existing behaviour.
- CHANGELOG + `PLATFORM-KERNEL.md` adoption note updated.

## Rollback

Revert the merge; migration `notifications` table is additive (drop in a
follow-up down-migration if required). No existing data touched.
