# Notifications Platform Contract

Notifications define tenant-scoped, consent-aware delivery requests. P1-004
adds injected email and persisted in-app adapters behind the kernel service.
SMS and WhatsApp adapters only record non-transmitted intent and are not live
delivery channels. P7-001 adopts the service for explicit, consented invoice,
customer-statement summary and payment-reminder email commands plus persisted
in-app outcomes. Provider acceptance is not customer receipt, read or payment;
automatic dunning, retries/webhooks and production provider approval remain
gated. Sensitive provider-only variables such as bearer document links are
redacted from persisted notification history.
