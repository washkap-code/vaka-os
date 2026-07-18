# VAKA Mail Core

**Mission:** P9-001
**Status:** Implemented technical foundation; default off
**Migration:** `0052_mail_core.sql`

## Scope

VAKA Mail Core provides tenant-owned IMAP/shared mailbox accounts, folder and
UID cursor state, stored messages and attachments, deterministic threading,
SMTP send/reply, and links to canonical business objects. It is a server-only
foundation. The `mail.hub` tenant flag defaults off and no mailbox UI, OAuth
connector, campaign tooling, tracking pixel, calendar, AI processing or live
provider onboarding is included.

`mail_accounts` stores VAKA IDs separately from remote provider identifiers.
Folders retain `UIDVALIDITY` and the last committed UID. Ingestion is
idempotent by provider message ID and folder/UID generation. Header references
take precedence for threading; normalized subject is the fallback. The
in-process scheduler is single-flight, runs on the configured interval, and
changes a mailbox to `ERROR` when credentials, connectivity, protocol parsing
or provider operations fail. One failing account does not terminate the
scheduler or an HTTP request.

## Security and permissions

- `MAIL_ENCRYPTION_KEY` is dedicated to mailbox configuration and has no
  fallback. IMAP/SMTP configurations use versioned AES-256-GCM envelopes.
- API views expose only `imapConfigured`/`smtpConfigured`; ciphertext and
  plaintext configuration are absent. Logs record account/tenant IDs and the
  error class only.
- `mail.manage` controls account configuration. `mail.read` and `mail.send`
  still require ownership of a private mailbox; shared mailboxes allow any
  tenant user holding the relevant permission. `mail.manage` can access all
  tenant mailboxes.
- Every query repeats tenant scope. Composite database foreign keys reject
  cross-tenant and cross-mailbox child references.
- Stored HTML is stripped of active content and inline event handlers. Message
  bodies, addresses, credentials and attachments never enter platform event
  payloads.

The migration grants the three Mail permissions only to existing Owner and
Admin roles. Other roles require an explicit permission decision. Account
create/update/delete and thread linking are audited; every accepted outbound
message is audited. `mail.sent` and `mail.received` publish identifier-only
facts after the local message transaction commits.

## Attachments and object links

Inbound attachment content is stored through `DocumentService` as immutable
`CORRESPONDENCE` document versions. Mail Core accepts a conservative media
type list and a 1.5 MB per-attachment limit. Provider-side anti-malware and DLP
controls, quarantine, retention/legal hold, governed export and deletion
operations remain release gates; this technical foundation must not be marked
GA before those controls exist.

Ingested sender and recipient addresses are matched only inside the owning
tenant against current Customer and Supplier contact email fields. Matching
creates an `auto` object link; it does not grant mailbox access. A permitted
user can add a manual thread link after the target object is confirmed in the
same tenant.

The Universal Timeline includes linked messages only when the caller has both
the object read permission and mailbox visibility. Timeline entries contain
subject, direction, read state and internal IDs, never bodies, participants or
attachments.

## Operations and rollback

The scheduler is suitable for one continuously running server process. A
distributed lease/recovery worker and webhook/OAuth reconciliation are future
work. Operators must provision `MAIL_ENCRYPTION_KEY`, apply migration `0052`
after `0048`–`0051`, then explicitly enable `mail.hub` for approved pilot
tenants. The guarded down migration refuses to discard any configured mailbox;
business correspondence must be exported and removed under an approved policy
before rollback.

Recommended continuation: P9-002 Gmail and Microsoft OAuth connectors with
least-privilege token scopes, revocation, webhook authenticity, cursor
reconciliation and provider-specific recovery evidence.
