# Changelog

## [Unreleased]

### Added

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
