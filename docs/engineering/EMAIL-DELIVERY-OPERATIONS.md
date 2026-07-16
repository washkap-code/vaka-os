# Transactional email delivery operations

**Scope:** LP-004 pilot transactional delivery only. Campaigns, bulk delivery,
durable queues and provider-specific SDKs are outside this control.

## Runtime modes

- `NODE_ENV=production` always uses SMTP and refuses to start unless every
  SMTP setting is valid. TLS must be `implicit` or `starttls`.
- Development and staging use a JSON console transport by default. Set
  `SMTP_ENABLED=true` only when that environment should contact its configured
  SMTP server.
- Tests use the process in-memory transport and never contact a network.

Production configuration is documented in `server/.env.example`. Keep SMTP
credentials in the deployment secret store; never commit them or expose them
to a tenant, browser or AI provider.

## Sending-domain DNS

Before enabling production SMTP, the operator must configure the domain used by
`SMTP_FROM_ADDRESS` with the SMTP provider's exact DNS values:

1. **SPF:** publish or update one TXT record authorising the selected SMTP
   provider to send for the domain. A domain must have one consolidated SPF
   record; do not add competing records. End with the enforcement policy agreed
   with the provider and security reviewer.
2. **DKIM:** publish each provider-issued selector and public key exactly as
   supplied. Confirm the provider is signing outbound mail with the same domain
   or an intentionally aligned subdomain.
3. **DMARC:** publish a `_dmarc` TXT record with an aggregate-report mailbox.
   Begin with a monitored policy appropriate to the rollout, review reports,
   then move to quarantine/reject only after SPF and DKIM alignment are proven.

DNS values are provider- and domain-specific. This repository intentionally
does not contain example production keys, selectors, report addresses or a
universal DMARC policy. The domain owner and chosen SMTP provider must supply
and verify them.

## Pre-enable checklist

- Verify SPF, DKIM and DMARC with the SMTP provider's domain checker and an
  independent DNS lookup.
- Send test messages to representative mailbox providers and confirm the
  authenticated headers show SPF, DKIM and DMARC passing and aligned.
- Confirm `SMTP_REPLY_TO` is monitored and does not create an unowned support
  channel.
- Confirm production has `SMTP_TLS=implicit` or `SMTP_TLS=starttls` and that
  the credentials are limited to transactional sending.
- Confirm no message body or template variables appear in info-level logs.

## Failure visibility

Email attempts emit JSON events named `email.queued`, `email.retried`,
`email.sent` and `email.failed`. Each includes the message ID, recipient,
template, correlation ID and attempt number; message bodies are omitted.

Platform operators with `platform.operations.read` can call:

`GET /api/v1/platform/operations/email-failures/today`

The endpoint returns failures since 00:00 UTC from tenant notification records
and platform password-reset records. It is a read-only operational surface and
does not retry or resend messages.
