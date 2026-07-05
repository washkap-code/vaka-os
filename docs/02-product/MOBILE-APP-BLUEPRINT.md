# VAKA Mobile Application Blueprint

**Status:** Approved product direction; implementation pending  
**Platforms:** Apple iOS and Google Android  
**Owner:** Product, Engineering, Security, and Operations  
**Last reviewed:** 2026-07-05

## 1. Outcome

The VAKA mobile application should let an authorised user run the parts of the
business that benefit most from mobility, camera access, notifications, and
intermittent-connectivity resilience.

The mobile app is not a separate accounting system. It uses the same
tenant-scoped APIs, permissions, audit rules, and deterministic domain services
as the VAKA web application.

## 2. Distribution

- Publish through Apple’s App Store and Google Play after their review,
  privacy, signing, account, and support requirements are met.
- Use controlled internal and pilot distribution before public release.
- Support a documented minimum iOS and Android version based on pilot-device
  research, with particular attention to modest Android devices.
- Never distribute production builds through ungoverned download links.
- Keep release signing keys, store accounts, and deployment roles protected
  with least privilege and MFA.

## 3. Recommended mobile capability set

### First release

- secure sign-in, session/device management, and biometric re-entry;
- tenant and role-aware dashboard;
- customer and supplier lookup;
- create, preview, issue, download, and share authorised invoices;
- share invoices through approved email and WhatsApp delivery workflows;
- receivables ageing and payment-status notifications;
- bank-statement upload, connection freshness, and reconciliation exceptions;
- camera capture of supplier invoices and receipts into a review queue;
- expense draft creation from a captured document;
- mobile stock lookup, barcode/QR scanning, counts, and approved adjustments;
- approval inbox for invoices, purchases, expenses, payments, and discounts;
- push notifications with privacy-safe summaries;
- offline read cache and safe queued drafts for selected low-risk workflows;
- English foundation with the same future Shona and Ndebele catalogue model;
  and
- clear sync, retry, conflict, and unavailable states.

### Subsequent releases

- quotations, sales orders, delivery notes, and customer signatures;
- payment links and interoperable QR collection;
- review of suggested bank-transaction matches within role and amount limits;
- customer statement delivery;
- purchase-order receipt with camera evidence;
- POS companion mode, till/cash-up workflows, and receipt delivery;
- field-sales route/task support without continuous location tracking;
- business-card/contact scanning with confirmation;
- voice-to-draft notes in supported languages after privacy and quality review;
- VAKA AI mobile briefings and read-only explanations;
- configurable widgets and urgent-action notifications; and
- customer and supplier portal companion experiences where justified.

## 4. Scanning incoming invoices and receipts

“Scan invoice” means capturing an incoming supplier invoice, receipt, credit
note, or supporting document. It must not automatically post accounting
entries.

The flow is:

1. capture with camera or select an existing file;
2. correct orientation, crop, compress, and assess image quality on-device;
3. upload through a tenant-scoped signed request;
4. scan for unsafe content and store the original immutably;
5. run OCR/document extraction through an approved provider;
6. present supplier, document number, dates, currency, amounts, VAT, and line
   items as an unposted draft with confidence indicators;
7. detect likely duplicates using tenant, supplier, number, amount, date, and
   file fingerprint;
8. require an authorised user to verify and approve;
9. create the deterministic payable/expense workflow; and
10. retain links between source document, extraction version, reviewer, posting,
    and any correction.

OCR is assistance, not accounting authority. Low-confidence, inconsistent, or
unsupported documents must route to manual entry.

## 5. Invoice sending from mobile

Mobile users must use the same invoice-delivery service defined in
`INVOICE-DELIVERY-SPEC.md`.

- Sending is allowed only for an issued invoice and authorised recipient.
- The user previews the exact branded document and recipient.
- Email and WhatsApp sends require explicit confirmation.
- The mobile operating-system share sheet may share a downloaded PDF only when
  organisation policy permits it; managed server delivery is preferred because
  it provides delivery status, consent controls, revocation, and audit evidence.
- Sharing never changes payment status.
- The mobile client must not contain provider secrets.

## 6. Offline and sync model

- Cache the minimum data needed for approved mobile outcomes.
- Encrypt sensitive local data and use platform secure key storage.
- Queue only explicitly supported draft actions.
- Every queued write has a client-generated idempotency key.
- Never queue final journal posting, payment confirmation, permission changes,
  payroll release, or destructive actions without online server validation.
- Show pending, synced, conflicted, rejected, and retry states.
- Allow users to discard an unsubmitted local draft.
- Define per-record conflict rules; never silently overwrite financial or stock
  history.

## 7. Security and privacy

- Use standards-based mobile authentication with revocable sessions.
- Store tokens in Keychain/Keystore-backed secure storage, not general app
  preferences.
- Support remote session revocation and device inventory.
- Require step-up authentication for high-risk actions.
- Redact sensitive values from push notifications and application logs.
- Prevent screenshots only on narrowly justified sensitive screens; do not
  promise universal screenshot prevention.
- Detect compromised environments as a risk signal, not a sole control.
- Enforce certificate, transport, deep-link, clipboard, background snapshot,
  and file-sharing protections.
- Provide privacy-safe crash reporting and explicit diagnostics consent.

## 8. Mobile architecture recommendation

Use a cross-platform native framework unless prototype evidence shows a
platform-specific requirement. Because the repository is TypeScript/React,
React Native with a managed build workflow is the leading candidate, but it
requires an architecture decision after validating:

- camera/document scanning quality;
- secure storage and biometric support;
- background sync and push notifications;
- barcode/QR performance;
- PDF preview/download/share behavior;
- modest-device performance;
- offline database and migration safety;
- accessibility and language support; and
- long-term native-module maintenance.

Share API contracts, generated types, validation schemas, domain terminology,
and design tokens where appropriate. Do not duplicate server business logic or
force web components into native interfaces.

## 9. Quality gates

- Real-device tests across representative iOS and modest Android hardware
- Tenant, permission, session-revocation, and device-loss tests
- Offline, retry, duplication, conflict, and partial-upload tests
- Camera/OCR fixtures for clear, poor, rotated, handwritten, duplicate, and
  malicious documents
- Exact invoice/payment/stock reconciliation
- Accessibility, text expansion, and launch-language rendering
- App-store privacy disclosures and account-deletion/recovery behavior
- Performance, battery, data usage, and crash-free-session targets
- Signed-build provenance, dependency scanning, and rollback capability

## 10. Initial success measures

- time to create and send a correct invoice;
- percentage of captured documents converted into verified drafts;
- OCR correction rate and duplicate-prevention rate;
- payment-confirmation and reconciliation time;
- successful operation under constrained connectivity;
- mobile task completion and crash-free sessions; and
- support incidents involving permissions, sync, or document mismatch.
