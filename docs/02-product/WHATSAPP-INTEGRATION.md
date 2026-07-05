# VAKA WhatsApp Integration Specification

**Status:** Approved product direction; provider onboarding pending  
**Owner:** Product, Engineering, Security, Support, and Compliance  
**Last reviewed:** 2026-07-05

## 1. Outcome

Let authorised businesses communicate with customers and suppliers through
WhatsApp while keeping VAKA as the system of record for invoices, payments,
tasks, consent, and audit evidence.

## 2. Supported use cases

- send an issued invoice as a secure link or approved PDF;
- send quotations, statements, payment links, receipts, and delivery updates;
- send approved payment reminders;
- receive customer replies into a shared tenant inbox;
- link or create a CRM contact after identity review;
- convert a conversation into a task, support request, opportunity, or note;
- route a conversation to an authorised human;
- send onboarding and support messages;
- notify a user that a payment provider has confirmed a payment; and
- use reviewed English, Shona, or Ndebele templates when enabled.

## 3. Channel model

Use the official WhatsApp Business Platform/Cloud API or an approved Business
Solution Provider. Personal WhatsApp automation, browser scraping, and
unofficial libraries are prohibited.

Provider responsibilities remain behind a channel adapter:

- business account and phone-number configuration;
- approved templates;
- outbound message submission;
- media upload/download;
- webhook verification and normalisation;
- delivery/read/failure status;
- inbound message receipt;
- opt-out/suppression; and
- health, limits, and pricing metadata.

## 4. Sending controls

- Store lawful basis, consent, channel preference, and opt-out status where
  required.
- Use approved templates outside the provider’s permitted conversation window.
- Preview recipient, language, template, invoice, attachment/link, and sender
  identity before confirmation.
- Never send a draft or void invoice as if payable.
- Keep message templates versioned and localisation-reviewed.
- Use idempotency to prevent duplicate sends.
- Record queued, provider-accepted, delivered, read where available, failed,
  and suppressed states without claiming more than the provider evidence.
- External sends require user confirmation unless a narrowly approved,
  revocable automation policy applies.

## 5. Portal integration

The tenant portal should include:

- channel connection status visible only to authorised administrators;
- a shared WhatsApp inbox scoped by tenant and team permissions;
- customer conversation history linked to CRM records;
- invoice/quotation/payment-link actions;
- assignment, internal notes, tags, and service-level status;
- template and consent management for authorised roles;
- explicit customer identity-matching controls; and
- clear separation between external messages and internal notes.

WhatsApp messages are communication evidence, not authoritative accounting or
payment records. Payment status changes only from verified payment-provider and
deterministic VAKA workflows.

## 6. Mobile integration

- Authorised mobile users may select an issued invoice and invoke the managed
  WhatsApp send flow.
- The native share sheet is a lower-assurance fallback and must be governed by
  organisation policy.
- Push notifications redact message content by default.
- Offline users may prepare a draft, but the server validates consent,
  template, recipient, permissions, and current invoice state before sending.

## 7. Security and privacy

- Verify webhook authenticity before processing.
- Keep access tokens and app secrets server-side and encrypted.
- Minimise stored message content and define retention by business/legal need.
- Scan inbound attachments before access.
- Restrict exports and bulk messaging.
- Prevent cross-tenant phone-number, contact, media, cache, search, and webhook
  leakage.
- Rate-limit and monitor abuse, spam, phishing, impersonation, and account
  takeover.
- Support credential rotation, channel disconnect, template disablement, and a
  global kill switch.
- Do not expose AI or staff internal notes to external recipients.

## 8. AI boundaries

VAKA AI may summarise authorised conversation history, classify intent, and
draft a response. It may not send without the required approval, invent payment
status, make unsupported commitments, or use messages from another tenant.
Drafts must retain the professional VAKA voice in every enabled language.

## 9. Rollout

1. Approve provider, data-processing terms, number ownership, consent model,
   retention, and support ownership.
2. Implement outbound invoice/payment-link templates with explicit approval.
3. Add verified delivery webhooks and audit history.
4. Add inbound shared inbox and CRM linking.
5. Add reviewed multilingual templates.
6. Pilot low-risk reminders with per-tenant limits.
7. Consider AI drafts and pre-authorised low-risk automation only after
   evaluation and revocation controls pass.

## 10. Reference

Official WhatsApp Business Platform documentation:
https://developers.facebook.com/docs/whatsapp/cloud-api/

