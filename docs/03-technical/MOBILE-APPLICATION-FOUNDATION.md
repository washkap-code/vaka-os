# VAKA Mobile Application Foundation

**Status:** Implemented web-installability foundation; native applications and offline writes remain planned.

## Current capability

The responsive VAKA web application is now installable on supported Android
and desktop browsers as a Progressive Web App (PWA). iPhone and iPad users can
use Safari's **Add to Home Screen** flow. The app manifest provides VAKA
identity, theme colours and an install icon; a service worker caches only the
static application shell.

## Deliberate limits

- API requests are never cached by the service worker.
- Financial, inventory, permission, billing and audit writes remain
  network-authoritative.
- The current PWA does not claim offline invoice scanning, OCR, payment
  confirmation, or conflict resolution.
- The SVG mark is a temporary shared install asset; native-store icon sets and
  launch artwork require final brand asset review.

## Native roadmap

The future iOS and Android applications should reuse the versioned API and
share authentication, tenant isolation, permissions, audit, localisation and
approval rules with the web client. Native work should add:

1. camera capture for invoices, receipts, contacts and barcodes;
2. an encrypted local capture queue with explicit sync status;
3. conflict-safe review before financial or stock posting;
4. push notifications for approvals, arrears and operational alerts;
5. mobile payment and messaging adapters after provider contracts and consent
   review; and
6. store-specific privacy, security, accessibility and release controls.
