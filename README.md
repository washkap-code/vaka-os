# VAKA Operating System (VAKA OS)

VAKA ("build" in Shona) — multi-tenant, white-label CRM + Accounting + Inventory SaaS for Zimbabwean SMEs. Live at [vakaos.com](https://vakaos.com).
Built and owned end-to-end by Jonomi Digital Studio — no low-code platform dependency.

**Flagship offering of [jonomi.digital](https://jonomi.digital).**

---

## What this is

One platform a Zimbabwean business signs into and runs everything from:

| Module | What it does |
|---|---|
| **CRM** | Contacts (customers & vendors), deal pipeline, activities. Won deals convert to invoices. |
| **Accounting** | Double-entry ledger, USD/ZWG multi-currency with per-transaction rate snapshots, invoices with VAT, payments, expenses, P&L / Balance Sheet / Trial Balance / Aged Receivables — all computed live from the journal. |
| **Inventory** | Products, warehouses, append-only stock ledger, purchase orders, opening balances, audited adjustments, low-stock alerts. |
| **Billing** | Jonomi's own revenue engine: 3-month free trial → monthly invoices with usage summaries → dunning → suspend-then-escrow (never delete-for-non-payment). |
| **White-label** | Per-tenant branding (colours, logo, subdomain) applied at runtime. Client staff see the client's brand. |

### How the modules synchronise (the core design)

All financial and stock effects flow through **two append-only ledgers** —
`journal_lines` (money) and `stock_movements` (stock) — inside **single database
transactions**. Issuing one invoice atomically:

1. assigns the immutable sequential invoice number
2. posts revenue + VAT Output to the journal (Dr AR / Cr Sales / Cr VAT)
3. posts COGS (Dr COGS / Cr Inventory) at cost snapshot
4. decrements stock via the stock ledger — **refusing to oversell**
5. marks the linked CRM deal won
6. writes the audit trail

If any step fails, everything rolls back. CRM, Accounting and Inventory can
never disagree with each other. Corrections (voids, adjustments) are offsetting
entries — history is never mutated, which is what makes the system auditable.

## Stack

- **Backend:** Node.js 22 + Express + TypeScript, Drizzle ORM (pure TS, no binary engines), PostgreSQL 16
- **Frontend:** React 18 + Vite + TypeScript, plain CSS with white-label CSS variables
- **Auth:** JWT (1h access tokens), bcrypt (cost 12), per-tenant RBAC (6 seeded roles, 10 permissions)
- **Tests:** Vitest + Supertest — 12 critical-path tests covering the journal engine, full trade cycle, overselling rollback, multi-currency, the billing state machine, and tenant isolation

## Run it

```bash
# 1. PostgreSQL 16 running, then:
cd server
cp .env.example .env          # set DATABASE_URL and a JWT_SECRET of at least 64 random bytes
npm install
npm run db:push               # create schema
PLATFORM_ADMIN_PASSWORD='replace-with-a-strong-secret' npm run seed
npm run dev                   # API on :4000

# 2. Frontend
cd ../web
npm install
npm run dev                   # Vite dev server on :5173, proxies /api to :4000

# 3. Tests
cd ../server && npm test
```

Sign up at the web UI → you get a fully seeded tenant (chart of accounts,
roles, default warehouse, trial subscription) and 3 months free.

Platform admin: `platform-admin@jonomi.digital` (password from
`PLATFORM_ADMIN_PASSWORD` at seed time). Seeding fails closed when that variable
is missing, weak, or still contains the example placeholder.
Monthly billing run: `POST /api/v1/platform/billing/run` (wire to cron in production).

## Repository layout

```
server/
  src/db/schema.ts      # full multi-tenant data model (24 tables)
  src/lib.ts            # db client, money math (integer cents), RBAC catalogue, audit, doc numbering
  src/accounting.ts     # journal engine + Zimbabwe chart of accounts template
  src/inventory.ts      # stock ledger, adjustments, PO receiving (with GL sync)
  src/invoicing.ts      # the cross-module heart: draft/issue/pay/void invoices
  src/billing.ts        # subscription state machine, billing runs, usage summaries, dunning
  src/reports.ts        # trial balance, P&L, balance sheet, aged AR, dashboard — all from the journal
  src/auth.ts           # signup (full tenant seeding), login, middleware (auth/lifecycle/RBAC)
  src/routes.ts         # REST API /api/v1
  tests/critical.test.ts
web/
  src/App.tsx           # all screens: auth, dashboard, contacts, pipeline, invoices, stock, POs, reports, billing
docs/
  01-deployment-zimbabwe.md      # Zimbabwe hosting + foreign backup architecture
  02-security-compliance.md      # Cyber & Data Protection Act posture, security controls
  03-backup-disaster-recovery.md # backup/DR runbook
  legal-templates/               # ToS, DPA, data-retention skeletons (FOR COUNSEL REVIEW)
```

## Protecting clients — and Jonomi (deliberate design decisions)

- **Suspend-then-escrow, never delete-for-non-payment.** Suspended tenants keep
  read-only access, billing access, and **unrestricted data export** — enforced in
  middleware, shown in the UI. This is both the trust-builder and the liability shield.
- **Append-only ledgers + mandatory audit log** on every money/stock/permission/lifecycle
  event: your defence in any client dispute and a Data Protection Act asset.
- **Money in integer cents**, exchange rates snapshotted per transaction, historical
  postings never revalued — survives ZWG volatility without corrupting history.
- **Tenant isolation enforced in the service layer and tested** — cross-tenant access
  returns 404, not data.
- **Immutable sequential document numbers** (ZIMRA-friendly invoice numbering).
- **VAT tracked as first-class ledger accounts** (Output 2100 / Input 1300) — your
  VAT return is a report, not a spreadsheet reconstruction.

## Phase 1 status vs the roadmap

Built and tested here: multi-tenant core, CRM, accounting engine, inventory,
billing state machine, white-label theming, reports, exports, platform admin.

Deliberately Phase 2+ (per the business plan): HR/Payroll (needs accountant
sign-off on PAYE/NSSA), mobile apps, bank CSV import UI + reconciliation screen,
ZIMRA fiscalisation, payment-gateway integration for platform billing, resource
centre, invoice PDF generation, email/SMS dunning delivery (events are recorded;
delivery adapters to wire to a local SMS/WhatsApp gateway).

> **Before go-live:** have a registered Zimbabwean accountant review the chart of
> accounts and VAT treatment, and Zimbabwean counsel finalise the legal templates
> in `docs/legal-templates/`. Register with POTRAZ. See `docs/02-security-compliance.md`.
