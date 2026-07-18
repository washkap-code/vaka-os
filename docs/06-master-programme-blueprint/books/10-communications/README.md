# Book Ten - VAKA Mail and Communications

**Version:** 1.0  
**Definition:** Accepted target  
**Implementation:** Notification/invoice delivery plus a default-off IMAP/SMTP Mail Core; OAuth, UI and GA controls planned

## 1. Outcome

VAKA Mail gives a business one governed communication workspace connected to customers, suppliers, invoices, orders, projects, support and internal work. It does not turn VAKA into an unbounded email provider before identity, security, consent, retention, deliverability and operations are proven.

## 2. Capability map

- connected user and shared mailboxes;
- compose, send, receive, reply, forward, drafts and attachments;
- folders/labels, search, threading and object linkage;
- calendars, availability, invitations and reminders;
- internal messages, channels and task hand-off;
- optional meeting-provider integration, recordings/retention by policy;
- tenant-approved templates and brand/document attachments;
- transactional customer/supplier communications;
- consented campaigns with suppression and analytics;
- delivery/read state only where lawful and technically reliable;
- secure document delivery and expiring access;
- mobile/push/offline-draft behavior;
- AI summarization, drafting, classification and follow-up proposals.

## 3. Canonical communication model

Mailbox, Message, Conversation, Participant, Address, Attachment/DocumentVersion, DeliveryAttempt, Consent, Template, Campaign, CalendarEvent, Meeting, Task and BusinessObjectLink are distinct canonical objects. Provider IDs are adapter metadata, not the primary identity.

Each message belongs to one tenant, policy context and retention class. Cross-tenant communication is an external exchange, never shared database scope.

## 4. Provider architecture

Gmail, Microsoft 365, IMAP/SMTP and other providers require separate approved adapters. Credentials/tokens are encrypted, least-privileged, revocable and never exposed to AI. Synchronization uses cursors, webhook verification, idempotent ingestion, backoff, reconciliation and user-visible degraded state.

The implemented Mail Core provides encrypted IMAP/SMTP accounts, incremental
UID synchronization, stored messages/attachments, threading, send/reply and
permission-aware business-object links behind `mail.hub`. It is a technical
foundation, not a GA claim: Gmail/Microsoft OAuth, webhook reconciliation,
provider onboarding, mailbox UI, malware/DLP controls, retention/export and
distributed scheduler recovery remain gated work.

SMS, WhatsApp and push use the Notification Service. WhatsApp requires verified opt-in, approved templates where applicable, channel rules, audit and safe document links. Provider availability never changes the authoritative invoice/payment/order state.

## 5. Security, privacy and abuse

Controls include sender authorization, anti-spoofing/provider alignment, malware scanning, attachment limits, link protection, rate and campaign limits, suppression, consent evidence, sensitive-data warnings, DLP policy hooks, retention/legal hold, export, deletion handling and incident visibility. VAKA does not promise read receipts when providers or privacy settings make them unreliable.

## 6. Object-linked communication

Authorized users can view a communication timeline on a canonical customer, supplier, invoice, order, project or case. Linking and search inherit the viewer’s permissions. A message matching a customer address does not automatically grant every employee access.

## 7. AI Mail

AI may summarize authorized threads, propose replies, identify commitments and suggest object links. It must distinguish quoted facts from inference, avoid sending without explicit confirmation at approved autonomy, redact unnecessary personal data, resist prompt injection in message content and log material tool use. Mail provider/model failure leaves ordinary communication usable.

## 8. Acceptance gates

Mailbox correctness; no message loss/duplication; synchronization recovery; provider and webhook security; tenant/relationship permissions; consent/suppression; malware and sensitive-data controls; retention/export; delivery observability; mobile/accessibility/localisation; AI injection/action tests; support/runbooks; and staged deliverability evidence must pass before GA.
