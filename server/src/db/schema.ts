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
import type { WorkflowStepDefinition } from "../platform/workflow/types.js";
import type { DomainEventPayloads, EventType } from "../platform/events/registry.js";

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
  // P9-010: hashed, single-use refresh credential state. Nullable for a
  // compatible migration — pre-rotation sessions simply cannot renew.
  refreshTokenHash: text("refresh_token_hash"),
  previousRefreshTokenHash: text("previous_refresh_token_hash"),
  refreshRotatedAt: timestamp("refresh_rotated_at", { withTimezone: true }),
  assuranceLevel: text("assurance_level").default("aal1").notNull(),
}, (t) => [
  uniqueIndex("user_sessions_token_hash").on(t.tokenHash),
  index("user_sessions_tenant_activity").on(t.tenantId, t.lastSeenAt),
  index("user_sessions_user_activity").on(t.userId, t.lastSeenAt),
  uniqueIndex("user_sessions_refresh_token_hash").on(t.refreshTokenHash)
    .where(sql`${t.refreshTokenHash} IS NOT NULL`),
  uniqueIndex("user_sessions_previous_refresh_token_hash").on(t.previousRefreshTokenHash)
    .where(sql`${t.previousRefreshTokenHash} IS NOT NULL`),
  check("user_sessions_assurance_level_check", sql`${t.assuranceLevel} IN ('aal1', 'aal2')`),
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

export const platformRestoreDrills = pgTable("platform_restore_drills", {
  id: id(),
  drillId: text("drill_id").notNull(),
  backupManifestId: uuid("backup_manifest_id").notNull()
    .references(() => platformBackupManifests.id, { onDelete: "restrict" }),
  environment: text("environment").notNull(),
  scenario: text("scenario").notNull(),
  isolatedTargetRef: text("isolated_target_ref").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  targetRecoveryPointAt: timestamp("target_recovery_point_at", { withTimezone: true }).notNull(),
  recoveredThroughAt: timestamp("recovered_through_at", { withTimezone: true }).notNull(),
  targetRpoMinutes: integer("target_rpo_minutes").notNull(),
  targetRtoMinutes: integer("target_rto_minutes").notNull(),
  achievedRpoMinutes: integer("achieved_rpo_minutes").notNull(),
  achievedRtoMinutes: integer("achieved_rto_minutes").notNull(),
  outcome: text("outcome").notNull(),
  checksumVerified: boolean("checksum_verified").notNull(),
  schemaVerified: boolean("schema_verified").notNull(),
  tenantIsolationVerified: boolean("tenant_isolation_verified").notNull(),
  auditContinuityVerified: boolean("audit_continuity_verified").notNull(),
  ledgerBalanceVerified: boolean("ledger_balance_verified").notNull(),
  objectRecoveryVerified: boolean("object_recovery_verified"),
  verificationSummary: text("verification_summary").notNull(),
  failureReason: text("failure_reason"),
  operator: text("operator").notNull(),
  recordedBy: uuid("recorded_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("platform_restore_drill_id").on(t.drillId),
  index("platform_restore_drill_time").on(t.completedAt),
  index("platform_restore_drill_manifest").on(t.backupManifestId),
  check("platform_restore_drill_scenario_check",
    sql`${t.scenario} IN ('FULL_DATABASE', 'POINT_IN_TIME', 'DATABASE_AND_OBJECTS')`),
  check("platform_restore_drill_outcome_check", sql`${t.outcome} IN ('SUCCEEDED', 'PARTIAL', 'FAILED')`),
  check("platform_restore_drill_time_check", sql`${t.completedAt} > ${t.startedAt}`),
  check("platform_restore_drill_recovery_time_check",
    sql`${t.targetRecoveryPointAt} <= ${t.completedAt} AND ${t.recoveredThroughAt} <= ${t.completedAt}`),
  check("platform_restore_drill_target_bounds_check",
    sql`${t.targetRpoMinutes} BETWEEN 1 AND 43200 AND ${t.targetRtoMinutes} BETWEEN 1 AND 10080`),
  check("platform_restore_drill_achieved_bounds_check",
    sql`${t.achievedRpoMinutes} BETWEEN 0 AND 525600 AND ${t.achievedRtoMinutes} BETWEEN 1 AND 10080`),
  check("platform_restore_drill_failure_reason_check",
    sql`${t.outcome} = 'SUCCEEDED' OR ${t.failureReason} IS NOT NULL`),
  check("platform_restore_drill_success_checks_check", sql`${t.outcome} <> 'SUCCEEDED' OR (
    ${t.checksumVerified} AND ${t.schemaVerified} AND ${t.tenantIsolationVerified}
    AND ${t.auditContinuityVerified} AND ${t.ledgerBalanceVerified}
    AND (${t.scenario} <> 'DATABASE_AND_OBJECTS' OR ${t.objectRecoveryVerified} = true)
  )`),
]);

export const platformRestoreDrillReviews = pgTable("platform_restore_drill_reviews", {
  id: id(),
  restoreDrillId: uuid("restore_drill_id").notNull()
    .references(() => platformRestoreDrills.id, { onDelete: "restrict" }),
  decision: text("decision").notNull(),
  reason: text("reason").notNull(),
  reviewedBy: uuid("reviewed_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("platform_restore_drill_review_once").on(t.restoreDrillId),
  index("platform_restore_drill_review_time").on(t.createdAt),
  check("platform_restore_drill_review_decision_check", sql`${t.decision} IN ('ACCEPTED', 'REJECTED')`),
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

// P1-006 — append-only universal object evidence. Inserts must go through
// vaka_append_audit_log(), which serializes each tenant chain and computes the
// SHA-256 hash. The migration also blocks UPDATE/DELETE at database level.
export const auditLog = pgTable("audit_log", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  actorId: uuid("actor_id"),
  actorType: text("actor_type").$type<"user" | "system" | "ai">().notNull(),
  action: text("action").notNull(),
  objectType: text("object_type").notNull(),
  objectId: text("object_id"),
  beforeJson: jsonb("before_json").$type<Record<string, unknown>>(),
  afterJson: jsonb("after_json").$type<Record<string, unknown>>(),
  source: text("source").notNull(),
  ip: text("ip"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  hash: text("hash").notNull(),
  prevHash: text("prev_hash"),
}, (t) => [
  index("audit_log_tenant_time").on(t.tenantId, t.occurredAt, t.id),
  index("audit_log_tenant_object_time").on(t.tenantId, t.objectType, t.objectId, t.occurredAt),
  uniqueIndex("audit_log_tenant_hash_unique").on(t.tenantId, t.hash),
  uniqueIndex("audit_log_tenant_prev_hash_unique").on(t.tenantId, t.prevHash)
    .where(sql`${t.prevHash} IS NOT NULL`),
  check("audit_log_actor_type_check", sql`${t.actorType} IN ('user', 'system', 'ai')`),
  check("audit_log_user_actor_check", sql`${t.actorType} <> 'user' OR ${t.actorId} IS NOT NULL`),
  check("audit_log_action_check", sql`length(trim(${t.action})) > 0`),
  check("audit_log_object_type_check", sql`length(trim(${t.objectType})) > 0`),
  check("audit_log_source_check", sql`length(trim(${t.source})) > 0`),
  check("audit_log_hash_check", sql`${t.hash} ~ '^[0-9a-f]{64}$'`),
  check("audit_log_prev_hash_check", sql`${t.prevHash} IS NULL OR ${t.prevHash} ~ '^[0-9a-f]{64}$'`),
  check("audit_log_hash_not_self_check", sql`${t.prevHash} IS NULL OR ${t.prevHash} <> ${t.hash}`),
]);

// P1-005 — persist-first event facts and per-handler idempotency evidence.
// Payloads contain closed-catalogue identifiers/minimal data only.
export const platformEvents = pgTable("platform_events", {
  id: text("id").primaryKey(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "restrict" }),
  eventType: text("event_type").$type<EventType>().notNull(),
  objectType: text("object_type"),
  objectId: text("object_id"),
  actorId: uuid("actor_id"),
  payloadJson: jsonb("payload_json").$type<DomainEventPayloads[EventType]>().notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  status: text("status").default("pending").notNull(),
  retryCount: integer("retry_count").default(0).notNull(),
}, (t) => [
  index("platform_events_tenant_time").on(t.tenantId, t.occurredAt),
  index("platform_events_tenant_status").on(t.tenantId, t.status, t.occurredAt),
  check("platform_events_event_type_check", sql`length(trim(${t.eventType})) > 0`),
  check("platform_events_status_check", sql`${t.status} IN ('pending', 'processing', 'retrying', 'processed', 'failed')`),
  check("platform_events_retry_count_check", sql`${t.retryCount} BETWEEN 0 AND 3`),
]);

export const processedEvents = pgTable("processed_events", {
  id: id(),
  handlerName: text("handler_name").notNull(),
  eventId: text("event_id").notNull().references(() => platformEvents.id, { onDelete: "restrict" }),
  processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique("processed_events_handler_event_unique").on(t.handlerName, t.eventId),
  index("processed_events_event").on(t.eventId),
  check("processed_events_handler_name_check", sql`length(trim(${t.handlerName})) > 0`),
]);

// Tenant-scoped notification intent and delivery evidence. Records are never
// deleted through the notification service; only delivery status may advance.
export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  userId: uuid("user_id"),
  recipient: text("recipient").notNull(),
  channel: text("channel").notNull(),
  template: text("template").notNull(),
  locale: text("locale").notNull(),
  variables: jsonb("variables").notNull(),
  priority: text("priority").default("normal").notNull(),
  title: text("title"),
  body: text("body"),
  link: text("link"),
  objectType: text("object_type"),
  objectId: text("object_id"),
  status: text("status").notNull(),
  transmitted: boolean("transmitted").default(false).notNull(),
  providerMessageId: text("provider_message_id"),
  dedupeKey: text("dedupe_key"),
  createdAt: createdAt(),
  readAt: timestamp("read_at", { withTimezone: true }),
}, (t) => [
  index("notifications_tenant_time").on(t.tenantId, t.createdAt),
  index("notifications_user_inbox").on(t.tenantId, t.userId, t.readAt, t.createdAt),
  uniqueIndex("notifications_tenant_dedupe").on(t.tenantId, t.dedupeKey),
  foreignKey({
    name: "notifications_user_tenant_fk",
    columns: [t.userId, t.tenantId],
    foreignColumns: [users.id, users.tenantId],
  }).onDelete("restrict"),
  check("notifications_channel_check", sql`${t.channel} IN ('IN_APP', 'EMAIL', 'SMS', 'PUSH', 'WHATSAPP')`),
  check("notifications_priority_check", sql`${t.priority} IN ('low', 'normal', 'high', 'urgent')`),
  check("notifications_status_check", sql`${t.status} IN ('accepted', 'sent', 'failed')`),
]);

// Missing preference rows mean enabled. Explicit rows are tenant/user/channel
// scoped and cannot reference a user from another workspace.
export const notificationPreferences = pgTable("notification_preferences", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  userId: uuid("user_id").notNull(),
  category: text("category").notNull(),
  channel: text("channel").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
}, (t) => [
  unique("notification_preferences_scope_unique").on(t.tenantId, t.userId, t.category, t.channel),
  foreignKey({
    name: "notification_preferences_user_tenant_fk",
    columns: [t.userId, t.tenantId],
    foreignColumns: [users.id, users.tenantId],
  }).onDelete("restrict"),
  index("notification_preferences_user").on(t.tenantId, t.userId),
  check("notification_preferences_category_check", sql`length(trim(${t.category})) > 0`),
  check("notification_preferences_channel_check", sql`${t.channel} IN ('IN_APP', 'EMAIL', 'SMS', 'PUSH', 'WHATSAPP')`),
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
  systemKey: text("system_key"), // AR | SALES | VAT_OUTPUT | VAT_INPUT | INVENTORY | COGS | BANK | AP | GRNI | OPENING_EQUITY | WAGES_EXPENSE | PAYE_PAYABLE | NSSA_PAYABLE | NET_WAGES_PAYABLE
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

// Immutable canonical inputs and integrity evidence for one generated finance
// report PDF. Reports are rerendered only from this captured source.
export const financeReportSnapshots = pgTable("finance_report_snapshots", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  reportType: text("report_type").notNull(),
  reportVersion: text("report_version").notNull(),
  pdfTemplateVersion: text("pdf_template_version").notNull(),
  brandingVersion: text("branding_version").notNull(),
  parameters: jsonb("parameters").$type<Record<string, string>>().notNull(),
  reportDocument: jsonb("report_document").$type<Record<string, unknown>>().notNull(),
  brandingDocument: jsonb("branding_document").$type<Record<string, unknown>>().notNull(),
  fileName: text("file_name").notNull(),
  mediaType: text("media_type").default("application/pdf").notNull(),
  byteSize: integer("byte_size").notNull(),
  checksum: text("checksum").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  idempotencyFingerprint: text("idempotency_fingerprint").notNull(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("finance_report_snapshot_tenant_idempotency").on(t.tenantId, t.idempotencyKey),
  index("finance_report_snapshot_tenant_time").on(t.tenantId, t.createdAt),
  check("finance_report_snapshot_type_check", sql`${t.reportType} IN ('VAT', 'STATUTORY')`),
  check("finance_report_snapshot_media_check", sql`${t.mediaType} = 'application/pdf'`),
  check("finance_report_snapshot_byte_size_check", sql`${t.byteSize} > 0 AND ${t.byteSize} <= 10000000`),
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
}, (t) => [
  uniqueIndex("payments_tenant_idempotency")
    .on(t.tenantId, t.idempotencyKey)
    .where(sql`${t.idempotencyKey} IS NOT NULL`),
]);

// P2-005: closed financial periods. A CLOSED row locks its month against any
// journal posting (enforced in postJournal and by a DB trigger); corrections
// are posted as offsetting entries in an open period. Reopening is audited
// and restricted to the accountable Owner.
export const accountingPeriods = pgTable("accounting_periods", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  periodMonth: date("period_month").notNull(),
  status: text("status").default("CLOSED").notNull(),
  closedBy: uuid("closed_by").notNull().references(() => users.id),
  closedAt: timestamp("closed_at", { withTimezone: true }).defaultNow().notNull(),
  closedReason: text("closed_reason").notNull(),
  reopenedBy: uuid("reopened_by").references(() => users.id),
  reopenedAt: timestamp("reopened_at", { withTimezone: true }),
  reopenedReason: text("reopened_reason"),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("accounting_periods_tenant_month").on(t.tenantId, t.periodMonth),
  check("accounting_periods_status_check", sql`${t.status} IN ('CLOSED', 'OPEN')`),
  check("accounting_periods_month_check", sql`${t.periodMonth} = date_trunc('month', ${t.periodMonth})::date`),
  check("accounting_periods_reopen_state_check", sql`
    (${t.status} = 'CLOSED' AND ${t.reopenedAt} IS NULL AND ${t.reopenedBy} IS NULL AND ${t.reopenedReason} IS NULL)
    OR (${t.status} = 'OPEN' AND ${t.reopenedAt} IS NOT NULL AND ${t.reopenedBy} IS NOT NULL AND ${t.reopenedReason} IS NOT NULL)
  `),
]);

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
  journalEntryId: uuid("journal_entry_id").notNull().references(() => journalEntries.id, { onDelete: "restrict" }),
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
}, (t) => [
  uniqueIndex("expenses_tenant_idempotency")
    .on(t.tenantId, t.idempotencyKey)
    .where(sql`${t.idempotencyKey} IS NOT NULL`),
]);

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
  uniqueIndex("stock_movements_tenant_idempotency")
    .on(t.tenantId, t.idempotencyKey)
    .where(sql`${t.idempotencyKey} IS NOT NULL`),
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
]).enableRLS();

export const dunningEvents = pgTable("dunning_events", {
  id: id(),
  subscriptionInvoiceId: uuid("subscription_invoice_id").notNull().references(() => subscriptionInvoices.id),
  channel: text("channel").notNull(), // email | sms | whatsapp
  attemptNumber: integer("attempt_number").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// PW-003 — Tenant task centre + event automation. Tasks are operational
// work items (never financial writes); automation rules are an opt-in,
// code-catalogued mapping from domain events to task creation. No rule row =
// disabled. A partial unique index prevents duplicate OPEN automation tasks
// for the same subject.
// ---------------------------------------------------------------------------
export const tenantTasks = pgTable("tenant_tasks", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  title: text("title").notNull(),
  detail: text("detail"),
  status: text("status").default("OPEN").notNull(),
  sourceType: text("source_type").notNull(), // automation | manual
  sourceKey: text("source_key"), // automation rule key
  subjectType: text("subject_type"),
  subjectId: uuid("subject_id"),
  assignedTo: uuid("assigned_to").references(() => users.id),
  createdBy: uuid("created_by").references(() => users.id), // null = system
  closedBy: uuid("closed_by").references(() => users.id),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("tenant_tasks_tenant_status").on(t.tenantId, t.status, t.createdAt),
  uniqueIndex("tenant_tasks_open_automation_dedupe")
    .on(t.tenantId, t.sourceKey, t.subjectId)
    .where(sql`${t.status} = 'OPEN' AND ${t.sourceKey} IS NOT NULL AND ${t.subjectId} IS NOT NULL`),
  check("tenant_tasks_status_check", sql`${t.status} IN ('OPEN', 'DONE', 'DISMISSED')`),
  check("tenant_tasks_source_check", sql`${t.sourceType} IN ('automation', 'manual')`),
  check("tenant_tasks_closed_state_check", sql`
    (${t.status} = 'OPEN' AND ${t.closedAt} IS NULL AND ${t.closedBy} IS NULL)
    OR (${t.status} IN ('DONE', 'DISMISSED') AND ${t.closedAt} IS NOT NULL AND ${t.closedBy} IS NOT NULL)
  `),
]);

export const automationRules = pgTable("automation_rules", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  ruleKey: text("rule_key").notNull(),
  enabled: boolean("enabled").default(false).notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("automation_rules_tenant_key").on(t.tenantId, t.ruleKey),
]);

// ---------------------------------------------------------------------------
// PW-002 — Tenant-configurable approval policies. One optional row per
// (tenant, subject type); no row = no additional rule (behaviour unchanged
// until a tenant opts in). Evaluated by the kernel ApprovalService.
// ---------------------------------------------------------------------------
export const approvalPolicies = pgTable("approval_policies", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  subjectType: text("subject_type").notNull(),
  thresholdAmount: money("threshold_amount").default("0").notNull(), // base currency; 0 = always
  requiredPermission: text("required_permission"),
  requireDistinctActor: boolean("require_distinct_actor").default(false).notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("approval_policies_tenant_subject").on(t.tenantId, t.subjectType),
  check("approval_policies_subject_check", sql`${t.subjectType} IN ('purchase_order', 'payroll_run')`),
  check("approval_policies_threshold_check", sql`${t.thresholdAmount} >= 0`),
]);

// ---------------------------------------------------------------------------
// P1-003 — Durable, tenant-scoped workflow definitions and execution history.
// Financial effects remain domain-owned; these tables record orchestration,
// decisions and actor evidence only.
// ---------------------------------------------------------------------------
export const workflowDefinitions = pgTable("workflow_definitions", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  version: integer("version").notNull(),
  objectType: text("object_type").notNull(),
  stepsJson: jsonb("steps_json").$type<WorkflowStepDefinition[]>().notNull(),
  active: boolean("active").default(true).notNull(),
}, (t) => [
  unique("workflow_definitions_id_tenant_unique").on(t.id, t.tenantId),
  unique("workflow_definitions_tenant_name_version_unique").on(t.tenantId, t.name, t.version),
  index("workflow_definitions_tenant_object_active").on(t.tenantId, t.objectType, t.active),
  check("workflow_definitions_name_check", sql`length(trim(${t.name})) > 0`),
  check("workflow_definitions_version_check", sql`${t.version} >= 1`),
  check("workflow_definitions_object_type_check", sql`length(trim(${t.objectType})) > 0`),
  check("workflow_definitions_steps_check", sql`jsonb_typeof(${t.stepsJson}) = 'array'`),
]);

export const workflowInstances = pgTable("workflow_instances", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  definitionId: uuid("definition_id").notNull(),
  objectType: text("object_type").notNull(),
  objectId: text("object_id").notNull(),
  status: text("status").default("ACTIVE").notNull(),
  currentStep: integer("current_step").default(0).notNull(),
  startedBy: uuid("started_by").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [
  unique("workflow_instances_id_tenant_unique").on(t.id, t.tenantId),
  foreignKey({
    name: "workflow_instances_definition_tenant_fk",
    columns: [t.definitionId, t.tenantId],
    foreignColumns: [workflowDefinitions.id, workflowDefinitions.tenantId],
  }).onDelete("restrict"),
  foreignKey({
    name: "workflow_instances_actor_tenant_fk",
    columns: [t.startedBy, t.tenantId],
    foreignColumns: [users.id, users.tenantId],
  }).onDelete("restrict"),
  index("workflow_instances_tenant_object").on(t.tenantId, t.objectType, t.objectId),
  uniqueIndex("workflow_instances_one_active_object")
    .on(t.tenantId, t.definitionId, t.objectType, t.objectId)
    .where(sql`${t.status} = 'ACTIVE'`),
  check("workflow_instances_object_type_check", sql`length(trim(${t.objectType})) > 0`),
  check("workflow_instances_object_id_check", sql`length(trim(${t.objectId})) > 0`),
  check("workflow_instances_status_check", sql`${t.status} IN ('ACTIVE', 'COMPLETED', 'REJECTED')`),
  check("workflow_instances_current_step_check", sql`${t.currentStep} >= 0`),
  check("workflow_instances_completion_check", sql`
    (${t.status} = 'ACTIVE' AND ${t.completedAt} IS NULL)
    OR (${t.status} IN ('COMPLETED', 'REJECTED') AND ${t.completedAt} IS NOT NULL)
  `),
]);

export const workflowActions = pgTable("workflow_actions", {
  id: id(),
  instanceId: uuid("instance_id").notNull().references(() => workflowInstances.id, { onDelete: "restrict" }),
  step: integer("step").notNull(),
  actorId: uuid("actor_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  comment: text("comment"),
  actedAt: timestamp("acted_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("workflow_actions_instance_step_unique").on(t.instanceId, t.step),
  index("workflow_actions_instance_time").on(t.instanceId, t.actedAt),
  check("workflow_actions_step_check", sql`${t.step} >= 0`),
  check("workflow_actions_action_check", sql`${t.action} IN ('APPROVE', 'REJECT')`),
  check("workflow_actions_comment_check", sql`${t.comment} IS NULL OR length(${t.comment}) <= 1000`),
]);

// ---------------------------------------------------------------------------
// FLAG-001 — Tenant feature flags (build-dark model, Master Build Plan §15).
// A missing row means OFF. Keys are validated against the closed
// FEATURE_CATALOGUE in code; toggles are platform-admin actions and audited.
// ---------------------------------------------------------------------------
export const tenantFeatureFlags = pgTable("tenant_feature_flags", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  featureKey: text("feature_key").notNull(),
  enabled: boolean("enabled").default(false).notNull(),
  note: text("note"),
  updatedBy: uuid("updated_by").references(() => users.id),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("tenant_feature_flags_tenant_key").on(t.tenantId, t.featureKey),
  index("tenant_feature_flags_tenant").on(t.tenantId),
]);

// ---------------------------------------------------------------------------
// P2-009 — Payroll (technical preview until accountant sign-off).
// Employee register has no ledger effect; payroll_runs post one balanced
// journal through postJournal; payslips are immutable snapshots with a
// calculation trace. Corrections are reversal-only (REVERSED status frees the
// month for a corrected run).
// ---------------------------------------------------------------------------

export const employees = pgTable("employees", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  employeeNumber: text("employee_number").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  nationalId: text("national_id"),
  nssaNumber: text("nssa_number"),
  email: text("email"),
  phone: text("phone"),
  currency: currency("currency").notNull(),
  basicSalary: money("basic_salary").notNull(), // monthly
  status: text("status").default("ACTIVE").notNull(),
  startDate: date("start_date"),
  endDate: date("end_date"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("employees_tenant_number").on(t.tenantId, t.employeeNumber),
  index("employees_tenant_status").on(t.tenantId, t.status),
  check("employees_status_check", sql`${t.status} IN ('ACTIVE', 'ENDED')`),
  check("employees_basic_salary_check", sql`${t.basicSalary} >= 0`),
]);

export const payrollRuns = pgTable("payroll_runs", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  periodMonth: date("period_month").notNull(), // first day of month (UTC)
  currency: currency("currency").notNull(),
  status: text("status").default("DRAFT").notNull(),
  employeeCount: integer("employee_count").default(0).notNull(),
  grossTotal: money("gross_total").default("0").notNull(),
  payeTotal: money("paye_total").default("0").notNull(),
  taxLevyTotal: money("tax_levy_total").default("0").notNull(), // AIDS levy
  ssEmployeeTotal: money("ss_employee_total").default("0").notNull(), // NSSA employee
  ssEmployerTotal: money("ss_employer_total").default("0").notNull(), // NSSA employer
  netTotal: money("net_total").default("0").notNull(),
  verificationStatus: text("verification_status").notNull(), // pack status snapshot
  verificationNote: text("verification_note").notNull(),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id),
  reversalJournalEntryId: uuid("reversal_journal_entry_id").references(() => journalEntries.id),
  createdBy: uuid("created_by").references(() => users.id),
  postedBy: uuid("posted_by").references(() => users.id),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  reversedBy: uuid("reversed_by").references(() => users.id),
  reversedAt: timestamp("reversed_at", { withTimezone: true }),
  reversedReason: text("reversed_reason"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // One live (draft or posted) run per tenant × month × currency; a REVERSED
  // run frees the slot for a corrected re-run.
  uniqueIndex("payroll_runs_tenant_month_currency_live")
    .on(t.tenantId, t.periodMonth, t.currency)
    .where(sql`${t.status} IN ('DRAFT', 'POSTED')`),
  index("payroll_runs_tenant_status").on(t.tenantId, t.status),
  check("payroll_runs_status_check", sql`${t.status} IN ('DRAFT', 'POSTED', 'REVERSED')`),
  check("payroll_runs_month_check", sql`${t.periodMonth} = date_trunc('month', ${t.periodMonth})::date`),
  check("payroll_runs_posted_state_check", sql`
    (${t.status} = 'DRAFT' AND ${t.journalEntryId} IS NULL)
    OR (${t.status} = 'POSTED' AND ${t.journalEntryId} IS NOT NULL AND ${t.reversalJournalEntryId} IS NULL)
    OR (${t.status} = 'REVERSED' AND ${t.journalEntryId} IS NOT NULL AND ${t.reversalJournalEntryId} IS NOT NULL)
  `),
]);

export const payslips = pgTable("payslips", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  payrollRunId: uuid("payroll_run_id").notNull().references(() => payrollRuns.id),
  employeeId: uuid("employee_id").notNull().references(() => employees.id),
  // Snapshots — a payslip must stay explainable even if the employee changes.
  employeeNumber: text("employee_number").notNull(),
  employeeName: text("employee_name").notNull(),
  currency: currency("currency").notNull(),
  basicSalary: money("basic_salary").notNull(),
  allowances: money("allowances").default("0").notNull(), // taxable, per-run adjustment
  grossPay: money("gross_pay").notNull(),
  ssEmployee: money("ss_employee").notNull(),
  ssEmployer: money("ss_employer").notNull(),
  taxablePay: money("taxable_pay").notNull(),
  paye: money("paye").notNull(),
  taxLevy: money("tax_levy").notNull(),
  netPay: money("net_pay").notNull(),
  calculationTrace: jsonb("calculation_trace").notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("payslips_run_employee").on(t.payrollRunId, t.employeeId),
  index("payslips_tenant_employee").on(t.tenantId, t.employeeId),
  check("payslips_amounts_check", sql`
    ${t.grossPay} >= 0 AND ${t.ssEmployee} >= 0 AND ${t.ssEmployer} >= 0
    AND ${t.taxablePay} >= 0 AND ${t.paye} >= 0 AND ${t.taxLevy} >= 0 AND ${t.netPay} >= 0
  `),
]);

// ---------------------------------------------------------------------------
// PD-001 — Documents workspace (build-dark behind `documents.workspace`).
// Folders organise documents; document rows carry classification and status;
// binary content lives in immutable version rows (new upload = new version,
// never an update) protected at rest with the capture-storage envelope.
// Empty tables change nothing — the whole surface fails closed until a
// platform admin enables the flag per tenant.
// ---------------------------------------------------------------------------
export const documentFolders = pgTable("document_folders", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  parentId: uuid("parent_id"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  foreignKey({ columns: [t.parentId], foreignColumns: [t.id], name: "document_folders_parent_fk" }),
  uniqueIndex("document_folders_root_name")
    .on(t.tenantId, t.name).where(sql`${t.parentId} IS NULL`),
  uniqueIndex("document_folders_child_name")
    .on(t.tenantId, t.parentId, t.name).where(sql`${t.parentId} IS NOT NULL`),
  index("document_folders_tenant").on(t.tenantId),
  check("document_folders_name_check", sql`length(trim(${t.name})) BETWEEN 1 AND 120`),
]);

export const workspaceDocuments = pgTable("workspace_documents", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  folderId: uuid("folder_id").references(() => documentFolders.id),
  title: text("title").notNull(),
  classification: text("classification").notNull(),
  status: text("status").default("ACTIVE").notNull(),
  currentVersion: integer("current_version").default(1).notNull(),
  retentionUntil: date("retention_until"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique("workspace_documents_id_tenant_unique").on(t.id, t.tenantId),
  index("workspace_documents_tenant_status").on(t.tenantId, t.status, t.createdAt),
  index("workspace_documents_tenant_folder").on(t.tenantId, t.folderId),
  check("workspace_documents_classification_check", sql`${t.classification} IN
    ('POLICY', 'CONTRACT', 'CERTIFICATE', 'LICENCE', 'REPORT', 'CORRESPONDENCE', 'OTHER')`),
  check("workspace_documents_status_check", sql`${t.status} IN ('ACTIVE', 'ARCHIVED')`),
  check("workspace_documents_version_check", sql`${t.currentVersion} >= 1`),
  check("workspace_documents_title_check", sql`length(trim(${t.title})) BETWEEN 1 AND 200`),
]);

export const workspaceDocumentVersions = pgTable("workspace_document_versions", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  documentId: uuid("document_id").notNull().references(() => workspaceDocuments.id),
  version: integer("version").notNull(),
  fileName: text("file_name").notNull(),
  mediaType: text("media_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  checksum: text("checksum").notNull(),
  dataUrl: text("data_url").notNull(), // protected at rest (capture-storage envelope)
  uploadedBy: uuid("uploaded_by").notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("workspace_document_versions_doc_version").on(t.documentId, t.version),
  unique("workspace_document_versions_doc_version_tenant_unique")
    .on(t.documentId, t.version, t.tenantId),
  index("workspace_document_versions_tenant_doc").on(t.tenantId, t.documentId),
  check("workspace_document_versions_version_check", sql`${t.version} >= 1`),
  check("workspace_document_versions_size_check", sql`${t.byteSize} > 0 AND ${t.byteSize} <= 1500000`),
]);

// ---------------------------------------------------------------------------
// PV-001 — Verification evidence vault. Evidence bytes live in the PD-001
// documents workspace; rows here register typed, expiring references with an
// append-only renewal chain (ACTIVE → SUPERSEDED | WITHDRAWN, never edited).
// Behind the `verify.centre` flag. Review/badges arrive with PV-002.
// ---------------------------------------------------------------------------
export const VERIFICATION_EVIDENCE_TYPES = [
  "INCORPORATION_CERTIFICATE", "TAX_CLEARANCE", "CR14_DIRECTORS",
  "PROOF_OF_ADDRESS", "DIRECTOR_ID", "VAT_REGISTRATION",
  "LICENCE", "INSURANCE", "OTHER",
] as const;

export const verificationEvidence = pgTable("verification_evidence", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  documentId: uuid("document_id").notNull().references(() => workspaceDocuments.id),
  documentVersion: integer("document_version").notNull(),
  evidenceType: text("evidence_type").notNull(),
  issuer: text("issuer").notNull(),
  referenceNumber: text("reference_number"),
  notes: text("notes"),
  validFrom: date("valid_from"),
  expiresAt: date("expires_at"),
  status: text("status").default("ACTIVE").notNull(),
  supersededBy: uuid("superseded_by"),
  withdrawnReason: text("withdrawn_reason"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  foreignKey({ columns: [t.supersededBy], foreignColumns: [t.id], name: "verification_evidence_superseded_by_verification_evidence_id_fk" }),
  unique("verification_evidence_id_tenant_unique").on(t.id, t.tenantId),
  uniqueIndex("verification_evidence_singleton_active")
    .on(t.tenantId, t.evidenceType)
    .where(sql`${t.status} = 'ACTIVE' AND ${t.evidenceType} IN
      ('INCORPORATION_CERTIFICATE', 'TAX_CLEARANCE', 'CR14_DIRECTORS',
       'PROOF_OF_ADDRESS', 'VAT_REGISTRATION')`),
  index("verification_evidence_tenant_status").on(t.tenantId, t.status, t.createdAt),
  index("verification_evidence_tenant_expiry").on(t.tenantId, t.expiresAt),
  check("verification_evidence_type_check", sql`${t.evidenceType} IN
    ('INCORPORATION_CERTIFICATE', 'TAX_CLEARANCE', 'CR14_DIRECTORS',
     'PROOF_OF_ADDRESS', 'DIRECTOR_ID', 'VAT_REGISTRATION',
     'LICENCE', 'INSURANCE', 'OTHER')`),
  check("verification_evidence_status_check", sql`${t.status} IN ('ACTIVE', 'SUPERSEDED', 'WITHDRAWN')`),
  check("verification_evidence_version_check", sql`${t.documentVersion} >= 1`),
  check("verification_evidence_issuer_check", sql`length(trim(${t.issuer})) BETWEEN 1 AND 160`),
  check("verification_evidence_reference_check", sql`${t.referenceNumber} IS NULL OR length(${t.referenceNumber}) <= 80`),
  check("verification_evidence_notes_check", sql`${t.notes} IS NULL OR length(${t.notes}) <= 500`),
  check("verification_evidence_validity_check", sql`${t.validFrom} IS NULL OR ${t.expiresAt} IS NULL OR ${t.expiresAt} > ${t.validFrom}`),
  check("verification_evidence_superseded_check", sql`(${t.status} = 'SUPERSEDED') = (${t.supersededBy} IS NOT NULL)`),
  check("verification_evidence_withdrawn_check", sql`(${t.status} = 'WITHDRAWN') = (${t.withdrawnReason} IS NOT NULL)`),
]);

// ---------------------------------------------------------------------------
// PV-002 — frozen verification submissions, platform review decisions and
// VERIFIED badge issue records. Snapshot/decision/badge tables are protected
// by append-only triggers in migration 0047; badge revocation is a later
// decision plus APPROVED → REVOKED request transition, never a badge rewrite.
// ---------------------------------------------------------------------------
export const VERIFICATION_REQUEST_STATUSES = [
  "DRAFT", "SUBMITTED", "IN_REVIEW", "APPROVED", "REJECTED", "REVOKED",
] as const;

export const VERIFICATION_DECISIONS = ["APPROVE", "REJECT", "REVOKE"] as const;

export const verificationRequests = pgTable("verification_requests", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  status: text("status").default("DRAFT").notNull(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  submittedBy: uuid("submitted_by").references(() => users.id),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  inReviewBy: uuid("in_review_by").references(() => users.id),
  inReviewAt: timestamp("in_review_at", { withTimezone: true }),
  sodActorIds: jsonb("sod_actor_ids").$type<string[]>().default([]).notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique("verification_requests_id_tenant_unique").on(t.id, t.tenantId),
  uniqueIndex("verification_requests_one_open_per_tenant")
    .on(t.tenantId).where(sql`${t.status} IN ('DRAFT', 'SUBMITTED', 'IN_REVIEW')`),
  index("verification_requests_tenant_time").on(t.tenantId, t.createdAt),
  index("verification_requests_queue")
    .on(t.status, t.submittedAt).where(sql`${t.status} IN ('SUBMITTED', 'IN_REVIEW')`),
  check("verification_requests_status_check", sql`${t.status} IN
    ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'REVOKED')`),
  check("verification_requests_sod_actors_check", sql`jsonb_typeof(${t.sodActorIds}) = 'array'`),
  check("verification_requests_lifecycle_check", sql`
    (${t.status} = 'DRAFT'
      AND ${t.submittedBy} IS NULL AND ${t.submittedAt} IS NULL
      AND ${t.inReviewBy} IS NULL AND ${t.inReviewAt} IS NULL)
    OR (${t.status} = 'SUBMITTED'
      AND ${t.submittedBy} IS NOT NULL AND ${t.submittedAt} IS NOT NULL
      AND ${t.inReviewBy} IS NULL AND ${t.inReviewAt} IS NULL)
    OR (${t.status} IN ('IN_REVIEW', 'APPROVED', 'REJECTED', 'REVOKED')
      AND ${t.submittedBy} IS NOT NULL AND ${t.submittedAt} IS NOT NULL
      AND ${t.inReviewBy} IS NOT NULL AND ${t.inReviewAt} IS NOT NULL)
  `),
]);

export const verificationRequestEvidenceSnapshots = pgTable("verification_request_evidence_snapshots", {
  id: id(),
  requestId: uuid("request_id").notNull(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  evidenceId: uuid("evidence_id").notNull(),
  documentId: uuid("document_id").notNull(),
  documentVersion: integer("document_version").notNull(),
  evidenceType: text("evidence_type").notNull(),
  issuer: text("issuer").notNull(),
  referenceNumber: text("reference_number"),
  validFrom: date("valid_from"),
  expiresAt: date("expires_at"),
  fileName: text("file_name").notNull(),
  mediaType: text("media_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  checksum: text("checksum").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  foreignKey({
    name: "verification_snapshot_request_tenant_fk",
    columns: [t.requestId, t.tenantId],
    foreignColumns: [verificationRequests.id, verificationRequests.tenantId],
  }).onDelete("restrict"),
  foreignKey({
    name: "verification_snapshot_evidence_tenant_fk",
    columns: [t.evidenceId, t.tenantId],
    foreignColumns: [verificationEvidence.id, verificationEvidence.tenantId],
  }).onDelete("restrict"),
  foreignKey({
    name: "verification_snapshot_document_tenant_fk",
    columns: [t.documentId, t.tenantId],
    foreignColumns: [workspaceDocuments.id, workspaceDocuments.tenantId],
  }).onDelete("restrict"),
  foreignKey({
    name: "verification_snapshot_version_tenant_fk",
    columns: [t.documentId, t.documentVersion, t.tenantId],
    foreignColumns: [workspaceDocumentVersions.documentId, workspaceDocumentVersions.version, workspaceDocumentVersions.tenantId],
  }).onDelete("restrict"),
  unique("verification_snapshot_request_evidence_unique").on(t.requestId, t.evidenceId),
  index("verification_snapshot_tenant_request").on(t.tenantId, t.requestId, t.capturedAt),
  check("verification_snapshot_version_check", sql`${t.documentVersion} >= 1`),
  check("verification_snapshot_type_check", sql`${t.evidenceType} IN
    ('INCORPORATION_CERTIFICATE', 'TAX_CLEARANCE', 'CR14_DIRECTORS',
     'PROOF_OF_ADDRESS', 'DIRECTOR_ID', 'VAT_REGISTRATION',
     'LICENCE', 'INSURANCE', 'OTHER')`),
  check("verification_snapshot_issuer_check", sql`length(trim(${t.issuer})) BETWEEN 1 AND 160`),
  check("verification_snapshot_reference_check", sql`${t.referenceNumber} IS NULL OR length(${t.referenceNumber}) <= 80`),
  check("verification_snapshot_validity_check", sql`${t.validFrom} IS NULL OR ${t.expiresAt} IS NULL OR ${t.expiresAt} > ${t.validFrom}`),
  check("verification_snapshot_size_check", sql`${t.byteSize} > 0 AND ${t.byteSize} <= 1500000`),
]);

export const verificationDecisions = pgTable("verification_decisions", {
  id: id(),
  requestId: uuid("request_id").notNull(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  decision: text("decision").notNull(),
  reason: text("reason").notNull(),
  decidedBy: uuid("decided_by").notNull().references(() => users.id),
  sodEvaluation: jsonb("sod_evaluation").$type<Record<string, unknown>>().notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  foreignKey({
    name: "verification_decisions_request_tenant_fk",
    columns: [t.requestId, t.tenantId],
    foreignColumns: [verificationRequests.id, verificationRequests.tenantId],
  }).onDelete("restrict"),
  uniqueIndex("verification_decisions_terminal_once")
    .on(t.requestId).where(sql`${t.decision} IN ('APPROVE', 'REJECT')`),
  uniqueIndex("verification_decisions_revoke_once")
    .on(t.requestId).where(sql`${t.decision} = 'REVOKE'`),
  index("verification_decisions_tenant_request").on(t.tenantId, t.requestId, t.decidedAt),
  check("verification_decisions_decision_check", sql`${t.decision} IN ('APPROVE', 'REJECT', 'REVOKE')`),
  check("verification_decisions_reason_check", sql`length(trim(${t.reason})) BETWEEN 3 AND 1000`),
  check("verification_decisions_sod_check", sql`jsonb_typeof(${t.sodEvaluation}) = 'object'`),
]);

export const verificationBadges = pgTable("verification_badges", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  requestId: uuid("request_id").notNull(),
  approvalDecisionId: uuid("approval_decision_id").notNull().references(() => verificationDecisions.id, { onDelete: "restrict" }),
  level: text("level").default("VERIFIED").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: date("expires_at").notNull(),
  issuedBy: uuid("issued_by").notNull().references(() => users.id),
  evidenceSnapshotRef: uuid("evidence_snapshot_ref").notNull(),
  createdAt: createdAt(),
}, (t) => [
  foreignKey({
    name: "verification_badges_request_tenant_fk",
    columns: [t.requestId, t.tenantId],
    foreignColumns: [verificationRequests.id, verificationRequests.tenantId],
  }).onDelete("restrict"),
  foreignKey({
    name: "verification_badges_snapshot_ref_fk",
    columns: [t.evidenceSnapshotRef, t.tenantId],
    foreignColumns: [verificationRequests.id, verificationRequests.tenantId],
  }).onDelete("restrict"),
  unique("verification_badges_request_unique").on(t.requestId),
  unique("verification_badges_approval_unique").on(t.approvalDecisionId),
  index("verification_badges_tenant_time").on(t.tenantId, t.issuedAt),
  check("verification_badges_level_check", sql`${t.level} = 'VERIFIED'`),
  check("verification_badges_snapshot_ref_check", sql`${t.evidenceSnapshotRef} = ${t.requestId}`),
  check("verification_badges_expiry_check", sql`${t.expiresAt} > ${t.issuedAt}::date`),
]);

// ---------------------------------------------------------------------------
// PB-001 — Black Book registry (versioned, governed platform content).
// GLOBAL reference data owned by platform staff — deliberately NO tenant_id.
// Tenant reads are gated by the `blackbook.directory` feature flag; the only
// write path is the platform import (step-up protected, audited to
// platform_audit_logs). Version rows are immutable history; a failed import
// rolls back atomically and leaves the registry unchanged.
// ---------------------------------------------------------------------------
export const blackbookImportRuns = pgTable("blackbook_import_runs", {
  id: id(),
  countryCode: text("country_code").notNull(),
  datasetRevision: text("dataset_revision").notNull(),
  importedBy: uuid("imported_by").notNull().references(() => users.id),
  recordCount: integer("record_count").notNull(),
  createdCount: integer("created_count").notNull(),
  updatedCount: integer("updated_count").notNull(),
  unchangedCount: integer("unchanged_count").notNull(),
  createdAt: createdAt(),
}, (t) => [
  index("blackbook_import_runs_country").on(t.countryCode, t.createdAt),
  check("blackbook_import_runs_revision_check", sql`length(trim(${t.datasetRevision})) BETWEEN 1 AND 200`),
  check("blackbook_import_runs_counts_check", sql`${t.recordCount} >= 0 AND ${t.createdCount} >= 0 AND ${t.updatedCount} >= 0 AND ${t.unchangedCount} >= 0`),
]);

export const blackbookEntries = pgTable("blackbook_entries", {
  id: id(),
  countryCode: text("country_code").notNull(),
  entryKey: text("entry_key").notNull(),
  category: text("category").notNull(),
  name: text("name").notNull(),
  payload: jsonb("payload").notNull(),
  verified: boolean("verified").notNull(),
  sources: jsonb("sources").notNull(),
  lastReviewed: date("last_reviewed").notNull(),
  status: text("status").default("ACTIVE").notNull(),
  currentVersion: integer("current_version").default(1).notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("blackbook_entries_country_key").on(t.countryCode, t.entryKey),
  index("blackbook_entries_country_category").on(t.countryCode, t.category, t.status),
  check("blackbook_entries_category_check", sql`${t.category} IN
    ('government_organisation', 'regulator', 'local_authority', 'utility',
     'tender_portal', 'business_association', 'licence_type', 'compliance_event', 'service')`),
  check("blackbook_entries_status_check", sql`${t.status} IN ('ACTIVE', 'RETIRED')`),
  check("blackbook_entries_version_check", sql`${t.currentVersion} >= 1`),
  check("blackbook_entries_key_check", sql`${t.entryKey} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
]);

// PD-002 — document approvals (second-person rule enforced by DB CHECK).
export const documentApprovals = pgTable("document_approvals", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  documentId: uuid("document_id").notNull().references(() => workspaceDocuments.id),
  version: integer("version").notNull(),
  note: text("note"),
  status: text("status").default("PENDING").notNull(),
  requestedBy: uuid("requested_by").notNull().references(() => users.id),
  decidedBy: uuid("decided_by").references(() => users.id),
  decisionNote: text("decision_note"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("document_approvals_one_pending").on(t.documentId).where(sql`${t.status} = 'PENDING'`),
  index("document_approvals_tenant_status").on(t.tenantId, t.status, t.createdAt),
  check("document_approvals_status_check", sql`${t.status} IN ('PENDING', 'APPROVED', 'REJECTED')`),
  check("document_approvals_version_check", sql`${t.version} >= 1`),
  check("document_approvals_sod_check", sql`${t.decidedBy} IS NULL OR ${t.decidedBy} <> ${t.requestedBy}`),
  check("document_approvals_decided_check", sql`(${t.status} = 'PENDING' AND ${t.decidedBy} IS NULL AND ${t.decidedAt} IS NULL) OR (${t.status} <> 'PENDING' AND ${t.decidedBy} IS NOT NULL AND ${t.decidedAt} IS NOT NULL)`),
]);

// ---------------------------------------------------------------------------
// PM-001/PM-002 — Migration Hub: project-grouped staged migrations over the
// existing import framework, with commit/rollback tracking, an opening
// trial-balance journal step and an AR/AP open-item register the accountant
// reconciles and signs off.
// ---------------------------------------------------------------------------
export const migrationProjects = pgTable("migration_projects", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  sourceSystem: text("source_system").notNull(),
  status: text("status").default("OPEN").notNull(),
  signOff: jsonb("sign_off"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("migration_projects_tenant").on(t.tenantId, t.createdAt),
  check("migration_projects_status_check", sql`${t.status} IN ('OPEN', 'CLOSED')`),
  check("migration_projects_name_check", sql`length(trim(${t.name})) BETWEEN 1 AND 120`),
  check("migration_projects_source_check", sql`length(trim(${t.sourceSystem})) BETWEEN 1 AND 120`),
]);

export const migrationSteps = pgTable("migration_steps", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  projectId: uuid("project_id").notNull().references(() => migrationProjects.id),
  kind: text("kind").notNull(),
  status: text("status").default("STAGED").notNull(),
  importBatchId: uuid("import_batch_id").references(() => importBatches.id),
  journalEntryId: uuid("journal_entry_id"),
  reversalJournalEntryId: uuid("reversal_journal_entry_id"),
  summary: jsonb("summary").default({}).notNull(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("migration_steps_project").on(t.projectId, t.createdAt),
  index("migration_steps_tenant").on(t.tenantId),
  check("migration_steps_kind_check", sql`${t.kind} IN
    ('contacts', 'products', 'opening_stock', 'opening_trial_balance', 'open_invoices', 'open_bills')`),
  check("migration_steps_status_check", sql`${t.status} IN ('STAGED', 'COMMITTED', 'ROLLED_BACK', 'DISCARDED')`),
]);

export const migrationOpenItems = pgTable("migration_open_items", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  projectId: uuid("project_id").notNull().references(() => migrationProjects.id),
  stepId: uuid("step_id").notNull().references(() => migrationSteps.id),
  side: text("side").notNull(),
  contactName: text("contact_name").notNull(),
  reference: text("reference").notNull(),
  issueDate: date("issue_date"),
  dueDate: date("due_date"),
  currency: text("currency").notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  balance: numeric("balance", { precision: 18, scale: 2 }).notNull(),
  matchedContactId: uuid("matched_contact_id"),
  createdAt: createdAt(),
}, (t) => [
  index("migration_open_items_project_side").on(t.projectId, t.side),
  index("migration_open_items_tenant").on(t.tenantId),
  check("migration_open_items_side_check", sql`${t.side} IN ('AR', 'AP')`),
  check("migration_open_items_amount_check", sql`${t.amount} >= 0 AND ${t.balance} >= 0 AND ${t.balance} <= ${t.amount}`),
]);

// ---------------------------------------------------------------------------
// P10-001 — Business Network profile over the canonical Company (tenant).
// Owner-controlled; nothing public by default. Publishing freezes an explicit
// snapshot and the directory reads only public/published snapshots.
// ---------------------------------------------------------------------------
export const businessProfiles = pgTable("business_profiles", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  companyId: uuid("company_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  tagline: text("tagline"),
  description: text("description"),
  industryPrimary: text("industry_primary"),
  industrySecondaryJson: jsonb("industry_secondary_json").$type<string[]>().default([]).notNull(),
  categories: jsonb("categories").default([]).notNull(),
  country: text("country").default("ZW").notNull(),
  region: text("region"),
  city: text("city"),
  addressJson: jsonb("address_json").$type<Record<string, unknown>>(),
  phone: text("phone"),
  emailPublic: text("email_public"),
  countryCode: text("country_code").default("ZW").notNull(),
  website: text("website"),
  logoDocumentId: uuid("logo_document_id"),
  coverDocumentId: uuid("cover_document_id"),
  foundedYear: integer("founded_year"),
  employeeBand: text("employee_band"),
  visibility: text("visibility").default("public").notNull(),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  showContact: boolean("show_contact").default(false).notNull(),
  acceptEnquiries: boolean("accept_enquiries").default(false).notNull(),
  status: text("status").$type<"draft" | "pending_review" | "published" | "suspended">().default("draft").notNull(),
  publishedSnapshot: jsonb("published_snapshot"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  publishedBy: uuid("published_by").references(() => users.id),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("business_profiles_tenant").on(t.tenantId),
  uniqueIndex("business_profiles_slug_unique").on(t.slug),
  uniqueIndex("business_profiles_tenant_company_unique").on(t.tenantId, t.companyId),
  foreignKey({
    name: "business_profiles_logo_document_tenant_fk",
    columns: [t.logoDocumentId, t.tenantId],
    foreignColumns: [workspaceDocuments.id, workspaceDocuments.tenantId],
  }).onDelete("restrict"),
  foreignKey({
    name: "business_profiles_cover_document_tenant_fk",
    columns: [t.coverDocumentId, t.tenantId],
    foreignColumns: [workspaceDocuments.id, workspaceDocuments.tenantId],
  }).onDelete("restrict"),
  index("business_profiles_status_visibility_country").on(t.status, t.visibility, t.country),
  index("business_profiles_status_country").on(t.status, t.countryCode),
  check("business_profiles_company_tenant_check", sql`${t.companyId} = ${t.tenantId}`),
  check("business_profiles_status_check", sql`${t.status} IN ('draft', 'pending_review', 'published', 'suspended')`),
  check("business_profiles_visibility_check", sql`${t.visibility} IN ('public', 'network', 'hidden')`),
  check("business_profiles_slug_check", sql`${t.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND length(${t.slug}) BETWEEN 3 AND 120`),
  check("business_profiles_canonical_name_check", sql`length(trim(${t.name})) BETWEEN 1 AND 120`),
  check("business_profiles_name_check", sql`length(trim(${t.displayName})) BETWEEN 1 AND 120`),
  check("business_profiles_tagline_check", sql`${t.tagline} IS NULL OR length(${t.tagline}) <= 140`),
  check("business_profiles_description_check", sql`${t.description} IS NULL OR length(${t.description}) <= 5000`),
  check("business_profiles_country_check", sql`${t.country} ~ '^[A-Z]{2}$'`),
  check("business_profiles_founded_year_check", sql`${t.foundedYear} IS NULL OR ${t.foundedYear} BETWEEN 1000 AND 9999`),
  check("business_profiles_employee_band_check", sql`${t.employeeBand} IS NULL OR ${t.employeeBand} IN ('1-9', '10-49', '50-249', '250-999', '1000+')`),
  check("business_profiles_snapshot_check", sql`(${t.status} = 'published' AND ${t.publishedSnapshot} IS NOT NULL AND ${t.publishedAt} IS NOT NULL) OR (${t.status} <> 'published' AND ${t.publishedSnapshot} IS NULL)`),
]);

export const profileCapabilities = pgTable("profile_capabilities", {
  id: id(),
  profileId: uuid("profile_id").notNull().references(() => businessProfiles.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  name: text("name").notNull(),
}, (t) => [
  unique("profile_capabilities_profile_category_name_unique").on(t.profileId, t.category, t.name),
  index("profile_capabilities_profile").on(t.profileId),
  check("profile_capabilities_category_check", sql`length(trim(${t.category})) BETWEEN 1 AND 80`),
  check("profile_capabilities_name_check", sql`length(trim(${t.name})) BETWEEN 1 AND 120`),
]);

export const profileViews = pgTable("profile_views", {
  id: id(),
  profileId: uuid("profile_id").notNull().references(() => businessProfiles.id, { onDelete: "cascade" }),
  viewerTenantId: uuid("viewer_tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  viewedAt: timestamp("viewed_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("profile_views_profile_time").on(t.profileId, t.viewedAt),
  index("profile_views_viewer_tenant_time").on(t.viewerTenantId, t.viewedAt),
]);

// PN-003 — consent-first directory enquiries (explicit conversion to CRM).
export const directoryEnquiries = pgTable("directory_enquiries", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  profileId: uuid("profile_id").notNull().references(() => businessProfiles.id),
  fromTenantId: uuid("from_tenant_id").notNull().references(() => tenants.id),
  fromUserId: uuid("from_user_id").notNull().references(() => users.id),
  senderBusiness: text("sender_business").notNull(),
  replyEmail: text("reply_email"),
  message: text("message").notNull(),
  status: text("status").default("NEW").notNull(),
  contactId: uuid("contact_id").references(() => contacts.id),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("directory_enquiries_recipient").on(t.tenantId, t.status, t.createdAt),
  index("directory_enquiries_sender_day").on(t.fromTenantId, t.createdAt),
  check("directory_enquiries_status_check", sql`${t.status} IN ('NEW', 'CONVERTED', 'DISMISSED')`),
  check("directory_enquiries_message_check", sql`length(trim(${t.message})) BETWEEN 5 AND 2000`),
  check("directory_enquiries_no_self_check", sql`${t.tenantId} <> ${t.fromTenantId}`),
]);

export const blackbookEntryVersions = pgTable("blackbook_entry_versions", {
  id: id(),
  entryId: uuid("entry_id").notNull().references(() => blackbookEntries.id),
  version: integer("version").notNull(),
  payload: jsonb("payload").notNull(),
  verified: boolean("verified").notNull(),
  sources: jsonb("sources").notNull(),
  lastReviewed: date("last_reviewed").notNull(),
  importRunId: uuid("import_run_id").notNull().references(() => blackbookImportRuns.id),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("blackbook_entry_versions_entry_version").on(t.entryId, t.version),
  index("blackbook_entry_versions_run").on(t.importRunId),
  check("blackbook_entry_versions_version_check", sql`${t.version} >= 1`),
]);
