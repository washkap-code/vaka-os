# P7-003 — Secure finance report email delivery

**Status:** Approved for implementation
**Programme:** 7 — Business communications and document delivery
**Priority:** P1 governed report distribution
**Depends on:** P1-004 notifications; P1-007 documents; P7-001 consented
finance delivery; P7-002 immutable finance report snapshots

## Outcome

An authorised finance user can explicitly email one immutable VAT or management-
accounts technical-preview snapshot to one tenant-owned customer with a current
email-consent event. The recipient receives one opaque, expiring and revocable
link to exactly that snapshot. Provider attempts, in-app outcomes, link lifecycle
and domain outcomes are idempotent and audited.

This mission delivers the server trust boundary. A following mission adds the
accessible consent/history/send interface. It does not transmit WhatsApp/SMS,
attach report bytes, make reports filing-ready or imply provider delivery/read.

## User, problem and measurable result

**User:** Owner, Administrator or Accountant with both `reports.read` and the
current compatibility permission `accounting.post`.

**Problem:** P7-002 can prove the exact report bytes, but users cannot safely
send that artifact. Reusing a live endpoint or permanent URL would allow later
data drift, uncontrolled access and weak recipient evidence.

**Result:** one confirmed command resolves canonical snapshot, customer email
and current consent, claims idempotency, creates a 1–30 day opaque link, sends a
typed email through `NOTIFICATION_SERVICE`, persists an in-app outcome and
records minimised audit evidence without changing finance state.

**Measure:** tests prove consent/opt-out enforcement, permission and tenant
isolation, exact immutable bytes, token hashing, expiry/revocation, rate-limited
public access, same-key replay, changed-input conflict, provider success/failure,
secure-variable redaction, audit minimisation and no ledger/report mutation.

## Target behaviour

1. Add additive `finance_report_share_links` evidence with tenant, snapshot,
   SHA-256 token hash, expiry, revocation/view timestamps, creator and creation
   time. Never persist or log the bearer token.
2. Add operational `finance_report_delivery_requests` for tenant-scoped
   idempotency, snapshot/contact/consent/link references, processing outcome,
   notification IDs, safe failure code, actor and timestamps.
3. Add an explicit authenticated command:
   `POST /reports/snapshots/:id/send` with `contactId`, `confirm: true`, bounded
   `expiresInDays` and a validated `Idempotency-Key`.
4. Require `reports.read` and `accounting.post`. Resolve tenant, snapshot,
   contact, recipient email, consent, report identity, period, checksum and link
   server-side. The client cannot supply recipient, URL, report values, template,
   locale, tenant or provider fields.
5. Require a tenant-owned customer with a canonical email and latest `CONSENTED`
   EMAIL preference. Missing consent and `OPTED_OUT` fail closed before a claim,
   link or provider request and create bounded suppression audit evidence.
6. Use a typed/versioned `finance.report-snapshot.v1` English catalogue. Retain
   requested `sn-ZW`/`nd-ZW` preference evidence but resolve to reviewed `en-ZW`
   until qualified translations exist.
7. Create a cryptographically random 32-byte base64url token and store only its
   SHA-256 hash. Default expiry is 7 days; accepted range is 1–30 days.
8. Email only the absolute secure URL, expiry, company name, report label and
   period. Mark the URL sensitive so persisted notification variables and audit
   logs contain `[REDACTED]`, never the token.
9. Send EMAIL first, then an initiating-user IN_APP success/failure outcome
   through `NOTIFICATION_SERVICE`. Provider acceptance is not receipt, delivery,
   opening, professional approval or filing.
10. Same tenant/key/fingerprint replays the prior outcome without another link
    or provider attempt. Same key with changed snapshot/contact/expiry conflicts.
11. If email delivery fails, mark the request failed and revoke the newly created
    link. In-app failure is best-effort and finance/report records never change.
12. Add rate-limited public `GET /public/reports/:token/pdf`. Resolve only a
    non-revoked, unexpired hashed token, retrieve the P7-002 exact verified PDF,
    mark first/latest view evidence and return private/no-store inline bytes.
13. Add authenticated list and revoke endpoints for a snapshot's links. Revoke
    is idempotent-safe, tenant-scoped and audited; no token is returned.

## Finance readiness answers

1. **Accounting event:** none; delivery/link events only.
2. **Journal:** none.
3. **Owner:** immutable snapshot's authenticated tenant provisional scope.
4. **Currency:** captured report values remain unchanged and currency-disclosed.
5. **Tax:** no determination change; VAT remains a technical preview.
6. **Audit:** suppressed/sent/failed plus link create/open/revoke evidence with
   IDs, versions, locale, consent, provider status and checksum—not bytes/tokens.
7. **Reversal:** delivery cannot be reversed; access can be revoked. A new
   communication records a new event.
8. **Explanation:** snapshot/checksum, contact/consent IDs, template/locale,
   provider acceptance and link lifecycle are separately evidenced.
9. **AI:** AI cannot invoke, select recipients, consent, send or certify.
10. **Permission:** `reports.read` and `accounting.post`; a narrower
    `reports.send` permission remains a future RBAC migration.

## Security, privacy and failure behaviour

- Every authenticated lookup is tenant-filtered; cross-tenant IDs return safe
  not-found responses and never reveal existence.
- Public tokens have at least 256 bits of entropy, are hash-only at rest, exact-
  shape validated and protected by the existing `/api/v1/public` rate limiter.
- URLs/tokens, message bodies, report rows, customer names/emails, logo bytes and
  tax identifiers never enter audit metadata.
- Notification history redacts the document URL. Provider credentials remain
  environment-only and no report bytes are attached or persisted there.
- Provider/configuration failure records a safe code, revokes access and returns
  the existing safe global error response; it never changes snapshot/source.
- Expired, revoked, malformed or unknown tokens return the same safe unavailable
  response. Public responses reveal no tenant/contact metadata.
- A database/provider interruption may leave `PROCESSING`; recovery/reconciliation
  tooling remains a production gate and must never blindly resend.

## Accessibility, mobile and localisation

This is a server-boundary mission. It adds no user-facing control and therefore
does not claim interface availability. Typed templates use reviewed English and
explicit locale fallback. The next UI mission must add labelled consent state,
recipient confirmation, expiry, loading/error feedback, delivery history and
320-pixel reflow using the governed design system.

## Deliberate exclusions

- No WhatsApp, SMS, push, attachment, bulk send, scheduled send or AI send.
- No public index, guessable identifier, permanent URL or token display API.
- No delivery/open/bounce webhooks, retry queue, outbox, DLQ, provider failover
  or deliverability analytics.
- No professional approval, signature, filing or accounting behavior.
- No UI in this mission; UI adoption is the next bounded Mission Pack.

## Verification

- guarded additive migration and constraints;
- consent, opt-out, missing email, permission and cross-tenant negatives;
- token entropy/shape/hash-only storage, expiry, revoke and unknown-token parity;
- exact snapshot PDF checksum through public access;
- idempotent success/replay/conflict and provider failure/link revocation;
- notification sensitive-variable redaction and audit minimisation;
- no journal/snapshot/source mutation;
- full server suite/typechecks, web build, runtime schema gate and audits.

## Release and rollback

Release only after migration review, provider/domain configuration evidence,
remote CI, deployment and authenticated/live public-link lifecycle checks.
Revert routes, coordinator, catalogues, schema mapping, migration, tests and
documentation. Existing created links should be revoked operationally before
code rollback; additive evidence tables may remain dormant. No accounting or
financial-data rollback is required.
