# Changelog

## [Unreleased]

### Added

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
