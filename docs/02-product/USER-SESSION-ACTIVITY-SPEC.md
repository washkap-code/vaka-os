# VAKA User Sessions and Activity Specification

**Status:** Approved product direction; presence and owner activity foundation implemented; hardening remains
**Owner:** Product, Security, Engineering, and Data Protection
**Last reviewed:** 2026-07-05

## 1. Outcome

Give the accountable company owner a trustworthy view of:

- how many registered company users exist;
- which users currently hold signed-in sessions;
- which users were recently active;
- which devices/sessions are authorised;
- what material actions users performed; and
- when access, permissions, configuration, money, stock, documents, customer
  data, integrations, and security settings changed.

This is a security, accountability, and support capability. It must not become
hidden employee surveillance or expose unnecessary message, password, document,
or personal content.

## 2. Current implementation

The current repository has:

- tenant users with status and `lastLoginAt`;
- an explicit one-owner-per-tenant identity record with same-tenant database
  enforcement, atomic signup establishment and server-derived owner authority;
- JWT access tokens with server-side hashed session records, idle/absolute
  expiry, last-seen presence and owner-triggered revocation;
- server-side user/role reload on authenticated requests; and
- a tenant-scoped audit-log table used by selected workflows.

The current foundation still does not yet have:

- a complete trusted-device inventory or risk model;
- reliable current-presence state;
- comprehensive authentication/activity audit coverage;
- a controlled ownership-transfer/recovery workflow and step-up policy.

The owner-only **Users & Activity** area is now available to the explicitly
recorded accountable owner. It reports tenant-scoped users, valid sessions,
approximate active-now presence, material audit events and per-session
revocation. The `Owner` role remains the seeded full-permission compatibility
role, but its mutable name no longer confers owner-only authority. Controlled
ownership transfer/recovery, MFA/step-up for selected actions, bounded exports
and richer activity filters remain required before
this is considered a complete security centre. P9-010 now provides compatible
server-side refresh sessions, HttpOnly cookie delivery, single-use rotation,
replay containment and tenant/platform renewal audit evidence. Trusted-device
policy, risk scoring and the remaining activity-event catalogue are still open.

The same area now provides a controlled team-access foundation: an Owner can
create a non-owner member with a one-time temporary password, select an
existing tenant role, and disable or re-enable that member. Creation and status
changes are audited; disabling a member revokes their active sessions. Until a
provider-managed invitation channel is configured, the Owner is responsible
for securely handing the one-time credential to the member.

Therefore VAKA cannot currently state with confidence exactly who is signed in.

## 3. Accountable owner

“Main user” means the tenant’s accountable **Owner**, established during company
creation or through a controlled ownership-transfer process.

- A tenant must always have at least one recoverable accountable owner.
- Ordinary Administrators do not automatically receive owner activity access.
- An Owner may not delegate this exact capability through a broad custom role
  unless a future governance decision explicitly allows a Security Owner role.
- Ownership transfer requires step-up authentication, confirmation by the
  current owner or a documented recovery process, notification, and immutable
  audit evidence.
- Platform administrators do not receive routine access to tenant activity
  merely because they operate VAKA.

The data model should establish ownership explicitly, rather than relying only
on a mutable role name such as `"Owner"`.

## 4. User status summary

The owner control centre should show:

- total registered users;
- active, invited, disabled, and locked users;
- unique users with valid signed-in sessions;
- total valid sessions, because one user may use multiple devices;
- users active now, recently active, and signed in but inactive;
- pending invitations and expiring access;
- users without MFA when MFA policy applies; and
- failed sign-in or security exceptions requiring attention.

Counts must be tenant-scoped and must distinguish users from sessions.

## 5. Presence terminology

Avoid claiming a user is literally looking at the screen.

- **Signed in:** at least one non-expired, non-revoked server session exists.
- **Active now:** an authenticated request or approved heartbeat was recorded
  within the configured short presence window, initially five minutes.
- **Recently active:** last activity occurred outside the active-now window but
  within 24 hours.
- **Inactive session:** a valid session exists but no recent activity was seen.
- **Signed out:** no valid session exists.
- **Unknown/offline:** the client cannot report presence or the service is
  unavailable; do not infer activity.

Presence is approximate. Network loss, sleeping devices, background requests,
and multiple sessions must be explained in the interface.

## 6. Session record

Each server-side session should contain:

- session ID and tenant/user IDs;
- refresh-token family/version and a one-way token hash;
- created, authenticated, last-seen, idle-expiry, absolute-expiry, revoked, and
  ended timestamps;
- revocation actor and reason;
- client type: web, iOS, Android, POS/shared device, or integration;
- application version;
- privacy-reduced device/browser/operating-system description;
- coarse sign-in IP/network evidence where justified by policy;
- risk/MFA assurance level;
- current status; and
- audit correlation identifiers.

Do not store passwords, raw refresh tokens, full device fingerprints, precise
location, browsing history, or unnecessary IP history.

## 7. Owner-only session actions

The Owner may:

- view tenant users and their sessions;
- revoke one session;
- revoke all sessions for a selected user;
- disable a user subject to safeguards;
- require password reset or MFA enrolment when supported;
- review failed sign-ins and suspicious session changes;
- export a bounded security/activity report after step-up authentication; and
- see whether an action succeeded.

The Owner cannot:

- view passwords, MFA secrets, tokens, or private authentication material;
- impersonate a user silently;
- edit/delete audit history;
- access another tenant;
- read private message/document content merely through the activity view; or
- bypass payroll, HR, legal, whistleblowing, or other specially restricted
  data controls.

Revocation and export actions must audit themselves.

## 8. Activity log scope

Record meaningful business and security events, not every click or keystroke.

### Authentication and security

- invitation issued/accepted/revoked;
- sign-in success and failed attempt category;
- sign-out, expiry, and session revocation;
- password reset and credential/MFA changes;
- user enabled, disabled, locked, or role changed;
- owner/administrator/security-policy changes; and
- device/session risk events.

### Business activity

- customer/supplier created or materially changed;
- invoice drafted, issued, sent, downloaded, paid, voided, or reversed;
- journal, expense, bank match/reconciliation, refund, and write-off actions;
- product, purchase, stock count/adjustment, and warehouse actions;
- payroll/HR actions according to stricter access policy;
- file import/export and report export;
- bank, payment, WhatsApp, email, AI, logo, and integration configuration;
- AI tool/action usage and approval outcome; and
- tenant lifecycle, billing, and data-export activity.

Ordinary read events should be logged selectively where sensitivity, export,
privileged access, or regulation justifies it. Logging every screen view creates
noise and unnecessary personal data.

## 9. Event contract

An activity event should include:

- immutable event ID;
- tenant ID;
- actor type and actor ID;
- session/client reference where applicable;
- action and schema version;
- entity type and tenant-scoped entity reference;
- outcome: success, denied, failed, or cancelled;
- occurred-at and recorded-at timestamps;
- correlation/request/idempotency reference;
- reason for consequential actions;
- minimal structured change summary;
- permission/approval context where material; and
- privacy-safe device/network evidence where justified.

Do not store secrets, passwords, token values, full financial documents,
unnecessary message bodies, or unrestricted before/after record dumps.

## 10. Activity interface

The Owner-only **Users & Activity** area should provide:

- user and session summary cards;
- searchable user directory;
- current/recent session list;
- filters for user, action family, module, outcome, entity, and date;
- an event detail view with plain-language action and technical evidence;
- links to underlying records only when the Owner is otherwise authorised;
- pagination and bounded date ranges;
- empty, unavailable, delayed, and partial-data states;
- session-revocation confirmation;
- privacy/retention explanation; and
- export subject to step-up authentication and limits.

Mobile may show the summary and urgent security actions. Full audit
investigation is optimised for a larger screen but must remain responsive.

## 11. Permissions

Introduce an owner-bound capability such as:

- `tenant_activity.owner_read`;
- `tenant_sessions.owner_manage`; and
- `tenant_activity.owner_export`.

These permissions must be derived from explicit tenant ownership or a future
approved security-owner model. They must not be automatically included in
`users.manage`, `settings.manage`, or ordinary Administrator roles.

Users may view and revoke their own sessions through separate permissions and
endpoints without gaining access to other users’ activity.

## 12. Security and privacy

- Tenant-scope all user, session, event, export, cache, search, and job paths.
- Protect audit events from ordinary update/delete operations.
- Use append-only storage and consider tamper-evident chaining or immutable
  external archival for high-assurance events.
- Redact secrets and sensitive values before persistence.
- Rate-limit session heartbeats and owner queries.
- Require recent step-up authentication for bulk revoke, ownership transfer,
  activity export, and security-policy changes.
- Notify affected users of material security changes where safe.
- Define retention by event category; authentication and employee-activity
  monitoring require documented privacy and employment-policy review.
- Make monitoring visible in company policy and product notices where required.
- Restrict support access and audit any exceptional access.

## 13. Architecture and migration

Implement incrementally:

1. Add explicit tenant ownership and versioned session/event schemas.
   Explicit ownership is implemented; session/event versioning remains staged.
2. Introduce server-side refresh sessions while preserving a compatible access
   token migration. **Implemented in P9-010.**
3. Rotate refresh tokens and detect replay. **Implemented in P9-010.**
4. Record sign-in, renewal, sign-out, expiry, revocation, and failure events.
   Renewal, sign-out and revocation have evidence; the catalogue remains partial.
5. Add self-session management. **Foundation implemented in P9-008.**
6. Add owner-only tenant session queries and revocation. **Implemented in
   P9-008/P9-009.**
7. Expand the existing audit catalogue module by module.
8. Build the Users & Activity interface. **Foundation implemented in P9-008.**
9. Add retention, archival, export, alerts, and operational monitoring.

Rollback must preserve existing valid access during staged migration where
safe, allow global session invalidation in an incident, and never delete audit
evidence.

## 14. Tests

- owner versus administrator access;
- cross-tenant user/session/event denial;
- unique-user versus session counts;
- active/recent/inactive/expired presence classification;
- multiple devices and concurrent renewal;
- refresh-token rotation and replay;
- disable/revoke takes effect immediately;
- owner access, revocation, and export audit themselves;
- audit append-only behavior and redaction;
- pagination/filter boundaries;
- activity export limits;
- mobile/responsive/accessibility/localisation;
- clock skew, delayed heartbeats, offline devices, and service failure; and
- platform-administrator exceptional-access controls.

## 15. Acceptance criteria

- Only the explicit tenant Owner can inspect company-wide users, sessions, and
  activity by default.
- The system reports signed-in users and active sessions separately and
  accurately under documented presence semantics.
- Revoking or disabling access takes effect immediately at the server.
- Material business/security actions produce tenant-safe, privacy-minimised
  events.
- Audit records cannot be changed or deleted through ordinary application
  paths.
- Every owner view/export/revocation is itself auditable.
- Existing tenant, permission, lifecycle, financial, stock, and export controls
  continue to pass.
