// =============================================================================
// VAKA PLATFORM — Core Data Model (Drizzle ORM / PostgreSQL)
// Multi-tenant CRM + Accounting + Inventory + Billing.
// Every business-data table carries tenant_id. All financial and stock effects
// flow through two append-only ledgers: journal_lines and stock_movements.
// =============================================================================
import {
  pgTable, uuid, text, timestamp, boolean, integer, numeric, jsonb,
  pgEnum, uniqueIndex, index, check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------- enums ----------
export const tenantStatus = pgEnum("tenant_status", ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CLOSED"]);
export const currency = pgEnum("currency", ["USD", "ZWG"]);
export const contactType = pgEnum("contact_type", ["INDIVIDUAL", "COMPANY"]);
export const dealStage = pgEnum("deal_stage", ["NEW", "QUALIFIED", "PROPOSAL", "WON", "LOST"]);
export const accountType = pgEnum("account_type", ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]);
export const invoiceStatus = pgEnum("invoice_status", ["DRAFT", "ISSUED", "PARTIAL", "PAID", "VOID"]);
export const stockReason = pgEnum("stock_reason", ["SALE", "PURCHASE", "ADJUSTMENT", "TRANSFER_IN", "TRANSFER_OUT", "OPENING"]);
export const poStatus = pgEnum("po_status", ["DRAFT", "ORDERED", "RECEIVED", "CANCELLED"]);
export const subStatus = pgEnum("sub_status", ["TRIALING", "ACTIVE", "PAST_DUE", "SUSPENDED", "CLOSED"]);
export const referralProgram = pgEnum("referral_program", ["GENERAL", "PROFESSIONAL"]);

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const money = (name: string) => numeric(name, { precision: 14, scale: 2 });
const qty = (name: string) => numeric(name, { precision: 12, scale: 3 });
const rate = (name: string) => numeric(name, { precision: 18, scale: 6 });

// ---------------------------------------------------------------------------
// PLATFORM CORE
// ---------------------------------------------------------------------------
export const tenants = pgTable("tenants", {
  id: id(),
  companyName: text("company_name").notNull(),
  subdomain: text("subdomain").notNull().unique(),
  customDomain: text("custom_domain"),
  logoUrl: text("logo_url"),
  brandPrimaryColor: text("brand_primary_color").default("#14171F").notNull(),
  brandSecondaryColor: text("brand_secondary_color").default("#C9A227").notNull(),
  baseCurrency: currency("base_currency").default("USD").notNull(),
  status: tenantStatus("status").default("TRIAL").notNull(),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }).notNull(),
  // ZIMRA / registration details for compliant invoices
  taxNumber: text("tax_number"),
  vatNumber: text("vat_number"),
  registrationNumber: text("registration_number"),
  physicalAddress: text("physical_address"),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  tenantId: uuid("tenant_id").references(() => tenants.id), // null => platform super-admin
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  roleId: uuid("role_id"),
  isPlatformAdmin: boolean("is_platform_admin").default(false).notNull(),
  status: text("status").default("active").notNull(), // active | invited | disabled
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("users_tenant_email").on(t.tenantId, t.email)]);

export const roles = pgTable("roles", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  permissions: text("permissions").array().notNull(),
  isSystem: boolean("is_system").default(false).notNull(),
}, (t) => [uniqueIndex("roles_tenant_name").on(t.tenantId, t.name)]);

export const auditLogs = pgTable("audit_logs", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  userId: uuid("user_id"),
  action: text("action").notNull(), // invoice.issued, stock.adjusted, tenant.suspended...
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  metadata: jsonb("metadata"),
  createdAt: createdAt(),
}, (t) => [index("audit_tenant_time").on(t.tenantId, t.createdAt)]);

// Platform-level acquisition records. Referral attribution never grants access
// to the referred tenant and is intentionally separate from client permissions.
export const referralCodes = pgTable("referral_codes", {
  id: id(),
  code: text("code").notNull().unique(),
  program: referralProgram("program").notNull(),
  ruleVersion: text("rule_version").notNull(),
  referrerTenantId: uuid("referrer_tenant_id").references(() => tenants.id),
  referrerUserId: uuid("referrer_user_id").references(() => users.id),
  campaign: text("campaign"),
  status: text("status").default("active").notNull(), // active | disabled
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
}, (t) => [
  check("referral_codes_referrer_required",
    sql`${t.referrerTenantId} IS NOT NULL OR ${t.referrerUserId} IS NOT NULL`),
  index("referral_codes_referrer").on(t.referrerTenantId, t.referrerUserId),
  index("referral_codes_status").on(t.status, t.expiresAt),
]);

// One immutable first-touch attribution per referred company. Future disputes
// use append-only review events rather than rewriting this captured source.
export const referralAttributions = pgTable("referral_attributions", {
  id: id(),
  referredTenantId: uuid("referred_tenant_id").notNull().unique().references(() => tenants.id),
  referralCodeId: uuid("referral_code_id").notNull().references(() => referralCodes.id),
  program: referralProgram("program").notNull(),
  ruleVersion: text("rule_version").notNull(),
  status: text("status").default("CAPTURED").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("referral_attribution_code").on(t.referralCodeId, t.capturedAt)]);

// Per-tenant sequential document numbering (invoices, POs, payments)
export const numberSequences = pgTable("number_sequences", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  key: text("key").notNull(), // invoice | purchase_order | payment
  prefix: text("prefix").notNull(),
  nextVal: integer("next_val").default(1).notNull(),
}, (t) => [uniqueIndex("numseq_tenant_key").on(t.tenantId, t.key)]);

// ---------------------------------------------------------------------------
// CRM
// ---------------------------------------------------------------------------
export const contacts = pgTable("contacts", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  type: contactType("type").default("COMPANY").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  taxNumber: text("tax_number"), // customer's ZIMRA BP/VAT number
  tags: text("tags").array().default(sql`'{}'`).notNull(),
  isCustomer: boolean("is_customer").default(true).notNull(),
  isVendor: boolean("is_vendor").default(false).notNull(),
  ownerUserId: uuid("owner_user_id"),
  createdAt: createdAt(),
}, (t) => [index("contacts_tenant_name").on(t.tenantId, t.name)]);

export const deals = pgTable("deals", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  contactId: uuid("contact_id").notNull().references(() => contacts.id),
  title: text("title").notNull(),
  stage: dealStage("stage").default("NEW").notNull(),
  valueAmount: money("value_amount").default("0").notNull(),
  valueCurrency: currency("value_currency").default("USD").notNull(),
  expectedCloseDate: timestamp("expected_close_date", { withTimezone: true }),
  wonInvoiceId: uuid("won_invoice_id"), // CRM -> Accounting sync: deal converted to invoice
  ownerUserId: uuid("owner_user_id"),
  createdAt: createdAt(),
}, (t) => [index("deals_tenant_stage").on(t.tenantId, t.stage)]);

export const activities = pgTable("activities", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  contactId: uuid("contact_id").notNull().references(() => contacts.id),
  dealId: uuid("deal_id").references(() => deals.id),
  type: text("type").notNull(), // call | email | meeting | note | task
  body: text("body").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ownerUserId: uuid("owner_user_id"),
  createdAt: createdAt(),
}, (t) => [index("activities_tenant_contact").on(t.tenantId, t.contactId)]);

// ---------------------------------------------------------------------------
// ACCOUNTING — double-entry ledger is the single source of truth
// ---------------------------------------------------------------------------
export const accounts = pgTable("accounts", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  type: accountType("type").notNull(),
  parentId: uuid("parent_id"),
  isSystem: boolean("is_system").default(false).notNull(),
  systemKey: text("system_key"), // AR | SALES | VAT_OUTPUT | VAT_INPUT | INVENTORY | COGS | BANK | AP | OPENING_EQUITY
  isActive: boolean("is_active").default(true).notNull(),
}, (t) => [uniqueIndex("accounts_tenant_code").on(t.tenantId, t.code)]);

// Every transaction snapshots its OWN rate at posting time.
export const exchangeRates = pgTable("exchange_rates", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  fromCurrency: currency("from_currency").notNull(),
  toCurrency: currency("to_currency").notNull(),
  rate: rate("rate").notNull(),
  effectiveDate: timestamp("effective_date", { withTimezone: true }).notNull(),
  source: text("source").default("manual").notNull(),
  createdAt: createdAt(),
}, (t) => [index("rates_tenant_date").on(t.tenantId, t.effectiveDate)]);

export const invoices = pgTable("invoices", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  contactId: uuid("contact_id").notNull().references(() => contacts.id),
  number: text("number"), // assigned at issue, immutable after
  currency: currency("currency").notNull(),
  rateToBase: rate("rate_to_base").default("1").notNull(),
  status: invoiceStatus("status").default("DRAFT").notNull(),
  issueDate: timestamp("issue_date", { withTimezone: true }),
  dueDate: timestamp("due_date", { withTimezone: true }),
  subtotal: money("subtotal").default("0").notNull(),
  taxTotal: money("tax_total").default("0").notNull(),
  total: money("total").default("0").notNull(),
  amountPaid: money("amount_paid").default("0").notNull(),
  notes: text("notes"),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("invoices_tenant_number").on(t.tenantId, t.number),
  index("invoices_tenant_status").on(t.tenantId, t.status),
]);

export const invoiceLineItems = pgTable("invoice_line_items", {
  id: id(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id),
  warehouseId: uuid("warehouse_id"),
  description: text("description").notNull(),
  quantity: qty("quantity").notNull(),
  unitPrice: money("unit_price").notNull(),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).default("0").notNull(),
  lineTotal: money("line_total").notNull(),
});

export const payments = pgTable("payments", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id),
  amount: money("amount").notNull(),
  currency: currency("currency").notNull(),
  date: timestamp("date", { withTimezone: true }).notNull(),
  reference: text("reference"),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
});

export const journalEntries = pgTable("journal_entries", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  date: timestamp("date", { withTimezone: true }).notNull(),
  memo: text("memo").notNull(),
  sourceType: text("source_type").notNull(), // invoice | payment | expense | stock_adjustment | po_receipt | manual
  sourceId: text("source_id"),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
}, (t) => [
  index("je_tenant_date").on(t.tenantId, t.date),
  index("je_source").on(t.tenantId, t.sourceType, t.sourceId),
]);

// Append-only. Debits and credits per entry MUST balance — enforced in the
// journal service inside the same DB transaction. Amounts in tenant base ccy.
export const journalLines = pgTable("journal_lines", {
  id: id(),
  journalEntryId: uuid("journal_entry_id").notNull().references(() => journalEntries.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").notNull().references(() => accounts.id),
  debit: money("debit").default("0").notNull(),
  credit: money("credit").default("0").notNull(),
  originalAmount: money("original_amount"),
  originalCurrency: currency("original_currency"),
  exchangeRate: rate("exchange_rate"),
}, (t) => [index("jl_account").on(t.accountId)]);

export const expenses = pgTable("expenses", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  categoryAccountId: uuid("category_account_id").notNull().references(() => accounts.id),
  vendorContactId: uuid("vendor_contact_id").references(() => contacts.id),
  amount: money("amount").notNull(),
  currency: currency("currency").notNull(),
  rateToBase: rate("rate_to_base").default("1").notNull(),
  date: timestamp("date", { withTimezone: true }).notNull(),
  description: text("description").notNull(),
  receiptUrl: text("receipt_url"),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
});

export const bankAccounts = pgTable("bank_accounts", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  bankName: text("bank_name"),
  accountNumber: text("account_number"),
  currency: currency("currency").notNull(),
  ledgerAccountId: uuid("ledger_account_id"),
  openingBalance: money("opening_balance").default("0").notNull(),
  createdAt: createdAt(),
});

export const bankTransactions = pgTable("bank_transactions", {
  id: id(),
  bankAccountId: uuid("bank_account_id").notNull().references(() => bankAccounts.id),
  date: timestamp("date", { withTimezone: true }).notNull(),
  description: text("description").notNull(),
  amount: money("amount").notNull(), // signed
  importedBatchId: text("imported_batch_id"),
  matchedJournalEntryId: uuid("matched_journal_entry_id"),
  createdAt: createdAt(),
}, (t) => [index("banktx_account_date").on(t.bankAccountId, t.date)]);

// ---------------------------------------------------------------------------
// INVENTORY — append-only stock ledger, synchronised with Accounting
// ---------------------------------------------------------------------------
export const products = pgTable("products", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  sku: text("sku").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  unitOfMeasure: text("unit_of_measure").default("unit").notNull(),
  costPrice: money("cost_price").default("0").notNull(),
  salePrice: money("sale_price").default("0").notNull(),
  currency: currency("currency").default("USD").notNull(),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).default("15").notNull(),
  reorderLevel: integer("reorder_level").default(0).notNull(),
  trackStock: boolean("track_stock").default(true).notNull(), // false => service item
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("products_tenant_sku").on(t.tenantId, t.sku)]);

export const warehouses = pgTable("warehouses", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  address: text("address"),
  isDefault: boolean("is_default").default(false).notNull(),
}, (t) => [uniqueIndex("warehouses_tenant_name").on(t.tenantId, t.name)]);

// Cached quantity, maintained atomically alongside stock_movements.
export const stockLevels = pgTable("stock_levels", {
  id: id(),
  productId: uuid("product_id").notNull().references(() => products.id),
  warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id),
  quantityOnHand: qty("quantity_on_hand").default("0").notNull(),
}, (t) => [uniqueIndex("stock_product_wh").on(t.productId, t.warehouseId)]);

// Append-only. Never mutate history — corrections are offsetting entries.
export const stockMovements = pgTable("stock_movements", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  productId: uuid("product_id").notNull().references(() => products.id),
  warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id),
  quantityDelta: qty("quantity_delta").notNull(), // + in, - out
  unitCost: money("unit_cost"), // cost snapshot for COGS posting
  reason: stockReason("reason").notNull(),
  sourceType: text("source_type"), // invoice | purchase_order | manual
  sourceId: text("source_id"),
  note: text("note"),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
}, (t) => [index("sm_tenant_product").on(t.tenantId, t.productId, t.warehouseId)]);

export const purchaseOrders = pgTable("purchase_orders", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  vendorContactId: uuid("vendor_contact_id").notNull().references(() => contacts.id),
  number: text("number"),
  status: poStatus("status").default("DRAFT").notNull(),
  currency: currency("currency").default("USD").notNull(),
  rateToBase: rate("rate_to_base").default("1").notNull(),
  expectedDate: timestamp("expected_date", { withTimezone: true }),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  total: money("total").default("0").notNull(),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("po_tenant_number").on(t.tenantId, t.number)]);

export const purchaseOrderLineItems = pgTable("purchase_order_line_items", {
  id: id(),
  purchaseOrderId: uuid("purchase_order_id").notNull().references(() => purchaseOrders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id),
  warehouseId: uuid("warehouse_id").notNull(),
  quantity: qty("quantity").notNull(),
  unitCost: money("unit_cost").notNull(),
  lineTotal: money("line_total").notNull(),
});

// ---------------------------------------------------------------------------
// BILLING — Jonomi's own subscription revenue; state machine enforced server-side
// ---------------------------------------------------------------------------
export const plans = pgTable("plans", {
  id: id(),
  name: text("name").notNull().unique(), // Starter | Growth | Business | Enterprise
  userLimit: integer("user_limit").notNull(),
  priceAmount: numeric("price_amount", { precision: 10, scale: 2 }).notNull(),
  priceCurrency: currency("price_currency").default("USD").notNull(),
  features: jsonb("features"),
});

export const subscriptions = pgTable("subscriptions", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().unique().references(() => tenants.id),
  planId: uuid("plan_id").notNull().references(() => plans.id),
  status: subStatus("status").default("TRIALING").notNull(),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
  trialEnd: timestamp("trial_end", { withTimezone: true }).notNull(),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const subscriptionInvoices = pgTable("subscription_invoices", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  currency: currency("currency").default("USD").notNull(),
  status: text("status").default("pending").notNull(), // pending | paid | overdue
  usageSummary: jsonb("usage_summary"),
  issuedAt: timestamp("issued_at", { withTimezone: true }).defaultNow().notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
});

export const dunningEvents = pgTable("dunning_events", {
  id: id(),
  subscriptionInvoiceId: uuid("subscription_invoice_id").notNull().references(() => subscriptionInvoices.id),
  channel: text("channel").notNull(), // email | sms | whatsapp
  attemptNumber: integer("attempt_number").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
});
