// =============================================================================
// VAKA PLATFORM — Core Data Model (Drizzle ORM / PostgreSQL)
// Multi-tenant CRM + Accounting + Inventory + Billing.
// Every business-data table carries tenant_id. All financial and stock effects
// flow through two append-only ledgers: journal_lines and stock_movements.
// =============================================================================
import {
  pgTable, uuid, text, timestamp, boolean, integer, numeric, jsonb, date,
  pgEnum, unique, uniqueIndex, index, check, foreignKey, bigint as pgBigint,
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
  countryCode: text("country_code").default("ZW").notNull(),
  status: tenantStatus("status").default("TRIAL").notNull(),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }).notNull(),
  // ZIMRA / registration details for compliant invoices
  taxNumber: text("tax_number"),
  vatNumber: text("vat_number"),
  registrationNumber: text("registration_number"),
  physicalAddress: text("physical_address"),
  invoicePaymentTerms: text("invoice_payment_terms"),
  invoiceBankName: text("invoice_bank_name"),
  invoiceBankAccountName: text("invoice_bank_account_name"),
  invoiceBankAccountNumber: text("invoice_bank_account_number"),
  invoiceBankBranch: text("invoice_bank_branch"),
  invoiceBankSwiftCode: text("invoice_bank_swift_code"),
  invoiceBankCurrency: currency("invoice_bank_currency"),
  showVatNumberOnInvoices: boolean("show_vat_number_on_invoices").default(true).notNull(),
  signOutDestination: text("sign_out_destination").default("PUBLIC_HOME").notNull(),
  idleSignOutEnabled: boolean("idle_sign_out_enabled").default(false).notNull(),
  idleSignOutMinutes: integer("idle_sign_out_minutes").default(5).notNull(),
  holdingPageHeading: text("holding_page_heading"),
  holdingPageMessage: text("holding_page_message"),
  holdingOfferTitle: text("holding_offer_title"),
  holdingOfferBody: text("holding_offer_body"),
  holdingOfferCtaLabel: text("holding_offer_cta_label"),
  holdingOfferCtaUrl: text("holding_offer_cta_url"),
  createdAt: createdAt(),
}, (t) => [
  check("tenants_sign_out_destination_check", sql`${t.signOutDestination} IN ('PUBLIC_HOME', 'HOLDING_PAGE')`),
  check("tenants_idle_sign_out_minutes_check", sql`${t.idleSignOutMinutes} BETWEEN 5 AND 480`),
]);

export const platformRoles = pgTable("platform_roles", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  permissions: jsonb("permissions").$type<string[]>().default([]).notNull(),
  isSystem: boolean("is_system").default(true).notNull(),
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
  platformRoleKey: text("platform_role_key").references(() => platformRoles.key),
  status: text("status").default("active").notNull(), // active | invited | disabled
  mustChangePassword: boolean("must_change_password").default(false).notNull(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("users_tenant_email").on(t.tenantId, t.email),
  uniqueIndex("platform_users_email_unique").on(t.email).where(sql`${t.tenantId} IS NULL`),
  unique("users_id_tenant_unique").on(t.id, t.tenantId),
  index("users_platform_role").on(t.platformRoleKey),
]);

// Accountable workspace ownership is an identity invariant, not a role name.
// The composite foreign key prevents a user from owning a different tenant.
export const tenantOwnerships = pgTable("tenant_ownerships", {
  tenantId: uuid("tenant_id").primaryKey().references(() => tenants.id, { onDelete: "restrict" }),
  ownerUserId: uuid("owner_user_id").notNull(),
  establishedAt: timestamp("established_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("tenant_ownerships_owner_unique").on(t.ownerUserId),
  foreignKey({
    name: "tenant_ownerships_owner_membership_fk",
    columns: [t.ownerUserId, t.tenantId],
    foreignColumns: [users.id, users.tenantId],
  }).onDelete("restrict"),
]);

export const passwordResetRequests = pgTable("password_reset_requests", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  deliveryStatus: text("delivery_status").default("PENDING").notNull(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("password_reset_requests_token_hash").on(t.tokenHash),
  index("password_reset_requests_user_time").on(t.userId, t.createdAt),
  index("password_reset_requests_tenant").on(t.tenantId),
  check("password_reset_requests_delivery_check", sql`${t.deliveryStatus} IN ('PENDING', 'SENT', 'FAILED')`),
]);

export const userMfaFactors = pgTable("user_mfa_factors", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id),
  factorType: text("factor_type").default("TOTP").notNull(),
  status: text("status").default("PENDING").notNull(),
  encryptedSecret: text("encrypted_secret").notNull(),
  secretIv: text("secret_iv").notNull(),
  secretTag: text("secret_tag").notNull(),
  recoveryCodeHashes: jsonb("recovery_code_hashes").$type<string[]>().default([]).notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("user_mfa_factors_user").on(t.userId),
  check("user_mfa_factors_type_check", sql`${t.factorType} = 'TOTP'`),
  check("user_mfa_factors_status_check", sql`${t.status} IN ('PENDING', 'VERIFIED')`),
]);

export const platformStaffProfiles = pgTable("platform_staff_profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id),
  employeeNumber: text("employee_number").unique(),
  businessFunction: text("business_function").notNull(),
  jobTitle: text("job_title").notNull(),
  workPhone: text("work_phone"),
  location: text("location"),
  managerUserId: uuid("manager_user_id").references(() => users.id),
  employmentState: text("employment_state").default("ACTIVE").notNull(),
  startDate: date("start_date"),
  endDate: date("end_date"),
  operationalNotes: text("operational_notes"),
  updatedBy: uuid("updated_by").references(() => users.id),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("platform_staff_profiles_function").on(t.businessFunction, t.employmentState),
  index("platform_staff_profiles_manager").on(t.managerUserId),
  index("platform_staff_profiles_updated_by").on(t.updatedBy),
  check("platform_staff_profiles_state_check", sql`${t.employmentState} IN ('ACTIVE', 'LEAVE', 'ENDED')`),
]);

// Server-side presence and revocation record for an authenticated JWT. The
// bearer token itself is never stored; token_hash is only used to invalidate
// sessions and distinguish active devices without retaining credentials.
export const userSessions = pgTable("user_sessions", {
  id: id(),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  tokenHash: text("token_hash").notNull(),
  clientType: text("client_type").default("web").notNull(),
  appVersion: text("app_version"),
  deviceDescription: text("device_description"),
  ipHash: text("ip_hash"),
  createdAt: createdAt(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true }).notNull(),
  absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedBy: uuid("revoked_by").references(() => users.id),
  revokedReason: text("revoked_reason"),
}, (t) => [
  uniqueIndex("user_sessions_token_hash").on(t.tokenHash),
  index("user_sessions_tenant_activity").on(t.tenantId, t.lastSeenAt),
  index("user_sessions_user_activity").on(t.userId, t.lastSeenAt),
]);

// Rebuildable tenant search index. Canonical business records remain in their
// owning tables; this contains only minimal, permission-labelled discovery
// summaries for the Platform Kernel search adapter.
export const searchDocuments = pgTable("search_documents", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  title: text("title").notNull(),
  searchText: text("search_text").notNull(),
  permission: text("permission").notNull(),
  document: jsonb("document").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("search_documents_tenant_entity").on(t.tenantId, t.entityType, t.entityId),
  index("search_documents_tenant_title").on(t.tenantId, t.entityType, t.title),
  check("search_documents_entity_type_check", sql`${t.entityType} IN ('customer', 'supplier', 'invoice', 'product')`),
  check("search_documents_permission_check", sql`${t.permission} IN ('crm.read', 'accounting.read', 'inventory.read')`),
]);

export const platformAuditLogs = pgTable("platform_audit_logs", {
  id: id(),
  userId: uuid("user_id").references(() => users.id),
  action: text("action").notNull(),
  metadata: jsonb("metadata"),
  createdAt: createdAt(),
}, (t) => [index("platform_audit_time").on(t.createdAt)]);

export const platformBackupManifests = pgTable("platform_backup_manifests", {
  id: id(),
  manifestId: text("manifest_id").notNull(),
  contractVersion: text("contract_version").notNull(),
  environment: text("environment").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  status: text("status").notNull(), // succeeded | failed | partial
  databaseSnapshotRef: text("database_snapshot_ref").notNull(),
  objectSnapshotRef: text("object_snapshot_ref"),
  checksum: text("checksum").notNull(),
  encryptionRef: text("encryption_ref").notNull(),
  retentionExpiresAt: timestamp("retention_expires_at", { withTimezone: true }).notNull(),
  operator: text("operator").notNull(),
  failureReason: text("failure_reason"),
  recordedBy: uuid("recorded_by").references(() => users.id),
  metadata: jsonb("metadata"),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("platform_backup_manifest_id").on(t.manifestId),
  index("platform_backup_manifest_time").on(t.completedAt),
  index("platform_backup_manifest_status").on(t.status, t.completedAt),
]);

export const importBatches = pgTable("import_batches", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  entityType: text("entity_type").notNull(),
  status: text("status").default("PREVIEW").notNull(),
  totalRows: integer("total_rows").default(0).notNull(),
  validRows: integer("valid_rows").default(0).notNull(),
  invalidRows: integer("invalid_rows").default(0).notNull(),
  duplicateRows: integer("duplicate_rows").default(0).notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("imports_tenant_time").on(t.tenantId, t.createdAt)]);

export const importRows = pgTable("import_rows", {
  id: id(),
  batchId: uuid("batch_id").notNull().references(() => importBatches.id),
  rowNumber: integer("row_number").notNull(),
  data: jsonb("data").notNull(),
  status: text("status").notNull(),
  error: text("error"),
  createdRecordId: uuid("created_record_id"),
}, (t) => [uniqueIndex("import_batch_row").on(t.batchId, t.rowNumber)]);

// Mobile/PWA captures are immutable intake evidence. OCR, classification and
// any financial or inventory posting happen later through reviewed workflows.
export const captureDocuments = pgTable("capture_documents", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  documentType: text("document_type").notNull(), // INVOICE | RECEIPT | CONTACT | OTHER
  fileName: text("file_name").notNull(),
  mediaType: text("media_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  dataUrl: text("data_url").notNull(),
  status: text("status").default("CAPTURED").notNull(),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewNote: text("review_note"),
  createdAt: createdAt(),
}, (t) => [
  index("capture_documents_tenant_time").on(t.tenantId, t.createdAt),
  index("capture_documents_tenant_status").on(t.tenantId, t.status),
]);

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

// Tenant-scoped notification intent and delivery evidence. Records are never
// deleted through the notification service; only delivery status may advance.
export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  recipient: text("recipient").notNull(),
  channel: text("channel").notNull(),
  template: text("template").notNull(),
  locale: text("locale").notNull(),
  variables: jsonb("variables").notNull(),
  status: text("status").notNull(),
  transmitted: boolean("transmitted").default(false).notNull(),
  providerMessageId: text("provider_message_id"),
  dedupeKey: text("dedupe_key"),
  createdAt: createdAt(),
}, (t) => [
  index("notifications_tenant_time").on(t.tenantId, t.createdAt),
  uniqueIndex("notifications_tenant_dedupe").on(t.tenantId, t.dedupeKey),
  check("notifications_channel_check", sql`${t.channel} IN ('IN_APP', 'EMAIL', 'SMS', 'WHATSAPP')`),
  check("notifications_status_check", sql`${t.status} IN ('accepted', 'sent', 'failed')`),
]);

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

// Append-only internal review history. Current qualification state is derived
// from the latest event; prior decisions remain available for disputes/audit.
export const referralReviewEvents = pgTable("referral_review_events", {
  id: id(),
  referralAttributionId: uuid("referral_attribution_id").notNull()
    .references(() => referralAttributions.id),
  decision: text("decision").notNull(), // PENDING | QUALIFIED | REJECTED | HELD
  reasonCode: text("reason_code").notNull(),
  notes: text("notes"),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  createdAt: createdAt(),
}, (t) => [
  check("referral_review_decision_valid",
    sql`${t.decision} IN ('PENDING', 'QUALIFIED', 'REJECTED', 'HELD')`),
  check("referral_review_reason_valid",
    sql`${t.reasonCode} ~ '^[A-Z][A-Z0-9_]{2,49}$'`),
  index("referral_review_history").on(t.referralAttributionId, t.createdAt),
]);

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
  addressLine1: text("address_line_1"),
  addressLine2: text("address_line_2"),
  city: text("city"),
  region: text("region"),
  postalCode: text("postal_code"),
  countryCode: text("country_code"),
  website: text("website"),
  industry: text("industry"),
  registrationNumber: text("registration_number"),
  notes: text("notes"),
  taxNumber: text("tax_number"), // customer's ZIMRA BP/VAT number
  tags: text("tags").array().default(sql`'{}'`).notNull(),
  isCustomer: boolean("is_customer").default(true).notNull(),
  isVendor: boolean("is_vendor").default(false).notNull(),
  supplierCode: text("supplier_code"),
  supplierCurrency: currency("supplier_currency"),
  supplierPaymentTermsDays: integer("supplier_payment_terms_days"),
  supplierLeadTimeDays: integer("supplier_lead_time_days"),
  ownerUserId: uuid("owner_user_id"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: uuid("deleted_by").references(() => users.id),
  createdAt: createdAt(),
}, (t) => [
  index("contacts_tenant_name").on(t.tenantId, t.name),
  index("contacts_tenant_active_name").on(t.tenantId, t.deletedAt, t.name),
  index("contacts_deleted_by").on(t.deletedBy),
  uniqueIndex("contacts_tenant_active_supplier_code").on(t.tenantId, sql`lower(${t.supplierCode})`)
    .where(sql`${t.supplierCode} IS NOT NULL AND ${t.deletedAt} IS NULL`),
  check("contacts_supplier_payment_terms_days_check",
    sql`${t.supplierPaymentTermsDays} IS NULL OR ${t.supplierPaymentTermsDays} BETWEEN 0 AND 3650`),
  check("contacts_supplier_lead_time_days_check",
    sql`${t.supplierLeadTimeDays} IS NULL OR ${t.supplierLeadTimeDays} BETWEEN 0 AND 3650`),
]);

// Consequential record removal is owner-controlled. Requests preserve exact
// scope and decision evidence; approval performs a reversible soft removal,
// never destructive erasure of referenced CRM or financial history.
export const recordDeletionRequests = pgTable("record_deletion_requests", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  requestedBy: uuid("requested_by").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  status: text("status").default("PENDING").notNull(),
  decidedBy: uuid("decided_by").references(() => users.id),
  decisionReason: text("decision_reason"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  check("record_deletion_entity_type_check", sql`${t.entityType} IN ('contact')`),
  check("record_deletion_status_check", sql`${t.status} IN ('PENDING', 'APPROVED', 'REJECTED')`),
  uniqueIndex("record_deletion_one_pending")
    .on(t.tenantId, t.entityType, t.entityId)
    .where(sql`${t.status} = 'PENDING'`),
  index("record_deletion_tenant_status_time").on(t.tenantId, t.status, t.createdAt),
  index("record_deletion_requester_time").on(t.requestedBy, t.createdAt),
  index("record_deletion_decider").on(t.decidedBy),
]);

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

// Rebuildable chronology only. Canonical activity/financial content remains in
// its source tables and is hydrated under tenant scope when a timeline is read.
export const customerTimelineEvents = pgTable("customer_timeline_events", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  contactId: uuid("contact_id").notNull().references(() => contacts.id),
  eventKind: text("event_kind").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  actorUserId: uuid("actor_user_id"),
  projectedAt: createdAt(),
}, (t) => [
  uniqueIndex("customer_timeline_source").on(t.tenantId, t.eventKind, t.sourceId),
  index("customer_timeline_contact_time").on(t.tenantId, t.contactId, t.occurredAt, t.id),
]);

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
  systemKey: text("system_key"), // AR | SALES | VAT_OUTPUT | VAT_INPUT | INVENTORY | COGS | BANK | AP | GRNI | OPENING_EQUITY
  isActive: boolean("is_active").default(true).notNull(),
}, (t) => [
  uniqueIndex("accounts_tenant_code").on(t.tenantId, t.code),
  uniqueIndex("accounts_tenant_system_key").on(t.tenantId, t.systemKey)
    .where(sql`${t.systemKey} IS NOT NULL`),
]);

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
  taxJurisdiction: text("tax_jurisdiction"),
  taxDate: date("tax_date"),
  taxTreatment: text("tax_treatment"),
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
  check("invoices_tax_treatment_check", sql`${t.taxTreatment} IS NULL OR ${t.taxTreatment} IN ('standard', 'zero-rated', 'exempt', 'mixed')`),
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
  taxTreatment: text("tax_treatment"),
  taxAmount: money("tax_amount"),
  taxRateEffectiveFrom: date("tax_rate_effective_from"),
  taxRateEffectiveTo: date("tax_rate_effective_to"),
  lineTotal: money("line_total").notNull(),
}, (t) => [
  check("invoice_lines_tax_treatment_check", sql`${t.taxTreatment} IS NULL OR ${t.taxTreatment} IN ('standard', 'zero-rated', 'exempt')`),
]);

// Immutable render inputs captured when an invoice becomes issued. Future PDF,
// email and customer-link adapters render from this evidence, never mutable
// tenant/contact branding fields.
export const invoiceDocumentSnapshots = pgTable("invoice_document_snapshots", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  templateVersion: text("template_version").notNull(),
  document: jsonb("document").notNull(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("invoice_document_snapshot_invoice").on(t.invoiceId),
  index("invoice_document_snapshot_tenant").on(t.tenantId, t.createdAt),
]);

// Opaque, revocable links for sharing one issued invoice document outside the
// authenticated workspace. Only a SHA-256 hash of the bearer token is stored.
export const invoiceShareLinks = pgTable("invoice_share_links", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  viewedAt: timestamp("viewed_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("invoice_share_link_token_hash").on(t.tokenHash),
  index("invoice_share_link_tenant_invoice").on(t.tenantId, t.invoiceId, t.createdAt),
]);

// Append-only customer communication preference evidence. Current consent is
// derived from the latest tenant/contact/channel event; history is never edited.
export const contactCommunicationPreferenceEvents = pgTable("contact_communication_preference_events", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  contactId: uuid("contact_id").notNull().references(() => contacts.id),
  channel: text("channel").notNull(),
  status: text("status").notNull(),
  locale: text("locale").notNull(),
  evidenceSource: text("evidence_source").notNull(),
  reason: text("reason"),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  createdAt: createdAt(),
}, (t) => [
  index("contact_communication_preference_latest").on(t.tenantId, t.contactId, t.channel, t.createdAt, t.id),
  check("contact_communication_preference_channel_check", sql`${t.channel} IN ('EMAIL')`),
  check("contact_communication_preference_status_check", sql`${t.status} IN ('CONSENTED', 'OPTED_OUT')`),
  check("contact_communication_preference_locale_check", sql`${t.locale} IN ('en-ZW', 'sn-ZW', 'nd-ZW')`),
  check("contact_communication_preference_source_check", sql`${t.evidenceSource} IN ('CUSTOMER_REQUEST', 'CONTRACT', 'LEGITIMATE_INTEREST', 'OTHER')`),
]);

// Operational idempotency claim and outcome for one approved finance send.
// It never becomes accounting authority and does not alter invoice state.
export const financeDocumentDeliveryRequests = pgTable("finance_document_delivery_requests", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  contactId: uuid("contact_id").notNull().references(() => contacts.id),
  invoiceId: uuid("invoice_id").references(() => invoices.id),
  documentType: text("document_type").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  idempotencyFingerprint: text("idempotency_fingerprint").notNull(),
  status: text("status").default("PROCESSING").notNull(),
  emailNotificationId: text("email_notification_id"),
  inAppNotificationId: text("in_app_notification_id"),
  shareLinkId: uuid("share_link_id").references(() => invoiceShareLinks.id),
  failureCode: text("failure_code"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("finance_document_delivery_tenant_idempotency").on(t.tenantId, t.idempotencyKey),
  index("finance_document_delivery_tenant_contact_time").on(t.tenantId, t.contactId, t.createdAt),
  check("finance_document_delivery_type_check", sql`${t.documentType} IN ('INVOICE', 'STATEMENT', 'PAYMENT_REMINDER')`),
  check("finance_document_delivery_status_check", sql`${t.status} IN ('PROCESSING', 'SENT', 'FAILED')`),
]);

export const payments = pgTable("payments", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id),
  amount: money("amount").notNull(),
  currency: currency("currency").notNull(),
  date: timestamp("date", { withTimezone: true }).notNull(),
  reference: text("reference"),
  idempotencyKey: text("idempotency_key"),
  idempotencyFingerprint: text("idempotency_fingerprint"),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("payments_tenant_idempotency").on(t.tenantId, t.idempotencyKey)]);

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
  journalEntryId: uuid("journal_entry_id").notNull().references(() => journalEntries.id),
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
  idempotencyKey: text("idempotency_key"),
  idempotencyFingerprint: text("idempotency_fingerprint"),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("expenses_tenant_idempotency").on(t.tenantId, t.idempotencyKey)]);

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
  reference: text("reference"),
  sourceKey: text("source_key"),
  importedBatchId: text("imported_batch_id"),
  matchedJournalEntryId: uuid("matched_journal_entry_id"),
  createdAt: createdAt(),
}, (t) => [
  index("banktx_account_date").on(t.bankAccountId, t.date),
  uniqueIndex("banktx_account_source").on(t.bankAccountId, t.sourceKey),
]);

export const bankReconciliations = pgTable("bank_reconciliations", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  bankAccountId: uuid("bank_account_id").notNull().references(() => bankAccounts.id),
  statementDate: timestamp("statement_date", { withTimezone: true }).notNull(),
  statementClosingBalance: money("statement_closing_balance").notNull(),
  openingBalance: money("opening_balance").notNull(),
  importedNetMovement: money("imported_net_movement").notNull(),
  expectedBookBalance: money("expected_book_balance").notNull(),
  difference: money("difference").notNull(),
  totalLines: integer("total_lines").default(0).notNull(),
  matchedLines: integer("matched_lines").default(0).notNull(),
  unreviewedLines: integer("unreviewed_lines").default(0).notNull(),
  unreviewedNet: money("unreviewed_net").notNull(),
  status: text("status").default("PREPARED").notNull(), // PREPARED | APPROVED
  reconciliationStatus: text("reconciliation_status").notNull(), // balanced | needs_review
  notes: text("notes"),
  preparedBy: uuid("prepared_by").references(() => users.id),
  preparedAt: timestamp("prepared_at", { withTimezone: true }).defaultNow().notNull(),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("bankrec_tenant_account_statement").on(t.tenantId, t.bankAccountId, t.statementDate),
  index("bankrec_tenant_time").on(t.tenantId, t.statementDate),
  check("bankrec_status_check", sql`${t.status} IN ('PREPARED', 'APPROVED')`),
  check("bankrec_reconciliation_status_check", sql`${t.reconciliationStatus} IN ('balanced', 'needs_review')`),
]);

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
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull(),
  taxTreatment: text("tax_treatment"),
  reorderLevel: integer("reorder_level").default(0).notNull(),
  trackStock: boolean("track_stock").default(true).notNull(), // false => service item
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("products_tenant_sku").on(t.tenantId, t.sku),
  check("products_tax_treatment_check", sql`${t.taxTreatment} IS NULL OR ${t.taxTreatment} IN ('standard', 'zero-rated', 'exempt')`),
]);

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

// Operational transition/delivery state only. The stock ledger and stock_levels
// remain inventory authority; this row can be rebuilt from canonical balances.
export const lowStockAlertStates = pgTable("low_stock_alert_states", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  productId: uuid("product_id").notNull().references(() => products.id),
  state: text("state").default("HEALTHY").notNull(),
  lastObservedQuantity: qty("last_observed_quantity").default("0").notNull(),
  threshold: integer("threshold").default(0).notNull(),
  breachSequence: integer("breach_sequence").default(0).notNull(),
  notificationPending: boolean("notification_pending").default(false).notNull(),
  lastTransitionAt: timestamp("last_transition_at", { withTimezone: true }).defaultNow().notNull(),
  lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("low_stock_alert_tenant_product").on(t.tenantId, t.productId),
  index("low_stock_alert_pending").on(t.tenantId, t.notificationPending),
  check("low_stock_alert_state_check", sql`${t.state} IN ('HEALTHY', 'LOW')`),
  check("low_stock_alert_sequence_check", sql`${t.breachSequence} >= 0`),
]);

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
  idempotencyKey: text("idempotency_key"),
  idempotencyFingerprint: text("idempotency_fingerprint"),
  note: text("note"),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
}, (t) => [
  index("sm_tenant_product").on(t.tenantId, t.productId, t.warehouseId),
  uniqueIndex("stock_movements_tenant_idempotency").on(t.tenantId, t.idempotencyKey),
]);

// Rebuildable current weighted-average valuation cache. Append-only movement
// history and stock_movement_valuations remain the evidence trail.
export const inventoryValuationLayers = pgTable("inventory_valuation_layers", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  productId: uuid("product_id").notNull().references(() => products.id),
  warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id),
  quantityOnHand: qty("quantity_on_hand").default("0").notNull(),
  totalCostCents: pgBigint("total_cost_cents", { mode: "bigint" }).default(sql`0`).notNull(),
  version: pgBigint("version", { mode: "bigint" }).default(sql`0`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("inventory_valuation_layer_tenant_product_wh").on(t.tenantId, t.productId, t.warehouseId),
  index("inventory_valuation_layer_tenant_product").on(t.tenantId, t.productId),
  check("inventory_valuation_layer_quantity_check", sql`${t.quantityOnHand} >= 0`),
  check("inventory_valuation_layer_cost_check", sql`${t.totalCostCents} >= 0`),
  check("inventory_valuation_layer_zero_check", sql`${t.quantityOnHand} <> 0 OR ${t.totalCostCents} = 0`),
]);

// Append-only exact base-currency allocation evidence for every stock movement.
// Never update or delete; corrections create an offsetting stock movement.
export const stockMovementValuations = pgTable("stock_movement_valuations", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  stockMovementId: uuid("stock_movement_id").notNull().references(() => stockMovements.id),
  productId: uuid("product_id").notNull().references(() => products.id),
  warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id),
  quantityBefore: qty("quantity_before").notNull(),
  quantityAfter: qty("quantity_after").notNull(),
  costBeforeCents: pgBigint("cost_before_cents", { mode: "bigint" }).notNull(),
  movementCostCents: pgBigint("movement_cost_cents", { mode: "bigint" }).notNull(),
  costAfterCents: pgBigint("cost_after_cents", { mode: "bigint" }).notNull(),
  valuationMethod: text("valuation_method").default("WEIGHTED_AVERAGE").notNull(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("stock_movement_valuation_movement").on(t.stockMovementId),
  index("stock_movement_valuation_tenant_product_wh").on(t.tenantId, t.productId, t.warehouseId, t.createdAt),
  check("stock_movement_valuation_quantity_check", sql`${t.quantityBefore} >= 0 AND ${t.quantityAfter} >= 0`),
  check("stock_movement_valuation_cost_check", sql`${t.costBeforeCents} >= 0 AND ${t.movementCostCents} >= 0 AND ${t.costAfterCents} >= 0`),
  check("stock_movement_valuation_method_check", sql`${t.valuationMethod} = 'WEIGHTED_AVERAGE'`),
  check("stock_movement_valuation_zero_check", sql`${t.quantityAfter} <> 0 OR ${t.costAfterCents} = 0`),
]);

export const purchaseRequisitions = pgTable("purchase_requisitions", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  number: text("number").notNull(),
  status: text("status").default("SUBMITTED").notNull(),
  purpose: text("purpose").notNull(),
  neededBy: timestamp("needed_by", { withTimezone: true }),
  currency: currency("currency").default("USD").notNull(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  decisionReason: text("decision_reason"),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("purchase_requisitions_tenant_number").on(t.tenantId, t.number),
  index("purchase_requisitions_tenant_status").on(t.tenantId, t.status, t.createdAt),
  check("purchase_requisitions_status_check", sql`${t.status} IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED')`),
]);

export const purchaseRequisitionLineItems = pgTable("purchase_requisition_line_items", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  purchaseRequisitionId: uuid("purchase_requisition_id").notNull().references(() => purchaseRequisitions.id),
  productId: uuid("product_id").notNull().references(() => products.id),
  warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id),
  position: integer("position").notNull(),
  quantity: qty("quantity").notNull(),
  estimatedUnitCost: money("estimated_unit_cost"),
}, (t) => [
  uniqueIndex("purchase_requisition_lines_position").on(t.purchaseRequisitionId, t.position),
  index("purchase_requisition_lines_tenant").on(t.tenantId, t.purchaseRequisitionId),
  check("purchase_requisition_lines_position_check", sql`${t.position} > 0`),
  check("purchase_requisition_lines_quantity_check", sql`${t.quantity} > 0`),
  check("purchase_requisition_lines_cost_check", sql`${t.estimatedUnitCost} IS NULL OR ${t.estimatedUnitCost} >= 0`),
]);

export const requestForQuotes = pgTable("request_for_quotes", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  purchaseRequisitionId: uuid("purchase_requisition_id").notNull().references(() => purchaseRequisitions.id),
  number: text("number").notNull(),
  status: text("status").default("ISSUED").notNull(),
  responseDueAt: timestamp("response_due_at", { withTimezone: true }),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  awardedSupplierContactId: uuid("awarded_supplier_contact_id").references(() => contacts.id),
  awardedAt: timestamp("awarded_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("request_for_quotes_tenant_number").on(t.tenantId, t.number),
  uniqueIndex("request_for_quotes_requisition").on(t.tenantId, t.purchaseRequisitionId),
  index("request_for_quotes_tenant_status").on(t.tenantId, t.status, t.createdAt),
  check("request_for_quotes_status_check", sql`${t.status} IN ('ISSUED', 'AWARDED', 'CANCELLED')`),
]);

export const requestForQuoteLineItems = pgTable("request_for_quote_line_items", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  requestForQuoteId: uuid("request_for_quote_id").notNull().references(() => requestForQuotes.id),
  purchaseRequisitionLineItemId: uuid("purchase_requisition_line_item_id").notNull().references(() => purchaseRequisitionLineItems.id),
  productId: uuid("product_id").notNull().references(() => products.id),
  warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id),
  position: integer("position").notNull(),
  quantity: qty("quantity").notNull(),
}, (t) => [
  uniqueIndex("request_for_quote_lines_position").on(t.requestForQuoteId, t.position),
  uniqueIndex("request_for_quote_lines_requisition_line").on(t.requestForQuoteId, t.purchaseRequisitionLineItemId),
  index("request_for_quote_lines_tenant").on(t.tenantId, t.requestForQuoteId),
  check("request_for_quote_lines_position_check", sql`${t.position} > 0`),
  check("request_for_quote_lines_quantity_check", sql`${t.quantity} > 0`),
]);

export const requestForQuoteSuppliers = pgTable("request_for_quote_suppliers", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  requestForQuoteId: uuid("request_for_quote_id").notNull().references(() => requestForQuotes.id),
  supplierContactId: uuid("supplier_contact_id").notNull().references(() => contacts.id),
  invitedAt: timestamp("invited_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("request_for_quote_suppliers_unique").on(t.requestForQuoteId, t.supplierContactId),
  index("request_for_quote_suppliers_tenant").on(t.tenantId, t.requestForQuoteId),
]);

export const purchaseOrders = pgTable("purchase_orders", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  vendorContactId: uuid("vendor_contact_id").notNull().references(() => contacts.id),
  purchaseRequisitionId: uuid("purchase_requisition_id").references(() => purchaseRequisitions.id),
  requestForQuoteId: uuid("request_for_quote_id").references(() => requestForQuotes.id),
  number: text("number"),
  status: poStatus("status").default("DRAFT").notNull(),
  currency: currency("currency").default("USD").notNull(),
  rateToBase: rate("rate_to_base").default("1").notNull(),
  expectedDate: timestamp("expected_date", { withTimezone: true }),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  total: money("total").default("0").notNull(),
  createdBy: uuid("created_by"),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvalReason: text("approval_reason"),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("po_tenant_number").on(t.tenantId, t.number),
  uniqueIndex("po_tenant_rfq").on(t.tenantId, t.requestForQuoteId),
  index("po_tenant_requisition").on(t.tenantId, t.purchaseRequisitionId),
]);

export const purchaseOrderLineItems = pgTable("purchase_order_line_items", {
  id: id(),
  purchaseOrderId: uuid("purchase_order_id").notNull().references(() => purchaseOrders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id),
  warehouseId: uuid("warehouse_id").notNull(),
  quantity: qty("quantity").notNull(),
  unitCost: money("unit_cost").notNull(),
  lineTotal: money("line_total").notNull(),
});

export const goodsReceipts = pgTable("goods_receipts", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  purchaseOrderId: uuid("purchase_order_id").notNull().references(() => purchaseOrders.id),
  number: text("number").notNull(),
  status: text("status").default("POSTED").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  deliveryNote: text("delivery_note"),
  note: text("note"),
  idempotencyKey: text("idempotency_key").notNull(),
  idempotencyFingerprint: text("idempotency_fingerprint").notNull(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("goods_receipts_tenant_number").on(t.tenantId, t.number),
  uniqueIndex("goods_receipts_tenant_idempotency").on(t.tenantId, t.idempotencyKey),
  index("goods_receipts_tenant_po").on(t.tenantId, t.purchaseOrderId, t.createdAt),
  check("goods_receipts_status_check", sql`${t.status} = 'POSTED'`),
]);

export const goodsReceiptLineItems = pgTable("goods_receipt_line_items", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  goodsReceiptId: uuid("goods_receipt_id").notNull().references(() => goodsReceipts.id),
  purchaseOrderLineItemId: uuid("purchase_order_line_item_id").notNull().references(() => purchaseOrderLineItems.id),
  productId: uuid("product_id").notNull().references(() => products.id),
  warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id),
  quantityReceived: qty("quantity_received").notNull(),
  unitCost: money("unit_cost").notNull(),
  lineTotal: money("line_total").notNull(),
}, (t) => [
  uniqueIndex("goods_receipt_lines_po_line").on(t.goodsReceiptId, t.purchaseOrderLineItemId),
  index("goods_receipt_lines_tenant_receipt").on(t.tenantId, t.goodsReceiptId),
  index("goods_receipt_lines_po_line_lookup").on(t.tenantId, t.purchaseOrderLineItemId),
  check("goods_receipt_lines_quantity_check", sql`${t.quantityReceived} > 0`),
  check("goods_receipt_lines_cost_check", sql`${t.unitCost} >= 0 AND ${t.lineTotal} >= 0`),
]);

export const supplierBills = pgTable("supplier_bills", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  purchaseOrderId: uuid("purchase_order_id").notNull().references(() => purchaseOrders.id),
  vendorContactId: uuid("vendor_contact_id").notNull().references(() => contacts.id),
  number: text("number"),
  supplierInvoiceNumber: text("supplier_invoice_number").notNull(),
  status: text("status").default("DRAFT").notNull(),
  billDate: timestamp("bill_date", { withTimezone: true }).notNull(),
  taxDate: date("tax_date").notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  currency: currency("currency").notNull(),
  rateToBase: rate("rate_to_base").notNull(),
  taxJurisdiction: text("tax_jurisdiction").notNull(),
  taxTreatment: text("tax_treatment").notNull(),
  subtotal: money("subtotal").notNull(),
  taxTotal: money("tax_total").notNull(),
  total: money("total").notNull(),
  matchStatus: text("match_status").default("PENDING").notNull(),
  matchEvidence: jsonb("match_evidence"),
  matchedAt: timestamp("matched_at", { withTimezone: true }),
  postingIdempotencyKey: text("posting_idempotency_key"),
  postingIdempotencyFingerprint: text("posting_idempotency_fingerprint"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  updatedBy: uuid("updated_by").notNull().references(() => users.id),
  postedBy: uuid("posted_by").references(() => users.id),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("supplier_bills_tenant_number").on(t.tenantId, t.number),
  uniqueIndex("supplier_bills_tenant_supplier_invoice").on(t.tenantId, t.vendorContactId, sql`lower(${t.supplierInvoiceNumber})`),
  uniqueIndex("supplier_bills_tenant_posting_idempotency").on(t.tenantId, t.postingIdempotencyKey),
  index("supplier_bills_tenant_po").on(t.tenantId, t.purchaseOrderId, t.createdAt),
  index("supplier_bills_tenant_status").on(t.tenantId, t.status, t.dueDate),
  check("supplier_bills_status_check", sql`${t.status} IN ('DRAFT', 'POSTED')`),
  check("supplier_bills_match_status_check", sql`${t.matchStatus} IN ('PENDING', 'MATCHED', 'BLOCKED')`),
  check("supplier_bills_tax_treatment_check", sql`${t.taxTreatment} IN ('standard', 'zero-rated', 'exempt', 'mixed')`),
  check("supplier_bills_totals_check", sql`${t.subtotal} >= 0 AND ${t.taxTotal} >= 0 AND ${t.total} >= 0`),
]);

export const supplierBillLineItems = pgTable("supplier_bill_line_items", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  supplierBillId: uuid("supplier_bill_id").notNull().references(() => supplierBills.id),
  purchaseOrderLineItemId: uuid("purchase_order_line_item_id").notNull().references(() => purchaseOrderLineItems.id),
  productId: uuid("product_id").notNull().references(() => products.id),
  position: integer("position").notNull(),
  quantity: qty("quantity").notNull(),
  unitPrice: money("unit_price").notNull(),
  netAmount: money("net_amount").notNull(),
  taxTreatment: text("tax_treatment").notNull(),
  taxRate: numeric("tax_rate", { precision: 7, scale: 4 }).notNull(),
  taxRateEffectiveFrom: date("tax_rate_effective_from"),
  taxRateEffectiveTo: date("tax_rate_effective_to"),
  taxAmount: money("tax_amount").notNull(),
  lineTotal: money("line_total").notNull(),
}, (t) => [
  uniqueIndex("supplier_bill_lines_po_line").on(t.supplierBillId, t.purchaseOrderLineItemId),
  uniqueIndex("supplier_bill_lines_position").on(t.supplierBillId, t.position),
  index("supplier_bill_lines_tenant_bill").on(t.tenantId, t.supplierBillId),
  index("supplier_bill_lines_tenant_po_line").on(t.tenantId, t.purchaseOrderLineItemId),
  check("supplier_bill_lines_position_check", sql`${t.position} > 0`),
  check("supplier_bill_lines_quantity_check", sql`${t.quantity} > 0`),
  check("supplier_bill_lines_money_check", sql`${t.unitPrice} > 0 AND ${t.netAmount} >= 0 AND ${t.taxAmount} >= 0 AND ${t.lineTotal} >= 0`),
  check("supplier_bill_lines_tax_treatment_check", sql`${t.taxTreatment} IN ('standard', 'zero-rated', 'exempt')`),
]);

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

export const subscriptionPaymentAttempts = pgTable("subscription_payment_attempts", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  subscriptionInvoiceId: uuid("subscription_invoice_id").notNull().references(() => subscriptionInvoices.id),
  provider: text("provider").default("PAYNOW").notNull(),
  merchantReference: text("merchant_reference").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  currency: currency("currency").notNull(),
  status: text("status").default("CREATED").notNull(),
  providerStatus: text("provider_status"),
  providerReference: text("provider_reference"),
  redirectUrl: text("redirect_url"),
  encryptedPollUrl: text("encrypted_poll_url"),
  initiatedBy: uuid("initiated_by").notNull().references(() => users.id),
  providerConfirmedAt: timestamp("provider_confirmed_at", { withTimezone: true }),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("subscription_payment_attempts_reference_unique").on(t.merchantReference),
  uniqueIndex("subscription_payment_attempts_idempotency_unique")
    .on(t.tenantId, t.subscriptionInvoiceId, t.idempotencyKey),
  index("subscription_payment_attempts_tenant_invoice")
    .on(t.tenantId, t.subscriptionInvoiceId, t.createdAt),
  index("subscription_payment_attempts_invoice").on(t.subscriptionInvoiceId),
  index("subscription_payment_attempts_initiated_by").on(t.initiatedBy),
  check("subscription_payment_attempts_provider_check", sql`${t.provider} = 'PAYNOW'`),
  check("subscription_payment_attempts_status_check", sql`${t.status} IN ('CREATED', 'PENDING', 'PAID', 'FAILED', 'CANCELLED', 'DISPUTED', 'REFUNDED', 'REQUIRES_REVIEW')`),
]);

export const dunningEvents = pgTable("dunning_events", {
  id: id(),
  subscriptionInvoiceId: uuid("subscription_invoice_id").notNull().references(() => subscriptionInvoices.id),
  channel: text("channel").notNull(), // email | sms | whatsapp
  attemptNumber: integer("attempt_number").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
});
