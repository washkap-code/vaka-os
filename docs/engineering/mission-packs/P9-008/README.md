# P9-008 — Account recovery, optional MFA and governed platform workforce

**Status:** Approved by the product owner for implementation  
**Programme:** 9 — Security, assurance and platform operations  
**Type:** Identity hardening, platform RBAC and operational workforce administration  
**Depends on:** P1-002 identity/audit; P6-002 sessions/activity; P6-006 platform control centre

## Outcome

Users can recover access without support learning their password, opt into
authenticator-app two-factor authentication, inspect and change their own
security settings, and reveal or conceal password fields while typing. The
principal platform administrator can manage VAKA operational staff profiles
and narrowly scoped backend access without turning every staff member into an
unrestricted super administrator.

## Current behaviour

- Passwords are bcrypt hashes and cannot be recovered. Temporary-password and
  mandatory first-change controls exist.
- There is no self-service forgotten-password flow or second factor.
- Password inputs do not consistently expose a show/hide control.
- The platform console has one binary `is_platform_admin` authority and every
  platform route uses the same broad gate.
- There is no platform staff profile, department/function, platform role,
  self-service security page or staff access administration.
- Sidebar text assumes a dark brand colour and can become unreadable when the
  configured background is light or visually similar.

## Target behaviour

1. Add accessible show/hide controls to login, signup, forced change, recovery,
   MFA disable and staff temporary-password fields. The value never leaves the
   normal form submission path and visibility resets with the form.
2. Use explicit high-contrast sidebar tokens so navigation, active, hover and
   sign-out text remain readable independently of tenant brand colours.
3. Add a non-enumerating `forgot password` request accepting email and optional
   workspace subdomain. Unknown and ambiguous identities receive the same
   response and timing class as known identities.
4. Store only a hash of a cryptographically random, single-use reset token.
   Links expire after 30 minutes. A successful reset changes the password,
   consumes the token, revokes all sessions and records tenant or platform
   audit evidence atomically.
5. Send reset links only through the existing provider-neutral HTTPS email
   boundary. Provider absence/failure is recorded safely and never reveals
   whether an identity exists.
6. Add optional RFC 6238 authenticator-app TOTP enrollment. A factor remains
   pending until a valid code is verified. Secrets are encrypted at rest and
   never logged or returned after enrollment.
7. Issue one-time recovery codes on enrollment. Store hashes only and consume
   a recovery code atomically when used. Password recovery does not disable
   MFA.
8. When a verified factor exists, password login returns a short-lived,
   purpose-bound challenge instead of an application session. Only a valid
   TOTP or recovery code creates an AAL2 session; server middleware rejects
   stale AAL1 access for enrolled users.
9. Add an administrator Settings area covering profile, password change,
   optional MFA enrollment/disablement, recovery-code replacement and active
   session visibility/revocation. Consequential changes require the current
   password and/or verified second factor as applicable.
10. Replace binary platform authority with system platform roles and explicit
    server permissions. Initial roles are Principal Administrator, Operations
    Administrator, Finance Operations, Support Analyst and Security Auditor.
11. Preserve `is_platform_admin` as a compatibility identity marker, but never
    use it alone to authorise a platform operation after this mission.
12. Add a minimal VAKA staff profile containing function/department, job title,
    work phone, location, manager, start/end dates, employment state and
    operational notes. Authentication secrets never enter the profile.
13. Only the Principal Administrator can create staff access, change platform
    roles, disable/reactivate staff, issue a new temporary password or edit
    another staff profile. The principal account cannot disable or demote
    itself, and the system must retain at least one active principal.
14. Every platform staff creation, profile/access/status change, password reset,
    MFA event, recovery-code event, session revocation and privileged platform
    operation produces privacy-minimised platform audit evidence.
15. Staff roles do not create tenant membership, impersonation or unrestricted
    tenant-record access. Tenant audit review is a separately granted read
    permission and remains purpose-limited.
16. New copy is added to the typed English catalogue. ChiShona and isiNdebele
    security terminology remains disabled until native and security review.

## Platform permissions

- `platform.overview.read`
- `platform.tenants.read`
- `platform.tenant_audit.read`
- `platform.operations.read`
- `platform.billing.run`
- `platform.billing.payment.manage`
- `platform.referrals.manage`
- `platform.backups.read`
- `platform.backups.write`
- `platform.staff.read`
- `platform.staff.manage`
- `platform.security.manage`
- `platform.settings.manage`

The Principal Administrator receives all permissions. Other role grants are
fixed system policy in this mission and are not user-editable custom roles.

## Security and failure behaviour

- Derive identity and platform permissions from the current database record on
  every authenticated request; never trust client-supplied roles or JWT-only
  permission claims.
- Rate-limit password login, recovery request/completion and MFA verification.
- Bound failed challenge attempts and token lifetimes. Responses must not
  disclose account, workspace, factor or staff existence.
- Recovery tokens, TOTP secrets, recovery codes, passwords and bearer tokens
  are prohibited from audit metadata, logs, notifications and persisted UI.
- All auth/workforce tables are private to the Express server role and revoke
  Data API privileges from `anon` and `authenticated`.
- Failed multi-row security changes roll back fully.

## Acceptance criteria

- This mission pack is committed before implementation.
- Existing tenant login, first-login change and session revocation remain green.
- Recovery covers known, unknown, ambiguous and cross-workspace identities;
  expiry, reuse and session revocation are tested.
- MFA covers pending enrollment, invalid/valid windows, AAL1 rejection, AAL2
  login, recovery-code single use, disablement and tenant/platform identities.
- Every platform route has an explicit permission and negative tests prove
  Support, Finance, Operations and Auditor boundaries.
- Principal-only staff lifecycle and self-lockout protections are tested.
- Sidebar contrast and password visibility work by keyboard at desktop and
  representative mobile widths.
- Full guarded server suite, typechecks, design-token check, web build and live
  deployment smoke checks pass.

## Rollback

Revert the recovery/MFA routes, UI and platform-permission gates together. Keep
new private tables and encrypted/hash evidence dormant; do not expose or drop
them in an emergency rollback. Restore the previous principal-only platform
account before reverting role enforcement, revoke sessions created by the
reverted release, and preserve all platform audit history.
