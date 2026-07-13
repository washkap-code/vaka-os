# Changelog

## [Unreleased]

### Fixed

- **Test DB preparation now seeds reference data.** `test:db:prepare` runs the
  plan/platform-admin seed (`src/seed.ts`) as its final step, so a freshly
  prepared test database no longer fails tenant-signup tests with
  "Unknown plan: Growth". Full DB-backed suite verified green: 50 files / 156
  tests pass (see `docs/engineering/verification/2026-07-12-full-db-suite-green.md`).

### Added

- **Core-flow accessibility and reflow foundation (P6-005):** Added reusable
  labelled-field and modal-focus patterns across authentication, customer and
  invoice journeys, including persistent accessible names, named dialogs,
  initial/contained/returned focus, Escape close and background scroll locking.
  Scoped layouts now reflow without page-level overflow at 320 and 640 CSS
  pixels, with visible focus, reduced-motion and forced-colour protections.
  Added a self-testing accessibility conformance command and CI gate. This is a
  bounded WCAG 2.2 AA-aligned foundation, not whole-product certification;
  remaining domain screens and broader assistive-technology coverage stay
  explicitly gated.

- **Responsive, permission-aware application shell (P6-002):** Extracted the
  authenticated tenant shell into focused React components with permission and
  owner-aware destinations, deterministic safe fallback, a compact desktop
  header and a 320-pixel-safe mobile drawer with Escape/focus behavior. Added
  semantic landmarks, an inert P6-004 command mount, current-user account
  actions and a recent-notification menu backed by a new completed-password-
  protected, tenant/user/IN_APP-scoped and no-store endpoint. Notification copy
  is catalogue-owned and unknown templates fail to a generic message. No route
  framework, read/unread state, migration, dependency or financial behavior was
  added; P6-004 search UI and P6-005 full WCAG verification remain gated.

- **App-wide design-system token adoption (P6-001):** Routed the public
  homepage, authentication and authenticated workspace through governed
  colour, typography, spacing, radius, elevation, motion and component roles
  while preserving existing selectors, DOM, routes and computed rendering.
  Tenant `--brand`/`--accent` overrides remain compatible and cannot replace
  functional status colours. Added a self-testing conformance command and CI
  gate covering live CSS/TSX for raw colours, font stacks, motion durations,
  undefined tokens and compatibility-contract drift. This is a parity
  foundation for P6-002, not a redesign, final brand approval or full WCAG
  claim; pre-existing 200%-zoom overflow remains tracked for P6-005.

- **Statutory report pack technical preview (P2-006):** Added one authorised,
  tenant-scoped posted-ledger pack for trial balance, P&L, balance sheet, aged
  receivables and supported-source aged payables, with exact tie-outs,
  formula-safe CSV, multi-page PDF and minimised export audits. Corrected the
  trial-balance as-at cutoff so later journals cannot leak into a selected
  position. AP control entries without a supported PO receipt source remain
  visible as unallocated reconciliation exceptions. The Reports workspace now
  includes labelled period/as-at controls and typed English preview copy. This
  remains explicitly not filing-ready: legal-entity scope, complete AP open-
  item accounting and qualified accountant approval are gated. No migration
  was added.

- **Finance document notification delivery (P7-001):** Added explicit,
  idempotent and audited invoice, customer-statement summary and overdue payment-
  reminder email commands through the P1-004 notification service, with
  initiating-user in-app outcomes. Delivery requires `accounting.post`, user
  confirmation, canonical customer email and latest append-only consent
  evidence; opt-out and invalid finance states fail closed. Templates are typed
  and versioned, exact statement values stay currency-separated, English
  fallback is explicit, and secure invoice bearer links are redacted from
  persisted history. Added additive migration
  `0019_finance_document_delivery.sql`. Production provider/domain approval,
  dedicated UI, durable retries/webhooks/rate controls, automatic dunning and
  reviewed ChiShona/isiNdebele finance copy remain gated.

- **Unified document service adapter (P1-007):** Composed the Platform Kernel
  document contract over existing immutable invoice PDF snapshots and encrypted
  capture payloads. Authenticated/public invoice PDF retrieval and capture
  binary create/detail now use one tenant-aware service with kind-qualified
  identifiers, explicit actor scope, content/size validation and provider-level
  tenant isolation, while preserving all existing endpoint contracts,
  permissions, audits and storage formats. No migration was added. External
  object storage, malware scanning, retention automation, OCR and general
  document management remain gated.

- **Reorder rules and low-stock alerts (P5-004):** Added an audited,
  tenant-scoped product reorder-rule workflow and exact aggregate stock
  threshold evaluator. P1-005 stock/product subscribers persist serialized
  breach/re-arm state and deliver deterministic, deduplicated in-app alerts to
  active inventory writers through the P1-004 notification service. Zero
  disables alerts; remaining low does not repeat; replenishment re-arms the
  next breach. Added responsive Product rule controls and additive migration
  `0018_low_stock_alert_state.sql`. Push/email/SMS/WhatsApp delivery, durable
  event retry and automatic replenishment remain gated.

- **Customer activity and communication timeline (P3-003):** Added a
  tenant-scoped, rebuildable customer chronology over canonical manual CRM
  activities, issued/voided invoices and payments. P1-005 subscribers refresh
  the projection after commit and lazy reconciliation repairs pre-existing or
  missed history. Manual activities are now validated, tenant/deal checked,
  audited atomically and emitted after commit. The responsive Contacts view
  includes permission-aware activity entry, stable cursor pagination and exact
  integer-cent financial evidence. Email entries remain manual CRM records—not
  provider delivery proof. Added additive migration
  `0017_customer_timeline_projection.sql`; durable event delivery and complete
  omnichannel history remain gated.

- **Canonical metadata registry (P1-008):** Composed a read-only kernel registry
  for Company, Customer, Invoice and Product with versioned physical lineage,
  permissions, localisation/navigation descriptors, search/result fields and
  explicit future-AI exposure boundaries. Search now consumes registry
  permissions, searchable fields and object descriptors. The authenticated
  definitions API returns permission-filtered descriptors only—never record
  values. Restricted fields and internal identifiers are AI-excluded; custom
  metadata writes fail closed. No AI provider or context/value access is
  enabled, and the tenant-backed Company projection remains explicitly not a
  LegalEntity.

- **Tenant-scoped search adapter (P1-006):** Composed the kernel search service
  with a rebuildable PostgreSQL index for canonical Customers, Invoices and
  Products. Added verified-JWT tenant/permission filtering, deterministic
  ranking and cursors, lazy canonical reconciliation, and post-commit refresh
  subscribers for customer, invoice, payment, product, stock and import facts.
  Indexed summaries deliberately exclude sensitive contact, tax, cost, note
  and ledger fields. Added additive migration `0016_search_documents.sql`.
  Durable delivery, deletion events, scale/SLO evidence, semantic search,
  P1-008 metadata adoption and a global-search UI remain gated.

- **VAT technical return report (P2-003):** Added authorised, tenant-scoped
  period reporting over posted VAT control-account lines, with exact output
  VAT, input VAT and net-position calculations. The Reports workspace now
  exposes period selection and reconcilable JSON, formula-safe CSV and
  multi-page PDF evidence exports; CSV/PDF exports create minimised audit
  evidence. The report remains explicitly not filing-ready: supplier input-VAT,
  legal-entity and qualified Zimbabwean accountant/tax approval gates remain.

- **VAT treatment model (P2-002):** Added tenant-jurisdiction, tax-date,
  line-level standard/zero-rated/exempt and document-level mixed VAT evidence.
  Standard rates resolve from the effective-dated country pack; raw rates are
  compatibility checks only. Invoice totals, journals, immutable snapshots,
  PDFs and product/import defaults now preserve the governed treatment. Added
  additive migration `0015_vat_treatment_model.sql`. Qualified Zimbabwean
  accountant/tax approval remains mandatory before market release.

- **Post-commit domain event bus (P1-005):** Composed the kernel event bus and
  added typed, stable invoice, payment, stock and tenant-lifecycle events to
  existing write paths. Events publish only after successful transactions;
  subscriber failures are isolated. Delivery is best-effort and in-process;
  durable outbox, replay, retry and dead-letter operations remain gated.

- **Notification service adapter (P1-004):** Added the kernel-composed
  notification service, provider-neutral HTTPS email transport, persisted
  in-app records, tenant-scoped dedupe/read helpers, delivery audit evidence
  and non-transmitting SMS/WhatsApp placeholders. No existing product workflow
  sends through this service yet; provider configuration and P7-001 adoption
  remain release gates. Added additive migration `0014_notifications.sql`.

- **Backup job adapter (OPS-014):** Added an injected backup job adapter
  boundary that transforms future executor output into validated manifests,
  rejects unsafe executor evidence and exposes adapter-ready/no-scheduler
  status in Super Admin. This does not schedule or run backups.
- **Backup manifest registry (OPS-013):** Added a platform backup-manifest
  table, migration, platform-admin recording/listing endpoints, validation for
  unsafe references and failed/partial reasons, platform audit evidence and a
  Recent Backup Manifests view in Super Admin. This records evidence inputs
  only; it does not run backups or prove restore readiness.
- **Backup manifest contract (OPS-012):** Added a defined-not-implemented
  backup manifest evidence contract to the platform control centre and Super
  Admin Operations tab. The contract lists required future backup evidence,
  forbidden secret content and acceptance rules without claiming backup
  automation or restore readiness.
- **Operations evidence gates (OPS-011):** Added backup, restore and
  disaster-recovery evidence gates to the platform control centre and Super
  Admin Operations tab. Missing evidence is explicitly shown as not recorded or
  requiring review; this does not implement backup/restore automation or claim
  launch readiness.
- **Super Admin control centre (OPS-010):** Added a platform-admin-only
  Operations surface, Architecture Freeze status catalogue, privacy-minimised
  runtime signals, explicit billing confirmation, tenant audit review and a
  searchable in-product Super Admin User Guide. Focused and browser
  verification passed; full server suite remains blocked by local database
  environment setup and is not recorded as passed.
- **VAKA Architecture Freeze and master blueprint:** Added the governed
  24-book master programme blueprint, Architecture Freeze register,
  programme-office registers, mission sequencing, ADRs, ontology/CIM/data
  dictionary registers, consolidated Markdown source and verified PDF output.
- **Country Pack engine (P2-001):** Declarative `CountryPack` contract
  (currencies with customer-facing labels, effective-dated VAT rates and
  treatments, statutory identifier fields, compliance calendar) under
  `server/src/platform/localisation/`, with the Zimbabwe reference pack
  (USD/ZiG, 15% VAT effective-dated, ZIMRA/NSSA calendar). Registered in the
  kernel as `LOCALISATION_SERVICE`; adding a country is pure configuration.
- **Audit facade (P1-003):** `recordAudit()` adoption seam that records through
  the kernel `AUDIT_SERVICE`, letting modules migrate off the legacy `audit()`
  helper incrementally with guaranteed identical row shape.
- **Master Build Plan:** `knowledge-system/13-roadmaps/MASTER-BUILD-PLAN.md` —
  the full mission catalogue (programmes P1–P10) to a Zimbabwe-complete launch.

- **Identity & Audit adapters (P1-002):** Bridged the existing authentication
  and audit implementations to the Platform Kernel contracts. Added
  `identityContextFromAuth`/`identityServiceForAuth` (structural, no Express
  dependency), `toAuditLogRow`/`createAuditSink` (field-for-field parity with
  the legacy `audit()` helper, proven by test), and a composition root
  (`server/src/platform-runtime.ts`) exposing `AUDIT_SERVICE` and
  `IDENTITY_FACTORY` tokens. No call sites migrated; zero behaviour change.
- **VAKA Knowledge System (Genesis 1):** Installed the version-controlled
  knowledge base (`knowledge-system/`) — foundation, vision, constitution,
  business ontology, canonical information model, data dictionary, product,
  engineering, design, AI, country/industry packs, research, roadmaps,
  templates and governance — plus the engineering mission-pack library at
  `docs/engineering/mission-packs/`.

- **Platform Kernel Foundation (P1-001):** Added an additive
  `server/src/platform/` namespace with typed contracts and focused tests for
  identity, audit, events, workflows, notifications, documents, search,
  metadata, shared runtime helpers, and dependency injection. Existing routes,
  APIs, authentication, schema, and ERP behaviour are unchanged.

- **Self-service imports:** Added tenant-scoped contact CSV preview, row
  validation, duplicate detection, explicit approval, idempotent transactional
  commit, audit batches and a responsive Imports interface.
- **Product imports:** Extended staged imports to product and service catalogues
  with SKU deduplication, exact price/tax validation, USD/ZWG support and an
  explicit safeguard against changing stock quantities.
- **Opening stock imports:** Added warehouse-mapped opening quantities and unit
  costs with zero-balance enforcement, append-only movements, product costing,
  balanced opening-equity journals, explicit approval and atomic audit evidence.
- **Bank statement imports:** Added masked tenant bank accounts and generic CSV
  preview/import with exact signed amounts, date validation, deterministic
  duplicate prevention and an explicitly unreviewed, non-posting bank feed.
- **Bank CSV compatibility:** The review-first bank-statement importer now
  recognises common statement headers for value/posting dates, transaction
  details, debit/credit amounts, DR/CR and reference numbers. It remains a
  generic compatibility layer, not a certified bank integration.
- **Bank invoice matching:** Added reviewed matching from positive bank lines
  to open invoices, including exact, one-invoice partial payments, and reviewed
  split allocation across multiple invoices, with permission checks, payment
  posting, journal linkage, tenant isolation and audit evidence. Fee, transfer,
  refund and full reconciliation reporting remain future work.
- **Bank reconciliation summary:** Added a tenant-scoped read-only summary for
  registered bank accounts, showing imported lines, matched/unreviewed counts,
  inflows, outflows, net movement, unreviewed net and date coverage before full
  statement-balance reconciliation is implemented.
- **Bank reconciliation worksheet:** Added a read-only worksheet preview where
  users can enter a statement date and closing balance to compare imported bank
  movement against the expected book balance, with no posting or sign-off.
- **Bank reconciliation sign-off foundation:** Added saved reconciliation
  reports with prepared/approved states, permission checks, audit evidence and
  strict approval blocking unless the report is balanced with no unreviewed
  bank lines.
- **Bank reconciliation report download:** Added audited CSV report generation
  for saved bank reconciliations, including account details, saved worksheet
  totals, sign-off evidence and supporting imported bank lines.
- **Bank fee posting:** Added controlled posting for negative bank statement
  lines as bank fees, debiting Bank Charges & IMTT, crediting the selected bank
  account, linking the bank line to the journal entry and recording audit
  evidence.
- **Internal bank transfer matching:** Added controlled matching for equal and
  opposite unreviewed bank lines across two registered tenant bank accounts,
  posting one internal-transfer journal entry, linking both bank lines to that
  journal and recording audit evidence.
- **Dedicated bank ledgers:** Each newly registered bank account now receives
  its own tenant-owned asset ledger account. Existing unmapped bank accounts
  receive one safely before a future bank-derived posting, so fee, invoice-match
  and internal-transfer journals identify the actual bank account involved.
- **Finance integrity controls:** Added explicit idempotency requirements for
  financial payment, expense and stock-adjustment writes, tenant account
  validation for journal lines, append-only journal-line protection, and
  finance-focused verification scripts/tests.
- **Expense tenant isolation:** Expense submissions now require an active,
  tenant-owned expense account and a tenant-owned vendor contact where one is
  supplied, before any financial record or journal can be created.
- **Journal integrity:** Posted journals now reject zero-value lines, ensuring
  each ledger line carries a real debit or credit amount.
- **Warehouse auditability:** Warehouse creation now records an atomic,
  tenant-scoped `warehouse.created` audit event with the location details.
- **Exact financial reporting:** Trial balance, profit and loss, balance sheet
  and dashboard financial totals now use exact minor-unit arithmetic and return
  precise decimal strings instead of floating-point calculations.
- **Invoice PDF foundation:** Added an authorised, tenant-scoped PDF download
  endpoint rendered from the immutable issued invoice snapshot, with private
  cache headers and audited downloads.
- **Managed company logos:** Added secure tenant-scoped PNG/JPEG logo uploads,
  signature and dimension checks, workspace persistence, audit evidence, and a
  settings upload control.
- **Secure invoice sharing:** Added expiring, revocable one-invoice PDF links
  with opaque stored-hash tokens, public download isolation, and full create,
  open and revoke audit evidence.
- **Manual invoice delivery:** Authorised users can now open their own email
  client or WhatsApp share screen with a fresh secure invoice link. This is a
  user-controlled fallback, not provider-managed delivery confirmation.
- **Invoice link management:** The invoice workspace now lists link creation,
  expiry and view state, with tenant-scoped revocation controls and no token
  disclosure in the management response.
- **Branded invoice PDFs:** Validated uploaded PNG/JPEG logos are now embedded
  in generated invoice PDFs from the immutable issued snapshot; arbitrary
  external logo URLs are not fetched.
- **Owner session visibility:** Added hashed server-side session records,
  idle/absolute expiry, last-seen presence, owner-only Users & Activity views,
  material audit history, and audited session revocation. Refresh-token
  rotation, MFA and explicit ownership transfer remain follow-on hardening.
- **Owner team access:** Owners can now create non-owner members with an
  auditable one-time temporary password, choose a tenant role, and disable or
  re-enable access; disabling a member revokes active sessions.
- **Platform analytics:** The platform-admin console now includes aggregate
  tenant lifecycle, plan mix, user/session, growth, subscription billing and
  recent activity metrics without exposing routine tenant business records.
- **Mobile installability:** The responsive web app now includes a PWA
  manifest, install metadata, branded install artwork and a static-shell
  service worker. API and business writes remain network-authoritative until
  the native/offline sync layer is built.
- **Mobile document capture:** Imports now provide a camera-friendly,
  tenant-scoped capture inbox for PNG, JPEG and PDF invoices, receipts and
  contact documents. Captures are validated, attributed and audited; OCR and
  business posting remain explicit future review steps.
- **Mobile capture review:** Authorised import approvers can now open captured
  images/PDFs, add an optional review note, and mark evidence reviewed or
  rejected. Decisions are tenant-scoped and audit logged; no OCR or business
  record is created automatically.
- **Capture evidence protection:** New mobile captures are encrypted with
  authenticated AES-256-GCM before database storage, while legacy plaintext
  rows remain readable for controlled migration. Dedicated object storage,
  malware scanning, and retention controls remain follow-on work.
- **Issued invoice evidence:** Issuing an invoice now captures an immutable,
  tenant-scoped versioned document snapshot of company identity, customer,
  amounts and line items. It is the foundation for future branded PDF download
  and delivery; no PDF or email is claimed as live yet.
- **Arrears notifications:** Added server-derived due-soon, overdue, suspended
  and cleared billing states with exact currency amounts and a persistent red
  portal bar linking directly to Billing.
- **Upgrade comparison:** Added a tenant Upgrade tab with current-package
  context, responsive package comparison, honest planned-feature labels, and an
  audited upgrade-interest workflow that does not change billing automatically.
- **Workspace settings:** Added personal-name and company-identity settings,
  colour/logo preview, workspace branding application, registration/tax/address
  fields, and a complete managed-upload/white-label specification.
- **Security:** Added forced first-login password changes for temporary
  credentials, server-side route enforcement, and platform password-change
  audit evidence.
- **Referral foundation:** Added platform-managed codes, immutable
  transactional signup attribution, rule-version snapshots, self-referral
  protection, tenant audit evidence, and referral-link signup capture. This
  does not calculate commissions, grant client access, or issue payouts.
- **Referral review:** Added a platform-only attribution review queue with
  append-only pending, qualified, rejected, and held events, recorded actors,
  reason codes, tenant audit evidence, and database mutation protection.
- **Internal:** Defined the controlled product and technical requirements for
  branded invoice PDFs, invoice delivery, secure customer access, managed
  company logos, and currency-safe dashboard ageing.
- **Internal:** Defined the iOS/Android mobile direction, camera-assisted
  document capture, Zimbabwe payment-provider strategy, governed WhatsApp
  integration, and advanced-capability role/permission model.
- **Internal:** Defined secure Zimbabwean bank statement import, contracted
  read-only feed, transaction matching, and reconciliation requirements.
- **Internal:** Defined explicit tenant ownership, server-side session
  visibility, revocation, and owner-only privacy-minimised activity history.
- **Internal:** Revised Starter, Growth, Business, and Enterprise packaging
  around operational outcomes and defined the required versioned entitlement
  architecture.
- **Internal:** Rebased recommended package prices to USD 19, USD 69, USD 249,
  and Enterprise from USD 599/month, with implementation and provider usage
  separated; prices remain proposed pending commercial validation.
- **Internal:** Defined general referral and Professional Partner account
  models, consent-based client portfolios, recurring commission hypotheses,
  append-only commission accounting, and controlled payouts.

### Changed

- **Internal:** Dashboard and aged-receivables totals are now calculated with
  exact minor-unit arithmetic and displayed separately for USD and ZWG.

### Security

- **Internal:** Production startup now fails closed when the database URL or a
  strong JWT signing secret is missing. Platform-administrator seeding also
  requires an explicit non-placeholder password.
