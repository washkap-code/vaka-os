# P2-008 — Branded finance report preview

**Status:** Implemented and locally verified; remote review and release pending
**Priority:** P1 report trust and document usability
**Depends on:** P2-003 VAT technical report; P2-006 statutory report pack;
P1-007 document boundary; P6-005 accessibility foundation

## Outcome

An authorised finance user can preview the exact VAT or statutory technical-
preview PDF inside VAKA before downloading it. The document presents the
tenant's current approved identity in a professional, restrained layout and
retains the required `Powered by VAKA OS | www.vakaos.com` attribution.

Success means the browser never offers an error/HTML payload as a PDF, preview
and download use the same validated bytes, every page remains legible, and the
document clearly states its period, currency, provisional entity scope and
professional-review limitations.

## User and business problem

**User:** Owner, Administrator, Accountant or auditor with `reports.read`.

**Problem:** current report PDFs download immediately and use a minimal
monospaced layout with only the company name. A user cannot inspect the file
before saving it, and the document does not carry the available tenant logo,
colours and company identifiers expected of an enterprise report.

**Measurable result:** representative VAT and statutory PDFs contain governed
tenant identity and VAKA attribution on every page; preview opens only after
media/signature validation; download reuses the previewed object; malformed
responses fail visibly; report exactness and all existing finance gates remain
unchanged.

## Scope

1. Define a bounded report-brand snapshot from the authenticated tenant:
   company name, validated data-image logo when available, approved primary and
   accent colours, physical address, registration, tax and VAT identifiers.
2. Keep tenant identity server-derived. No tenant, branding, legal-entity,
   currency or financial value may be accepted from the client.
3. Reuse one safe PNG/JPEG-to-PDF image boundary for invoice and report
   documents; do not fetch remote logo URLs during rendering.
4. Upgrade VAT and statutory technical-preview PDFs with:
   - professional Helvetica hierarchy and restrained tenant-colour accents;
   - company identity and optional safely decoded logo;
   - report type, period/as-at, currency, generated time and scope;
   - clear technical-preview/professional-review warnings;
   - readable section/table structure, totals and reconciliation exceptions;
   - page number plus VAKA attribution on every page.
5. Preserve authoritative report values exactly; the renderer performs no new
   accounting, tax, currency or ageing calculation.
6. Add a shared browser fetch boundary that requires a successful response,
   `application/pdf` media type and `%PDF-` file signature.
7. Add accessible preview dialogs for both report PDFs. The dialog exposes
   close and download controls, a descriptive title, loading/error feedback and
   a safe fallback when embedded PDF viewing is unavailable.
8. Download the exact validated preview bytes with a deterministic sanitised
   filename; do not refetch or regenerate merely to download.
9. Keep CSV export available and unchanged. Provider email, WhatsApp, SMS and
   public report links are excluded from this mission.
10. Add focused renderer, payload-validation, tenant-isolation, permission,
    malformed-response, accessibility and regression evidence.

## Finance readiness answers

1. **Accounting event:** none; this is read-only presentation/export.
2. **Journal:** none created or changed.
3. **Owner:** authenticated tenant remains the provisional report scope;
   canonical LegalEntity remains incomplete and visible as a blocker.
4. **Currency:** existing exact tenant-base-currency report values are rendered
   unchanged.
5. **Tax:** no tax determination changes; VAT remains a technical preview.
6. **Audit:** the existing report export event remains authoritative; add only
   bounded template/branding version evidence if needed, never report rows or
   logo bytes.
7. **Reversal:** not applicable to a read/export.
8. **Explanation:** report type, source period, as-at, currency, scope, checks
   and limitations remain explicit.
9. **AI:** no AI access, calculation, certification or action.
10. **Permission:** `reports.read` for every JSON/CSV/PDF request.

## Security, privacy and tenant rules

- Every tenant/report/branding read uses authenticated server tenant context.
- Platform administrators gain no implicit tenant report access.
- Logo support accepts only bounded data-image PNG/JPEG with matching file
  signatures and supported dimensions/encoding. Invalid, oversized or remote
  logos fall back to text identity without failing the report.
- PDF text is escaped; user content is never interpreted as PDF commands,
  markup, paths or remote resources.
- Responses remain private/no-store with safe content type, disposition and
  content-security headers.
- Browser object URLs exist only while the preview is open and are revoked on
  close/unmount. PDF bytes are not placed in browser storage.
- Errors never expose internal paths, SQL, report contents or other tenants.

## Accessibility, mobile and localisation

- Preview uses the governed focus trap, labelled dialog, keyboard close,
  visible focus and 320 CSS-pixel reflow patterns.
- The PDF frame has an accessible title and a direct download fallback.
- All new interface copy belongs to the typed English catalogue and is ready
  for reviewed ChiShona/isiNdebele additions. Finance translations remain
  disabled until qualified review.
- Stable values and report rules never depend on translated display text.

## Failure behaviour

- Report generation or network failure: show an inline error; do not open or
  download a file.
- Wrong media type, missing PDF signature or empty payload: reject the response
  and revoke any temporary object URL.
- Unsupported logo: render company text identity without the logo.
- Embedded viewer unavailable: retain the authenticated download action and
  explanatory fallback.
- Closing preview: revoke the object URL and discard bytes from component
  state.
- Export failure changes no report, finance, tax, invoice, journal or audit
  source record.

## Deliberate exclusions and next dependency

- This mission does not make VAT/statutory packs filing-ready, audited, signed
  or professionally approved.
- It does not add comparative periods, cash flow, budgets, legal entities,
  consolidation, complete AP open items, close/lock or new accounting logic.
- It does not persist immutable report snapshots or public bearer links.
- Governed email/WhatsApp distribution requires a later mission with an
  immutable report snapshot/hash, expiring/revocable single-document link,
  recipient confirmation, consent/lawful-basis policy, idempotency, provider
  adapter, delivery evidence and audit. Personal-browser automation is not an
  acceptable substitute.

## Verification

- representative branded and fallback VAT/statutory PDFs;
- multi-page footer/page-number/logo/layout and selectable-text checks;
- exact source values and professional warnings preserved;
- malformed logo and malicious PDF-text escaping;
- valid/wrong-media/malformed-signature browser payload tests;
- permission and cross-tenant negative tests;
- object-URL cleanup and static accessibility/design-system gates;
- full server suite/typechecks, web typecheck/build and dependency audits;
- visual inspection of representative rendered pages.

## Release and rollback

Release only after remote review, CI, deployment and live authenticated preview
evidence. Revert the report renderers, shared safe image boundary and preview UI
together. Existing JSON/CSV report routes and report calculations remain
available; no migration or data rollback is required.

## Implementation evidence — 2026-07-14

- VAT and statutory technical-preview PDFs now use one tenant-scoped branding
  snapshot and one bounded PDF renderer; invalid/remote logos safely fall back
  to text identity.
- The browser validates successful `application/pdf` responses and the `%PDF-`
  signature before opening an accessible preview. Download reuses those exact
  validated bytes.
- Existing CSV rendering and accounting/report calculations are unchanged.
- Focused finance/document regression: 4 files, 10 tests passed. Full server
  regression: 71 files passed, 1 skipped; 244 tests passed, 1 skipped.
- Server/web typechecks, web production build, runtime schema check, design-token
  gate, accessibility gate and all focused browser-script tests passed.
- Representative one-page VAT and two-page management-accounts PDFs were
  checked with Poppler and visually inspected for alignment, safe fallback,
  page numbering, multi-page footers and VAKA attribution.
- Production dependency audits reported 0 vulnerabilities for server and web.
- GitHub review, remote CI, deployment and authenticated live verification are
  pending because the local GitHub CLI credential has expired. No deployment or
  live activation is claimed.
