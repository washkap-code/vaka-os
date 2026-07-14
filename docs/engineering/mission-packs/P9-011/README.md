# P9-011 — Privileged recent reauthentication

**Status:** Approved for implementation
**Priority:** P0 identity and destructive-action protection
**Depends on:** P9-008 MFA/session controls; P9-009 explicit ownership;
P9-010 refresh rotation; P3-004 governed contact deletion; OPS-016 restore
evidence review

## Outcome

Require a fresh password and, when enrolled, authenticator/recovery-code proof
before an already signed-in user can perform selected destructive owner or
Principal Administrator actions. The proof is short-lived, session-bound,
audited and held only in browser memory.

Success means possession of an ordinary access token alone is insufficient to
delete customer records as owner, approve deletion, change tenant-user access,
manage VAKA platform staff credentials/access or decide restore evidence.

## User and business problem

**Users:** the explicit tenant Owner and Principal Platform Administrator.

**Problem:** current server permissions identify who may perform sensitive
actions, but do not establish that the same person recently reauthenticated.
A stolen unlocked browser session therefore carries the full destructive power
of its current role.

**Measurable result:** every selected route refuses missing, expired, malformed,
cross-user, cross-session and cross-tenant proof; password/MFA issuance and
failure events are audited without secrets; accessible UI reauthentication
completes the original action; complete regression gates pass.

## Scope

1. Add an authenticated, rate-limited `/auth/step-up` endpoint.
2. Verify current password against the authenticated active identity.
3. If a verified MFA factor exists, require and verify TOTP or a one-time
   recovery code using the existing factor boundary.
4. Issue a signed 10-minute proof containing purpose, user, current server
   session, tenant context, assurance and unique ID.
5. Validate proof server-side with explicit algorithm, purpose, expiry, user,
   session and tenant binding.
6. Add `X-Vaka-Step-Up` to the same-origin client and CORS allowlist.
7. Require proof for:
   - owner creation or status change of tenant users;
   - immediate owner contact deletion;
   - owner approval of a contact deletion request;
   - platform staff creation/profile-access change;
   - platform staff temporary-password issuance; and
   - Principal acceptance/rejection of restore-drill evidence.
8. Do not require proof when an ordinary staff member merely requests contact
   deletion, nor when an Owner rejects a request without deleting data.
9. Add a reusable, accessible reauthentication modal with password visibility,
   optional authenticator/recovery input, safe error state and return to the
   initiating action.
10. Add focused negative/positive tests, audit evidence and operational docs.

## Security and privacy rules

- Derive user, tenant, session, role, owner identity and MFA state from current
  authenticated server context; accept none from request data.
- A step-up proof never creates permission. Normal permission/ownership checks
  run independently before the protected operation.
- Bind proof to one current `user_sessions.id`; proof from another session,
  device, user, tenant or platform context is denied.
- Sign and verify with explicit `HS256`, purpose `privileged-step-up` and a
  maximum ten-minute expiry.
- Do not persist the proof or put it in local/session storage, URLs, logs,
  audit metadata, analytics or error messages.
- Never audit password, MFA code, recovery code, proof or raw request body.
- Consume a recovery code once through the existing atomic MFA factor path.
- Wrong password/code produces a generic reauthentication failure and a
  privacy-minimised authenticated security event.
- Disabling the user, password reset/change, MFA change, sign-out, session
  revocation or absolute/idle expiry prevents the protected action because the
  ordinary authenticated session is checked first.
- Endpoint rate limiting is defence in depth; shared edge limiting and anomaly
  monitoring remain deployment requirements.

## Permissions and audit

Existing permissions remain authoritative:

- tenant owner checks for team access and deletion decisions;
- `crm.write` plus explicit owner identity for immediate deletion;
- `platform.staff.manage` for staff administration; and
- `platform.security.manage` plus Principal identity for restore review.

Add:

- `security.step_up_completed` / `security.step_up_failed`; and
- `platform_admin.step_up_completed` / `platform_admin.step_up_failed`.

Metadata is limited to session ID, assurance/method and bounded failure class.
The downstream protected operation retains its existing audit event.

## Finance and accounting boundary

This mission does not alter billing, payments, journals, tax, currency,
invoices, stock, reports, document numbers or financial balances. Platform
billing routes are deliberately excluded during the finance audit phase.

## Mobile, accessibility and localisation

- The modal uses the existing focus trap, labelled fields, visible focus,
  escape/close behaviour and password show/hide control.
- It works at 320 CSS pixels and does not discard the pending action on an
  authentication error.
- All copy belongs to the existing English catalogue and is structured for
  Shona/Ndebele translation; no rule depends on translated display text.
- Native clients require a later secure platform-specific proof transport.

## Failure behaviour

- Missing/invalid/expired proof: `428 STEP_UP_REQUIRED`, no operation.
- Wrong password/MFA: generic `401`, audited failure, no proof.
- MFA enrolled but code missing: explicit authenticated prompt requirement,
  no proof.
- Database/audit failure while issuing proof: no proof returned.
- Downstream transaction failure: its existing rollback applies; proof does not
  make partial work acceptable.
- UI cancellation: no request to the protected route and no action mutation.

## Deliberate exclusions

- Ownership transfer/recovery, mandatory MFA policy, SSO/OIDC, WebAuthn/passkeys,
  risk scoring, trusted devices and transaction signing.
- Bulk session revocation or security/activity export, which do not yet have a
  complete product workflow.
- Persisting/reusing proofs across page reloads or browser tabs.
- Changing ordinary staff deletion-request behaviour.
- Applying step-up to finance routes during Phase 0 finance audit.

## Verification

- password-only and MFA/recovery-code issuance;
- password/MFA failure audits and redaction;
- missing, expired, malformed, wrong-purpose, cross-user/session/tenant proof;
- permission denial even with valid proof;
- selected route positive/negative cases and non-owner request exception;
- proof invalidation through session revocation/password/MFA changes;
- modal keyboard/focus/password visibility/localised copy/static accessibility;
- server full suite/typecheck and web design/shell/build gates;
- dependency, secret and diff integrity scans.

## Release and rollback

Deploy only after remote review, ordered migrations through `0026`, staging
two-actor tests, deployment and live owner/Principal smoke evidence. Roll back
protected-route middleware and UI prompts together; the additive audit events
may remain. Never bypass proof with client-only checks or a broad emergency
role. Incident access follows the documented recovery process.
