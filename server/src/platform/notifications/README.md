# Notifications Platform Contract

Notifications define tenant-scoped, preference-aware delivery requests. The
owner-issued P1-004 mission extends the existing adapter with one normalised
`send({ channel, template, to, data, priority, objectRef })` path. Legacy
inputs remain accepted for compatibility. Email still uses the same provider
and template renderer; internal notifications persist user, priority,
title/body, link, object reference and read state. SMS and Push adapters record
non-transmitted intent and are not live delivery channels. Missing per-user
preference rows mean enabled; an explicit disabled category/channel row
suppresses delivery before a provider runs.

P7-001 adopts the service for explicit, consented invoice,
customer-statement summary and payment-reminder email commands plus persisted
in-app outcomes. Provider acceptance is not customer receipt, read or payment;
automatic dunning, retries/webhooks and production provider approval remain
gated. LP-004 adds the provider-neutral SMTP transport, at most three
in-process attempts with bounded backoff, structured delivery events and an
operator-only same-day failure read model. Development and staging render to
console by default; tests capture messages in memory. Sensitive provider-only
variables such as bearer document links and temporary credentials are redacted
from persisted notification history.

`GET /api/v1/notifications` is authenticated and tenant/user scoped, supports
pagination plus unread filtering, and never returns another user's records.
The read and read-all commands apply the same scope. Workflow started and
active-step-approved events route a deduplicated internal notification to
active tenant users whose role has the pending step permission. Event delivery
remains in-process and best-effort.
