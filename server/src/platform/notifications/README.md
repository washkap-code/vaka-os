# Notifications Platform Contract

Notifications define tenant-scoped, consent-aware delivery requests. P1-004
adds injected email and persisted in-app adapters behind the kernel service.
SMS and WhatsApp adapters only record non-transmitted intent and are not live
delivery channels. P7-001 adopts the service for explicit, consented invoice,
customer-statement summary and payment-reminder email commands plus persisted
in-app outcomes. Provider acceptance is not customer receipt, read or payment;
automatic dunning, retries/webhooks and production provider approval remain
gated. LP-004 adds a provider-neutral SMTP transport, at most three in-process
attempts with bounded backoff, structured delivery events and an operator-only
same-day failure read model. Development and staging render to console by
default; tests capture messages in memory. Sensitive provider-only variables
such as bearer document links and temporary credentials are redacted from
persisted notification history.
