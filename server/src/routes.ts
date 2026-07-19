// ============================================================================
// API ROUTES — every business endpoint is tenant-scoped via the auth token;
// every write is permission-checked and audited; suspended tenants pass
// through the lifecycle gate (read-only + billing + export).
// ============================================================================
import { Router, Response, text as expressText } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, eq, desc, isNull, sql } from "drizzle-orm";
import {
  db, schema, AppError, badRequest, notFound, conflict, forbidden, audit, nextDocNumber,
  assertIdempotencyFingerprint, payloadFingerprint, requireIdempotencyKey,
} from "./lib.js";
import {
  AuthedRequest, authenticate, lifecycleGate, requireAnyPermission, requirePermission,
  requirePlatformPermission, tenantId, signupTenant, login, changePassword,
  requireCompletedPasswordChange, requireTenantOwner, revokeSession, createTenantUser, setTenantUserStatus,
  issueAuthenticatedSession, renewSession, setRefreshCookie, clearRefreshCookie, readRefreshCookie,
} from "./auth.js";
import { assertStepUpProof, performStepUp, requireStepUp } from "./auth-step-up.js";
import {
  beginMfaEnrollment, completePasswordReset, disableMfa, mfaStatus,
  replaceMfaRecoveryCodes, requestPasswordReset, verifyMfaEnrollment, verifyMfaLogin,
} from "./auth-security.js";
import {
  createPlatformStaff, issuePlatformStaffTemporaryPassword, listPlatformRoles,
  listPlatformStaff, updatePlatformStaff,
} from "./platform-staff.js";
import { createDraftInvoice, issueInvoice, recordPayment, updateDraftInvoice, voidInvoice } from "./invoicing.js";
import { adjustStock, recordOpeningStock } from "./inventory.js";
import { ensureBankLedgerAccount, postJournal } from "./accounting.js";
import {
  closeAccountingPeriod, listAccountingPeriods, periodMonthSchema, periodReasonSchema,
  reopenAccountingPeriod,
} from "./accounting-periods.js";
import {
  createEmployee, createPayrollRun, deleteDraftRun, employeeInputSchema, employeeUpdateSchema,
  getPayrollRun, listEmployees, listPayrollRuns, payrollConfigView, payslipAdjustmentSchema,
  postPayrollRun, reversePayrollRun, reverseReasonSchema, updateDraftPayslip, updateEmployee,
} from "./payroll.js";
import {
  enabledFeaturesFor, featureNoteSchema, listTenantFeatures, requireFeature, setTenantFeature,
} from "./feature-flags.js";
import {
  approvalPolicyInputSchema, approvalPolicySubjectSchema,
  listApprovalPolicies, removeApprovalPolicy, setApprovalPolicy,
} from "./approval-policies.js";
import {
  automationRuleKeySchema, closeTaskSchema, createManualTask, closeTask,
  listAutomationRules, listTasks, manualTaskSchema, setAutomationRule,
} from "./tasks.js";
import {
  addDocumentVersion, addVersionSchema, createDocument, createDocumentSchema,
  createFolder, documentStatusFilterSchema, folderSchema, getDocument,
  listDocuments, listFolders, resolveVersionId, setDocumentStatus, versionQuerySchema,
  approvalDecisionSchema, approvalRequestSchema, decideApproval, listApprovals,
  requestApproval, retentionSchema, setRetention,
} from "./document-workspace.js";
import {
  getEntry as getBlackbookEntry, importDataset as importBlackbookDataset,
  importRequestSchema as blackbookImportRequestSchema,
  listEntries as listBlackbookEntries, listEntriesQuerySchema as listBlackbookEntriesQuerySchema,
  listImportRuns as listBlackbookImportRuns,
} from "./blackbook.js";
import {
  addEvidence, addEvidenceSchema, evidenceStatusFilterSchema, getEvidence,
  listEvidence, renewEvidence, renewEvidenceSchema, withdrawEvidence,
  withdrawEvidenceSchema,
} from "./verification-vault.js";
import {
  createVerificationDraft, decideVerificationRequest, getPlatformVerificationEvidenceContent,
  getPlatformVerificationRequest, getVerificationStatus, listVerificationQueue,
  revokeVerificationBadge, startVerificationReview, submitVerificationRequest,
  verificationDecisionSchema, verificationQueueStatusSchema, verificationRevocationSchema,
} from "./verification-workflow.js";
import {
  directoryQuerySchema, enquirySchema, getDirectoryProfile, getMyProfile,
  listEnquiries, profileInputSchema, publishProfile, resolveEnquiry, saveProfile,
  searchDirectory, sendEnquiry, unpublishProfile,
} from "./business-profile.js";
import {
  closeProject as closeMigrationProject, commitStep as commitMigrationStep,
  commitStepSchema as migrationCommitSchema, createProject as createMigrationProject,
  discardStep as discardMigrationStep,
  createProjectSchema as migrationProjectSchema, getProject as getMigrationProject,
  listProjects as listMigrationProjects, previewStep as previewMigrationStep,
  previewStepSchema as migrationPreviewSchema, rollbackStep as rollbackMigrationStep,
  signOffProject as signOffMigrationProject, signOffSchema as migrationSignOffSchema,
  stepKindSchema as migrationStepKindSchema,
} from "./migration-hub.js";
import { projectReconciliation } from "./migration-accounting.js";
import {
  trialBalance, profitAndLoss, balanceSheet, agedReceivables, dashboard,
  inventoryValuationReconciliation,
} from "./reports.js";
import { runBillingCycle, markSubscriptionInvoicePaid, collectUsageSummary, getArrearsStatus } from "./billing.js";
import { businessSummaryQuerySchema, getBusinessSummary } from "./ai/business-summary.js";
import { createReferralCode, recordReferralReview } from "./referrals.js";
import { createInvoiceShareLink, listInvoiceShareLinks, openInvoiceShareLink, revokeInvoiceShareLink } from "./invoice-sharing.js";
import {
  commitBankStatementImport, commitContactImport, commitOpeningStockImport,
  commitProductImport, listImportBatches, previewBankStatementImport,
  previewContactImport, previewOpeningStockImport, previewProductImport,
} from "./imports.js";
import {
  approveBankReconciliation, getBankReconciliationReport, getBankReconciliationSummary,
  getBankReconciliationWorksheet, listBankReconciliations, prepareBankReconciliation,
  listBankInvoiceMatchCandidates, listBankSplitMatchCandidates, listBankTransferMatchCandidates,
  matchBankTransactionToInvoice, matchBankTransactionsAsTransfer, matchBankTransactionToInvoices,
  postBankTransactionFee,
} from "./bank-reconciliation.js";
import { buildControlCenterSnapshot } from "./platform/admin/control-center.js";
import { backupManifestInputSchema } from "./platform/admin/backup-manifests.js";
import {
  listRestoreDrills, recordRestoreDrill, reviewRestoreDrill,
} from "./platform/admin/restore-drills.js";
import {
  DOMAIN_EVENTS, EVENT_TYPES, runWithPostCommitEvents, type EventType,
} from "./platform/events/index.js";
import { listPlatformEvents } from "./platform-events.js";
import { assertCompatibleTaxRate, resolveTax, taxRateString, todayIsoDate } from "./tax.js";
import { getVatTechnicalReport, vatReportPeriodSchema } from "./vat-return-report.js";
import { renderVatReportCsv, renderVatReportPdf } from "./vat-return-exports.js";
import { getStatutoryReportPack, statutoryReportPeriodSchema } from "./statutory-report-pack.js";
import { renderStatutoryReportCsv, renderStatutoryReportPdf } from "./statutory-report-exports.js";
import { getReportBranding } from "./document-branding.js";
import {
  createFinanceReportSnapshot, getFinanceReportSnapshot, listFinanceReportSnapshots,
} from "./finance-report-snapshots.js";
import { recordAudit } from "./platform/audit-facade.js";
import { searchQuerySchema, type SearchResultDocument } from "./search.js";
import { AI_SERVICE_FACTORY, DOCUMENT_SERVICE, IDENTITY_FACTORY, METADATA_SERVICE, SEARCH_SERVICE, platformKernel } from "./platform-runtime.js";
import {
  AIAgentUnavailableError, AIContextBoundaryError, AIObjectNotFoundError,
  AIObjectUnavailableError, AIPermissionDeniedError, AIProviderResponseError,
  AIProviderUnavailableError,
} from "./platform/ai/errors.js";
import { InvalidSearchQueryError } from "./platform/search/errors.js";
import { METADATA_REGISTRY_VERSION, metadataQuerySchema } from "./metadata.js";
import { CustomerTimelineProjector, getCustomerTimeline, timelineQuerySchema } from "./customer-timeline.js";
import {
  DOCUMENT_KINDS, captureDocumentId, documentDataUrl, financeReportPdfDocumentId,
  invoicePdfDocumentId, rawDocumentId, workspaceDocumentVersionId,
} from "./documents.js";
import { latestEmailPreference, recordEmailPreference } from "./communication-preferences.js";
import { FINANCE_DELIVERY_LOCALES } from "./finance-delivery-catalogues.js";
import { sendFinanceDocument } from "./finance-document-delivery.js";
import {
  listFailedEmailDeliveriesToday, listNotificationInbox, markAllNotificationsRead,
  markNotificationRead,
} from "./notifications.js";
import { sendUserInvitationEmail } from "./transactional-email.js";
import {
  initiateSubscriptionPayment, listSubscriptionPaymentAttempts, processPaynowResult,
  refreshSubscriptionPayment, subscriptionPaymentAvailability,
} from "./subscription-payments.js";
import {
  bulkUpdateContacts, decideContactDeletionRequest, deleteOrRequestContacts,
  listContactDeletionRequests,
} from "./contact-records.js";
import { queuePartyRoleEvents } from "./party-events.js";
import {
  assertActiveSupplier, createSupplier, getSupplier, listSuppliers,
  supplierCreateSchema, supplierUpdateSchema, updateSupplier,
} from "./suppliers.js";
import {
  approvePurchaseOrder, awardRequestForQuote, createDirectPurchaseOrder,
  createPurchaseRequisition, createRequestForQuote, decidePurchaseRequisition, getProcurementReferenceData,
  directPurchaseOrderSchema, goodsReceiptSchema, listGoodsReceipts,
  listPurchaseOrders, listPurchaseRequisitions, listRequestForQuotes,
  postGoodsReceipt, purchaseOrderApprovalSchema, purchaseRequisitionCreateSchema,
  requestForQuoteAwardSchema, requestForQuoteCreateSchema, requisitionDecisionSchema,
} from "./procurement.js";
import {
  createSupplierBill, evaluateSupplierBillMatch, getSupplierBill, listSupplierBills,
  postSupplierBill, supplierBillCreateSchema, supplierBillPostSchema, supplierBillUpdateSchema, updateSupplierBill,
} from "./supplier-bills.js";
import {
  createWarehouse, getWarehouseSettings, updateWarehouse,
  warehouseCreateSchema, warehouseUpdateSchema,
} from "./warehouse-settings.js";
import { getSupplierAnalytics, supplierAnalyticsQuerySchema } from "./supplier-analytics.js";
import { logEvent } from "./observability.js";
import {
  assertUniversalTimelinePermission, getUniversalTimeline, resolveUniversalObjectType,
} from "./universal-timeline.js";
import {
  autoAuditContactRoles, autoAuditMutation, verifyAuditChain,
} from "./universal-audit.js";

export const api = Router();
const wrap = (fn: (req: AuthedRequest, res: Response) => Promise<unknown>) =>
  (req: any, res: any, next: any) => fn(req, res).then((r) => r !== undefined && res.json(r)).catch(next);
const routeParam = (req: AuthedRequest, name: string): string => {
  const value = req.params[name];
  if (typeof value !== "string") throw badRequest(`Invalid route parameter: ${name}`);
  return value;
};
const uuidRouteParam = (req: AuthedRequest, name: string): string =>
  z.string().uuid().parse(routeParam(req, name));
const isHttpsUrl = (value: string): boolean => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};
const financialIdempotencyKey = (req: AuthedRequest, bodyKey?: string | null): string => {
  const headerKey = req.header("Idempotency-Key")?.trim();
  const fieldKey = bodyKey?.trim();
  if (headerKey && fieldKey && headerKey !== fieldKey) throw conflict("Conflicting idempotency keys");
  return requireIdempotencyKey(headerKey ?? fieldKey);
};
const reconciliationWorksheetQuerySchema = z.object({
  statementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Statement date must be YYYY-MM-DD"),
  statementClosingBalance: z.string().trim()
    .regex(/^-?\d{1,12}(\.\d{1,2})?$/, "Statement closing balance must be a money amount"),
});
const prepareReconciliationSchema = reconciliationWorksheetQuerySchema.extend({
  notes: z.string().trim().max(1000).optional(),
});
const financeDeliveryConfirmationSchema = z.object({ confirm: z.literal(true) });
const financeReportSnapshotCreateSchema = z.discriminatedUnion("reportType", [
  z.object({ reportType: z.literal("VAT"), period: vatReportPeriodSchema, confirm: z.literal(true) }),
  z.object({ reportType: z.literal("STATUTORY"), period: statutoryReportPeriodSchema, confirm: z.literal(true) }),
]);
const emailPreferenceSchema = z.object({
  status: z.enum(["CONSENTED", "OPTED_OUT"]),
  locale: z.enum(FINANCE_DELIVERY_LOCALES),
  evidenceSource: z.enum(["CUSTOMER_REQUEST", "CONTRACT", "LEGITIMATE_INTEREST", "OTHER"]),
  reason: z.string().trim().min(3).max(500).optional().nullable(),
});

// ---------------------------------------------------------------------------
// Public: signup + login
// ---------------------------------------------------------------------------
const signupSchema = z.object({
  companyName: z.string().min(2), subdomain: z.string(),
  baseCurrency: z.enum(["USD", "ZWG"]),
  ownerEmail: z.string().email(), ownerPassword: z.string(), ownerName: z.string().min(2),
  planName: z.string().optional(),
  referralCode: z.string().max(32).optional(),
});
// The raw refresh credential travels only in the HttpOnly refresh cookie:
// strip it from every JSON session payload before responding.
const deliverSession = <S extends { mfaRequired: boolean; refreshToken?: string }>(res: Response, session: S) => {
  if (session.mfaRequired || !session.refreshToken) return session;
  setRefreshCookie(res, session.refreshToken);
  const { refreshToken: _refreshToken, ...safe } = session;
  return safe;
};

api.post("/auth/signup", wrap(async (req, res) => {
  const body = signupSchema.parse(req.body);
  const { tenant, owner } = await signupTenant(body);
  const session = await login(body.ownerEmail, body.ownerPassword, tenant.subdomain, {
    clientType: req.header("X-Vaka-Client") ?? "web",
    appVersion: req.header("X-Vaka-App-Version") ?? undefined,
    userAgent: req.header("User-Agent") ?? undefined,
    ip: req.ip,
  });
  return { tenant: { id: tenant.id, subdomain: tenant.subdomain, companyName: tenant.companyName, trialEndsAt: tenant.trialEndsAt }, ...deliverSession(res, session) };
}));

api.post("/auth/login", wrap(async (req, res) => {
  const { email, password, subdomain } = z.object({
    email: z.string().email(), password: z.string(), subdomain: z.string().optional(),
  }).parse(req.body);
  let session: Awaited<ReturnType<typeof login>>;
  try {
    session = await login(email, password, subdomain, {
      clientType: req.header("X-Vaka-Client") ?? "web",
      appVersion: req.header("X-Vaka-App-Version") ?? undefined,
      userAgent: req.header("User-Agent") ?? undefined,
      ip: req.ip,
    });
  } catch (error) {
    logEvent("auth.login.failed", {
      requestId: req.requestId ?? null,
      route: "/api/v1/auth/login",
      reason: "authentication_rejected",
    }, "warn");
    throw error;
  }
  logEvent("auth.login.succeeded", {
    requestId: req.requestId ?? null,
    route: "/api/v1/auth/login",
    tenantId: session.user.tenantId,
    userId: session.user.id,
    mfaRequired: session.mfaRequired,
  });
  return deliverSession(res, session);
}));

// P9-010: renew an authenticated session from the HttpOnly refresh cookie.
// Public but rate limited (see app.ts). Every renewal rotates the refresh
// credential; replay of a superseded credential revokes the session. All
// failures are a generic 401 that also clears the cookie.
api.post("/auth/refresh", wrap(async (req, res) => {
  const rawRefreshToken = readRefreshCookie(req);
  if (!rawRefreshToken) {
    clearRefreshCookie(res);
    res.status(401).json({ error: "UNAUTHORIZED", message: "Session renewal failed" });
    return;
  }
  try {
    const renewed = await renewSession(rawRefreshToken);
    setRefreshCookie(res, renewed.refreshToken);
    return { token: renewed.token };
  } catch (error) {
    clearRefreshCookie(res);
    throw error;
  }
}));

api.post("/auth/password-reset/request", wrap(async (req) => {
  const body = z.object({
    email: z.string().email(),
    subdomain: z.string().trim().min(3).max(31).optional(),
  }).parse(req.body);
  return requestPasswordReset(body.email, body.subdomain);
}));

api.post("/auth/password-reset/complete", wrap(async (req) => {
  const body = z.object({
    token: z.string().min(32).max(256),
    newPassword: z.string().min(12).max(256),
  }).parse(req.body);
  return completePasswordReset(body.token, body.newPassword);
}));

api.post("/auth/mfa/verify-login", wrap(async (req, res) => {
  const body = z.object({
    challengeToken: z.string().min(32).max(2048),
    code: z.string().trim().min(6).max(32),
  }).parse(req.body);
  const verified = await verifyMfaLogin(body.challengeToken, body.code);
  const session = await issueAuthenticatedSession(verified.userId, {
    clientType: req.header("X-Vaka-Client") ?? "web",
    appVersion: req.header("X-Vaka-App-Version") ?? undefined,
    userAgent: req.header("User-Agent") ?? undefined,
    ip: req.ip,
  }, "aal2");
  return deliverSession(res, session);
}));

// Public customer document access. The opaque, expiry-bound share token is
// validated server-side before any invoice information or PDF is returned.
api.get("/public/invoices/:token/pdf", async (req, res, next) => {
  try {
    const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/).parse(req.params.token);
    const result = await openInvoiceShareLink(token);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="shared-invoice-${result.invoiceId}.pdf"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(result.pdf);
  } catch (error) { next(error); }
});

api.get("/public/workspaces/:subdomain/holding", wrap(async (req, res) => {
  const subdomain = z.string().trim().toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,29}[a-z0-9])?$/)
    .parse(routeParam(req, "subdomain"));
  const [tenant] = await db.select({
    companyName: schema.tenants.companyName,
    subdomain: schema.tenants.subdomain,
    status: schema.tenants.status,
    logoUrl: schema.tenants.logoUrl,
    brandPrimaryColor: schema.tenants.brandPrimaryColor,
    brandSecondaryColor: schema.tenants.brandSecondaryColor,
    holdingPageHeading: schema.tenants.holdingPageHeading,
    holdingPageMessage: schema.tenants.holdingPageMessage,
    holdingOfferTitle: schema.tenants.holdingOfferTitle,
    holdingOfferBody: schema.tenants.holdingOfferBody,
    holdingOfferCtaLabel: schema.tenants.holdingOfferCtaLabel,
    holdingOfferCtaUrl: schema.tenants.holdingOfferCtaUrl,
  }).from(schema.tenants).where(eq(schema.tenants.subdomain, subdomain));
  if (!tenant || tenant.status === "CLOSED") throw notFound("Workspace not found");
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  return {
    companyName: tenant.companyName,
    subdomain: tenant.subdomain,
    logoUrl: tenant.logoUrl,
    brandPrimaryColor: tenant.brandPrimaryColor,
    brandSecondaryColor: tenant.brandSecondaryColor,
    heading: tenant.holdingPageHeading,
    message: tenant.holdingPageMessage,
    offer: tenant.holdingOfferTitle || tenant.holdingOfferBody ? {
      title: tenant.holdingOfferTitle,
      body: tenant.holdingOfferBody,
      ctaLabel: tenant.holdingOfferCtaLabel,
      ctaUrl: tenant.holdingOfferCtaUrl,
    } : null,
  };
}));

api.post("/public/payments/paynow/result",
  expressText({ type: "application/x-www-form-urlencoded", limit: "16kb" }),
  wrap(async (req, res) => {
    const result = await processPaynowResult(z.string().max(16_384).parse(req.body));
    res.setHeader("Cache-Control", "no-store");
    return { received: true, status: result.attempt.status };
  }));

// everything below requires auth + lifecycle gate
api.use(authenticate as any, lifecycleGate as any);

api.get("/me", wrap(async (req) => {
  const t = (req as any).tenant;
  const [currentUser] = await db.select({
    id: schema.users.id,
    email: schema.users.email,
    fullName: schema.users.fullName,
    platformRoleKey: schema.users.platformRoleKey,
  }).from(schema.users).where(eq(schema.users.id, req.auth!.userId));
  const [staffProfile] = req.auth!.isPlatformAdmin
    ? await db.select({
      workPhone: schema.platformStaffProfiles.workPhone,
      location: schema.platformStaffProfiles.location,
      businessFunction: schema.platformStaffProfiles.businessFunction,
      jobTitle: schema.platformStaffProfiles.jobTitle,
    }).from(schema.platformStaffProfiles).where(eq(schema.platformStaffProfiles.userId, req.auth!.userId))
    : [];
  return {
    ...req.auth,
    user: { ...currentUser, ...staffProfile },
    // FLAG-002: enabled feature keys drive nav/page gating in the web shell.
    features: await enabledFeaturesFor(req.auth!.tenantId),
    tenant: t ? {
      id: t.id, companyName: t.companyName, subdomain: t.subdomain, status: t.status,
      baseCurrency: t.baseCurrency, trialEndsAt: t.trialEndsAt,
      brandPrimaryColor: t.brandPrimaryColor, brandSecondaryColor: t.brandSecondaryColor,
      logoUrl: t.logoUrl, taxNumber: t.taxNumber, vatNumber: t.vatNumber,
      registrationNumber: t.registrationNumber, physicalAddress: t.physicalAddress,
      invoicePaymentTerms: t.invoicePaymentTerms,
      invoiceBankName: t.invoiceBankName,
      invoiceBankAccountName: t.invoiceBankAccountName,
      invoiceBankAccountNumber: t.invoiceBankAccountNumber,
      invoiceBankBranch: t.invoiceBankBranch,
      invoiceBankSwiftCode: t.invoiceBankSwiftCode,
      invoiceBankCurrency: t.invoiceBankCurrency,
      showVatNumberOnInvoices: t.showVatNumberOnInvoices,
      signOutDestination: t.signOutDestination,
      idleSignOutEnabled: t.idleSignOutEnabled,
      idleSignOutMinutes: t.idleSignOutMinutes,
      holdingPageHeading: t.holdingPageHeading,
      holdingPageMessage: t.holdingPageMessage,
      holdingOfferTitle: t.holdingOfferTitle,
      holdingOfferBody: t.holdingOfferBody,
      holdingOfferCtaLabel: t.holdingOfferCtaLabel,
      holdingOfferCtaUrl: t.holdingOfferCtaUrl,
    } : null,
  };
}));

api.get("/search", wrap(async (req, res) => {
  const query = searchQuerySchema.parse(req.query);
  const relevantPermissions = req.auth!.permissions.filter((permission) =>
    ["crm.read", "accounting.read", "inventory.read"].includes(permission));
  if (!relevantPermissions.length) throw forbidden("Search requires a customer, accounting, or inventory read permission");
  let result;
  try {
    result = await platformKernel().container.get(SEARCH_SERVICE).search<SearchResultDocument>({
      text: query.q,
      limit: query.limit,
      cursor: query.cursor,
      entityTypes: query.entityTypes,
    }, {
      tenantId: tenantId(req),
      actorUserId: req.auth!.userId,
      permissions: req.auth!.permissions,
    });
  } catch (error) {
    if (error instanceof InvalidSearchQueryError) throw badRequest(error.message);
    throw error;
  }
  res.setHeader("Cache-Control", "private, no-store");
  return result;
}));

api.get("/metadata/objects", wrap(async (req, res) => {
  const query = metadataQuerySchema.parse(req.query);
  const definitions = await platformKernel().container.get(METADATA_SERVICE).objects(tenantId(req));
  const requested: ReadonlySet<string> | null = query.keys ? new Set(query.keys) : null;
  const permitted = definitions.filter((definition) =>
    (!requested || requested.has(definition.key))
    && (!definition.readPermission || req.auth!.permissions.includes(definition.readPermission)));
  res.setHeader("Cache-Control", "private, no-store");
  return { registryVersion: METADATA_REGISTRY_VERSION, objects: permitted };
}));

const universalTimelineQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict();
api.get("/objects/:type/:id/timeline", wrap(async (req, res) => {
  const objectType = resolveUniversalObjectType(routeParam(req, "type"));
  assertUniversalTimelinePermission(objectType, req.auth!.permissions);
  const objectId = z.string().uuid().parse(routeParam(req, "id"));
  const result = await getUniversalTimeline(
    tenantId(req), objectType, objectId, universalTimelineQuerySchema.parse(req.query),
  );
  res.setHeader("Cache-Control", "private, no-store");
  return result;
}));

api.post("/auth/change-password", wrap(async (req) => {
  const body = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(12).max(256),
  }).parse(req.body);
  return changePassword({ userId: req.auth!.userId, ...body });
}));

// P9-011: fresh reauthentication for privileged destructive actions. The
// returned proof is held in browser memory only and grants no permission of
// its own; protected routes still run their normal permission checks first.
api.post("/auth/step-up", wrap(async (req) => {
  const body = z.object({
    currentPassword: z.string().min(1).max(256),
    code: z.string().trim().min(6).max(32).optional(),
  }).parse(req.body);
  return performStepUp({
    userId: req.auth!.userId,
    tenantId: req.auth!.tenantId,
    sessionId: req.auth!.sessionId,
    assuranceLevel: req.auth!.assuranceLevel,
  }, body.currentPassword, body.code);
}));

api.post("/auth/logout", wrap(async (req, res) => {
  const body = z.object({ reason: z.enum(["EXPLICIT", "IDLE"]).default("EXPLICIT") })
    .parse(req.body ?? {});
  clearRefreshCookie(res);
  if (!req.auth!.sessionId) return { revoked: false };
  return revokeSession({
    tenantId: req.auth!.tenantId,
    sessionId: req.auth!.sessionId,
    actorUserId: req.auth!.userId,
    reason: body.reason === "IDLE" ? "idle_sign_out" : "user_sign_out",
  });
}));

api.use(requireCompletedPasswordChange as any);

api.patch("/me/profile", wrap(async (req) => {
  const body = z.object({
    fullName: z.string().trim().min(2).max(120),
    workPhone: z.string().trim().max(40).optional().nullable(),
    location: z.string().trim().max(120).optional().nullable(),
  }).parse(req.body);
  return db.transaction(async (tx) => {
    await tx.update(schema.users).set({ fullName: body.fullName }).where(eq(schema.users.id, req.auth!.userId));
    if (req.auth!.isPlatformAdmin) {
      const [profile] = await tx.select({ userId: schema.platformStaffProfiles.userId })
        .from(schema.platformStaffProfiles).where(eq(schema.platformStaffProfiles.userId, req.auth!.userId));
      if (profile) {
        await tx.update(schema.platformStaffProfiles).set({
          workPhone: body.workPhone || null,
          location: body.location || null,
          updatedBy: req.auth!.userId,
          updatedAt: new Date(),
        }).where(eq(schema.platformStaffProfiles.userId, req.auth!.userId));
      }
      await tx.insert(schema.platformAuditLogs).values({
        userId: req.auth!.userId,
        action: "platform.staff_self_profile_updated",
        metadata: { profileFields: ["fullName", "workPhone", "location"] },
      });
    } else if (req.auth!.tenantId) {
      await audit(tx, req.auth!.tenantId, req.auth!.userId, "security.profile_updated", "user", req.auth!.userId, {
        profileFields: ["fullName"],
      });
    }
    return { updated: true };
  });
}));

api.get("/auth/mfa", wrap(async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  return mfaStatus(req.auth!.userId);
}));
api.post("/auth/mfa/enroll", wrap(async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  return beginMfaEnrollment(req.auth!.userId);
}));
api.post("/auth/mfa/enroll/verify", wrap(async (req, res) => {
  const { code } = z.object({ code: z.string().trim().regex(/^\d{6}$/) }).parse(req.body);
  res.setHeader("Cache-Control", "private, no-store");
  return verifyMfaEnrollment(req.auth!.userId, code);
}));
api.post("/auth/mfa/recovery-codes", wrap(async (req, res) => {
  const body = z.object({
    currentPassword: z.string().min(1).max(256),
    code: z.string().trim().regex(/^\d{6}$/),
  }).parse(req.body);
  res.setHeader("Cache-Control", "private, no-store");
  return replaceMfaRecoveryCodes(req.auth!.userId, body.currentPassword, body.code);
}));
api.delete("/auth/mfa", wrap(async (req) => {
  const body = z.object({
    currentPassword: z.string().min(1).max(256),
    code: z.string().trim().min(6).max(32),
  }).parse(req.body);
  return disableMfa(req.auth!.userId, body.currentPassword, body.code);
}));
api.get("/security/my-sessions", wrap(async (req) =>
  db.select({
    id: schema.userSessions.id,
    clientType: schema.userSessions.clientType,
    deviceDescription: schema.userSessions.deviceDescription,
    createdAt: schema.userSessions.createdAt,
    lastSeenAt: schema.userSessions.lastSeenAt,
    idleExpiresAt: schema.userSessions.idleExpiresAt,
    absoluteExpiresAt: schema.userSessions.absoluteExpiresAt,
    revokedAt: schema.userSessions.revokedAt,
  }).from(schema.userSessions)
    .where(eq(schema.userSessions.userId, req.auth!.userId))
    .orderBy(desc(schema.userSessions.lastSeenAt))
    .limit(20)));
api.post("/security/my-sessions/:id/revoke", wrap(async (req) => {
  const sessionId = routeParam(req, "id");
  const [owned] = await db.select({ id: schema.userSessions.id }).from(schema.userSessions).where(and(
    eq(schema.userSessions.id, sessionId),
    eq(schema.userSessions.userId, req.auth!.userId),
  ));
  if (!owned) throw notFound("Session not found");
  return revokeSession({
    tenantId: req.auth!.tenantId,
    sessionId,
    actorUserId: req.auth!.userId,
    reason: "user_security_settings",
  });
}));

const notificationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).optional(),
  unread: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
});
api.get("/notifications", wrap(async (req, res) => {
  const { limit, page, pageSize, unread } = notificationListQuerySchema.parse(req.query);
  const result = await listNotificationInbox(tenantId(req), req.auth!.userId, {
    page,
    pageSize: pageSize ?? limit ?? 20,
    unread,
  });
  res.setHeader("Cache-Control", "private, no-store");
  return {
    notifications: result.notifications.map((notification) => ({
      id: notification.id,
      template: notification.template,
      locale: notification.locale,
      variables: notification.variables,
      status: notification.status,
      createdAt: notification.createdAt,
      ...(notification.title !== null || notification.body !== null || notification.link !== null
        ? {
          priority: notification.priority,
          title: notification.title,
          body: notification.body,
          link: notification.link,
          objectType: notification.objectType,
          objectId: notification.objectId,
          readAt: notification.readAt,
        }
        : {}),
    })),
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    hasMore: result.hasMore,
  };
}));
api.post("/notifications/read-all", wrap(async (req, res) => {
  const updated = await markAllNotificationsRead(tenantId(req), req.auth!.userId);
  res.setHeader("Cache-Control", "private, no-store");
  return { updated };
}));
api.post("/notifications/:id/read", wrap(async (req, res) => {
  const notification = await markNotificationRead(
    tenantId(req), req.auth!.userId, routeParam(req, "id"),
  );
  if (!notification) throw notFound("Notification not found");
  res.setHeader("Cache-Control", "private, no-store");
  return notification;
}));

api.get("/security/activity", requireTenantOwner as any, wrap(async (req) => {
  const tid = tenantId(req);
  const summary = await db.execute(sql`
    SELECT
      COUNT(DISTINCT u.id)::int AS registered_users,
      COUNT(DISTINCT u.id) FILTER (WHERE u.status = 'active')::int AS active_users,
      COUNT(DISTINCT u.id) FILTER (WHERE u.status = 'invited')::int AS invited_users,
      COUNT(DISTINCT u.id) FILTER (WHERE u.status = 'disabled')::int AS disabled_users,
      COUNT(DISTINCT s.user_id) FILTER (WHERE s.revoked_at IS NULL AND s.idle_expires_at > NOW() AND s.absolute_expires_at > NOW())::int AS signed_in_users,
      COUNT(s.id) FILTER (WHERE s.revoked_at IS NULL AND s.idle_expires_at > NOW() AND s.absolute_expires_at > NOW())::int AS valid_sessions,
      COUNT(DISTINCT s.user_id) FILTER (WHERE s.revoked_at IS NULL AND s.idle_expires_at > NOW() AND s.absolute_expires_at > NOW() AND s.last_seen_at >= NOW() - INTERVAL '5 minutes')::int AS active_now_users
    FROM users u
    LEFT JOIN user_sessions s ON s.user_id = u.id AND s.tenant_id = ${tid}
    WHERE u.tenant_id = ${tid}`);
  const users = await db.execute(sql`
    SELECT u.id, u.full_name, u.email, u.status, u.last_login_at, r.name AS role_name,
      COUNT(s.id) FILTER (WHERE s.revoked_at IS NULL AND s.idle_expires_at > NOW() AND s.absolute_expires_at > NOW())::int AS valid_sessions,
      MAX(s.last_seen_at) FILTER (WHERE s.revoked_at IS NULL AND s.idle_expires_at > NOW() AND s.absolute_expires_at > NOW()) AS last_seen_at
    FROM users u
    LEFT JOIN user_sessions s ON s.user_id = u.id AND s.tenant_id = ${tid}
    LEFT JOIN roles r ON r.id = u.role_id AND r.tenant_id = ${tid}
    WHERE u.tenant_id = ${tid}
    GROUP BY u.id, r.name
    ORDER BY u.full_name ASC`);
  const sessions = await db.execute(sql`
    SELECT s.id, s.user_id, u.full_name, u.email, s.client_type, s.app_version,
      s.device_description, s.created_at, s.last_seen_at, s.idle_expires_at,
      s.absolute_expires_at, s.revoked_at
    FROM user_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.tenant_id = ${tid}
    ORDER BY COALESCE(s.last_seen_at, s.created_at) DESC
    LIMIT 200`);
  const events = await db.select({
    id: schema.auditLogs.id, userId: schema.auditLogs.userId,
    action: schema.auditLogs.action, entityType: schema.auditLogs.entityType,
    entityId: schema.auditLogs.entityId, metadata: schema.auditLogs.metadata,
    createdAt: schema.auditLogs.createdAt,
  }).from(schema.auditLogs).where(eq(schema.auditLogs.tenantId, tid))
    .orderBy(desc(schema.auditLogs.createdAt)).limit(200);
  return {
    summary: (summary as any).rows[0] ?? {},
    users: (users as any).rows,
    roles: (await db.select({ id: schema.roles.id, name: schema.roles.name }).from(schema.roles)
      .where(eq(schema.roles.tenantId, tid)).orderBy(schema.roles.name)),
    sessions: (sessions as any).rows,
    events,
  };
}));

api.post("/security/users", requireTenantOwner as any, requireStepUp as any, wrap(async (req) => {
  const body = z.object({
    email: z.string().email(), fullName: z.string().trim().min(2).max(100),
    roleId: z.string().uuid(), initialPassword: z.string().min(12).max(256).optional(),
  }).parse(req.body);
  const created = await createTenantUser({ tenantId: tenantId(req), actorUserId: req.auth!.userId, ...body });
  try {
    await sendUserInvitationEmail({
      tenantId: tenantId(req),
      actorUserId: req.auth!.userId,
      user: created.user,
      temporaryPassword: created.temporaryPassword,
    });
  } catch {
    // User creation remains committed and the owner still receives the existing
    // temporary-password response. The failed email is persisted and logged for operators.
  }
  return created;
}));

api.post("/security/users/:id/:status", requireTenantOwner as any, requireStepUp as any, wrap(async (req) => {
  const status = z.enum(["active", "disabled"]).parse(req.params.status);
  return setTenantUserStatus({
    tenantId: tenantId(req), actorUserId: req.auth!.userId,
    userId: routeParam(req, "id"), status,
  });
}));

api.post("/security/sessions/:id/revoke", requireTenantOwner as any, wrap(async (req) => {
  const sessionId = routeParam(req, "id");
  if (sessionId === req.auth!.sessionId) throw badRequest("Use Sign out to end your current session");
  const body = z.object({ reason: z.string().trim().min(3).max(200).default("owner_revoked") }).parse(req.body ?? {});
  return revokeSession({ tenantId: tenantId(req), sessionId, actorUserId: req.auth!.userId, reason: body.reason });
}));

api.patch("/profile", wrap(async (req) => {
  const body = z.object({ fullName: z.string().trim().min(2).max(100) }).parse(req.body);
  const [updated] = await db.update(schema.users).set(body)
    .where(eq(schema.users.id, req.auth!.userId))
    .returning({ id: schema.users.id, email: schema.users.email, fullName: schema.users.fullName });
  if (req.auth!.tenantId) {
    await audit(db, req.auth!.tenantId, req.auth!.userId,
      "profile.updated", "user", req.auth!.userId);
  } else {
    await db.insert(schema.platformAuditLogs).values({
      userId: req.auth!.userId,
      action: "platform_admin.profile_updated",
    });
  }
  return updated;
}));

// ---------------------------------------------------------------------------
// Tenant settings & branding (white-label)
// ---------------------------------------------------------------------------
api.patch("/settings/branding", requirePermission("settings.manage"), wrap(async (req) => {
  const body = z.object({
    companyName: z.string().trim().min(2).max(160).optional(),
    logoUrl: z.union([
      z.string().url().refine(isHttpsUrl, "Logo URL must use HTTPS"),
      z.literal(""),
    ]).optional()
      .transform((value) => value === "" ? null : value),
    brandPrimaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    brandSecondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    taxNumber: z.string().trim().max(100).optional(),
    vatNumber: z.string().trim().max(100).optional(),
    registrationNumber: z.string().trim().max(100).optional(),
    physicalAddress: z.string().trim().max(500).optional(),
    invoicePaymentTerms: z.string().trim().max(1000).optional(),
    invoiceBankName: z.string().trim().max(160).optional(),
    invoiceBankAccountName: z.string().trim().max(160).optional(),
    invoiceBankAccountNumber: z.string().trim().max(100).optional(),
    invoiceBankBranch: z.string().trim().max(160).optional(),
    invoiceBankSwiftCode: z.string().trim().max(50).optional(),
    invoiceBankCurrency: z.union([z.enum(["USD", "ZWG"]), z.literal("")]).optional().nullable()
      .transform((value) => value === "" ? null : value),
    showVatNumberOnInvoices: z.boolean().optional(),
  }).parse(req.body);
  const tid = tenantId(req);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(schema.tenants).where(eq(schema.tenants.id, tid)).for("update");
    if (!before) throw notFound("Tenant not found");
    const [updated] = await tx.update(schema.tenants).set(body).where(eq(schema.tenants.id, tid)).returning();
    const changedFields = Object.keys(body);
    await audit(tx, tid, req.auth!.userId, "settings.branding_updated", "tenant", tid, {
      changedFields,
      documentPaymentDetailsChanged: changedFields.some((field) => field.startsWith("invoiceBank") || field === "invoicePaymentTerms"),
    });
    await autoAuditMutation(tx, {
      tenantId: tid, actorId: req.auth!.userId, actorType: "user",
      action: "company.updated", objectType: "Company", objectId: tid,
      before, after: updated, ip: req.ip,
    });
    return updated;
  });
}));
api.patch("/settings/holding-page", requirePermission("settings.manage"), wrap(async (req) => {
  const nullableText = (max: number) => z.string().trim().max(max)
    .transform((value) => value || null);
  const body = z.object({
    signOutDestination: z.enum(["PUBLIC_HOME", "HOLDING_PAGE"]),
    idleSignOutEnabled: z.boolean(),
    idleSignOutMinutes: z.number().int().min(5).max(480),
    holdingPageHeading: nullableText(100),
    holdingPageMessage: nullableText(500),
    holdingOfferTitle: nullableText(100),
    holdingOfferBody: nullableText(500),
    holdingOfferCtaLabel: nullableText(50),
    holdingOfferCtaUrl: z.union([
      z.string().url().refine(isHttpsUrl, "Offer link must use HTTPS"),
      z.literal(""),
    ]).transform((value) => value || null),
  }).superRefine((value, ctx) => {
    if (Boolean(value.holdingOfferCtaLabel) !== Boolean(value.holdingOfferCtaUrl)) {
      ctx.addIssue({ code: "custom", path: ["holdingOfferCtaLabel"], message: "Offer button label and HTTPS link must be configured together" });
    }
    if (value.holdingOfferCtaUrl && !value.holdingOfferTitle && !value.holdingOfferBody) {
      ctx.addIssue({ code: "custom", path: ["holdingOfferTitle"], message: "Offer content is required before adding an offer button" });
    }
  }).parse(req.body);
  const tid = tenantId(req);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(schema.tenants).where(eq(schema.tenants.id, tid)).for("update");
    if (!before) throw notFound("Tenant not found");
    const [updated] = await tx.update(schema.tenants).set(body)
      .where(eq(schema.tenants.id, tid)).returning();
    await audit(tx, tid, req.auth!.userId, "settings.holding_page_updated", "tenant", tid, {
      signOutDestination: body.signOutDestination,
      idleSignOutEnabled: body.idleSignOutEnabled,
      idleSignOutMinutes: body.idleSignOutMinutes,
      customHeading: Boolean(body.holdingPageHeading),
      offerConfigured: Boolean(body.holdingOfferTitle || body.holdingOfferBody),
      offerLinkConfigured: Boolean(body.holdingOfferCtaUrl),
    });
    await autoAuditMutation(tx, {
      tenantId: tid, actorId: req.auth!.userId, actorType: "user",
      action: "company.updated", objectType: "Company", objectId: tid,
      before, after: updated, ip: req.ip,
    });
    return updated;
  });
}));
api.post("/settings/logo", requirePermission("settings.manage"), wrap(async (req) => {
  const { dataUrl } = z.object({
    dataUrl: z.string().trim().min(32).max(700_000),
  }).parse(req.body);
  const match = /^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw badRequest("Logo must be a PNG or JPEG image");
  const mediaType = match[1];
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > 512_000) throw badRequest("Logo must be 512 KB or smaller");
  const validSignature = mediaType === "image/png"
    ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  if (!validSignature) throw badRequest("Logo file signature is invalid");
  let width: number | undefined;
  let height: number | undefined;
  if (mediaType === "image/png") {
    if (bytes.length < 24 || bytes.toString("ascii", 12, 16) !== "IHDR") throw badRequest("PNG logo dimensions are invalid");
    width = bytes.readUInt32BE(16);
    height = bytes.readUInt32BE(20);
    if (!width || !height || width > 2048 || height > 2048) throw badRequest("Logo dimensions must not exceed 2048 by 2048 pixels");
  }
  const tid = tenantId(req);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(schema.tenants).where(eq(schema.tenants.id, tid)).for("update");
    if (!before) throw notFound("Tenant not found");
    const [updated] = await tx.update(schema.tenants).set({ logoUrl: dataUrl })
      .where(eq(schema.tenants.id, tid)).returning();
    await audit(tx, tid, req.auth!.userId, "settings.logo_uploaded", "tenant", tid, {
      mediaType, bytes: bytes.length, width: width ?? null, height: height ?? null,
    });
    await autoAuditMutation(tx, {
      tenantId: tid, actorId: req.auth!.userId, actorType: "user",
      action: "company.updated", objectType: "Company", objectId: tid,
      before, after: updated, ip: req.ip,
    });
    return { logoUrl: updated.logoUrl, mediaType, bytes: bytes.length };
  });
}));

// ---------------------------------------------------------------------------
// Mobile/PWA document capture — intake evidence only; no OCR or posting.
// ---------------------------------------------------------------------------
const captureDocumentType = z.enum(["INVOICE", "RECEIPT", "CONTACT", "OTHER"]);
const captureDataUrl = (value: string) => {
  const match = /^data:(image\/png|image\/jpeg|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw badRequest("Capture must be a PNG, JPEG or PDF data URL");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 1_500_000) throw badRequest("Capture must be smaller than 1.5 MB");
  const validSignature = match[1] === "image/png"
    ? bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    : match[1] === "image/jpeg"
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  if (!validSignature) throw badRequest("Capture file signature is invalid");
  return { mediaType: match[1], bytes };
};
api.get("/captures", requirePermission("imports.create"), wrap(async (req) =>
  db.select({
    id: schema.captureDocuments.id, documentType: schema.captureDocuments.documentType,
    fileName: schema.captureDocuments.fileName, mediaType: schema.captureDocuments.mediaType,
    byteSize: schema.captureDocuments.byteSize, status: schema.captureDocuments.status,
    createdBy: schema.captureDocuments.createdBy, reviewedBy: schema.captureDocuments.reviewedBy,
    reviewedAt: schema.captureDocuments.reviewedAt, reviewNote: schema.captureDocuments.reviewNote,
    createdAt: schema.captureDocuments.createdAt,
  }).from(schema.captureDocuments).where(eq(schema.captureDocuments.tenantId, tenantId(req)))
    .orderBy(desc(schema.captureDocuments.createdAt)).limit(50)));
api.get("/captures/:id", requirePermission("imports.create"), wrap(async (req) => {
  const [capture] = await db.select().from(schema.captureDocuments).where(and(
    eq(schema.captureDocuments.id, routeParam(req, "id")),
    eq(schema.captureDocuments.tenantId, tenantId(req)),
  ));
  if (!capture) throw notFound("Capture not found");
  const document = await platformKernel().container.get(DOCUMENT_SERVICE).get(
    captureDocumentId(capture.id),
    { tenantId: tenantId(req), actorUserId: req.auth!.userId },
  );
  if (!document) throw notFound("Capture not found");
  return { ...capture, dataUrl: documentDataUrl(document) };
}));
api.post("/captures/:id/review", requirePermission("imports.approve"), wrap(async (req) => {
  const body = z.object({
    status: z.enum(["REVIEWED", "REJECTED"]),
    note: z.string().trim().max(1000).optional().nullable(),
  }).parse(req.body ?? {});
  const tid = tenantId(req);
  return db.transaction(async (tx) => {
    const [capture] = await tx.update(schema.captureDocuments).set({
      status: body.status,
      reviewedBy: req.auth!.userId,
      reviewedAt: new Date(),
      reviewNote: body.note ?? null,
    }).where(and(
      eq(schema.captureDocuments.id, routeParam(req, "id")),
      eq(schema.captureDocuments.tenantId, tid),
      eq(schema.captureDocuments.status, "CAPTURED"),
    )).returning({
      id: schema.captureDocuments.id, status: schema.captureDocuments.status,
      reviewedBy: schema.captureDocuments.reviewedBy, reviewedAt: schema.captureDocuments.reviewedAt,
      reviewNote: schema.captureDocuments.reviewNote,
    });
    if (!capture) throw notFound("Capture not found or already reviewed");
    await audit(tx, tid, req.auth!.userId, `capture.${body.status.toLowerCase()}`, "capture_document", capture.id, {
      status: body.status, noteProvided: Boolean(body.note),
    });
    return capture;
  });
}));
api.post("/captures", requirePermission("imports.create"), wrap(async (req) => {
  const body = z.object({
    documentType: captureDocumentType,
    fileName: z.string().trim().min(1).max(180),
    dataUrl: z.string().max(2_000_000),
  }).parse(req.body);
  const parsed = captureDataUrl(body.dataUrl);
  const tid = tenantId(req);
  const fileName = body.fileName.replace(/[^a-zA-Z0-9._ -]/g, "_");
  const descriptor = await platformKernel().container.get(DOCUMENT_SERVICE).put({
    descriptor: {
      id: captureDocumentId(randomUUID()), tenantId: tid, kind: DOCUMENT_KINDS.CAPTURE,
      classification: body.documentType, fileName, mediaType: parsed.mediaType,
      byteSize: parsed.bytes.length, createdAt: new Date(),
    },
    bytes: parsed.bytes,
  }, { tenantId: tid, actorUserId: req.auth!.userId });
  const capture = {
    id: rawDocumentId(descriptor.id, DOCUMENT_KINDS.CAPTURE),
    documentType: descriptor.classification,
    fileName: descriptor.fileName,
    mediaType: descriptor.mediaType,
    byteSize: descriptor.byteSize,
    status: "CAPTURED",
    createdAt: descriptor.createdAt,
  };
  await audit(db, tid, req.auth!.userId, "capture.created", "capture_document", capture.id, {
    documentType: capture.documentType, mediaType: capture.mediaType, bytes: capture.byteSize,
  });
  return capture;
}));

// ---------------------------------------------------------------------------
// Self-service imports — staged preview before explicit approval
// ---------------------------------------------------------------------------
api.get("/imports", requirePermission("imports.create"), wrap(async (req) =>
  listImportBatches(tenantId(req))));
api.post("/imports/contacts/preview", requirePermission("imports.create"), wrap(async (req) => {
  const body = z.object({ csvText: z.string().min(1).max(1_000_000) }).parse(req.body);
  return previewContactImport({
    tenantId: tenantId(req),
    actorUserId: req.auth!.userId,
    csvText: body.csvText,
  });
}));
api.post("/imports/contacts/:id/commit", requirePermission("imports.approve"), wrap(async (req) =>
  commitContactImport({
    tenantId: tenantId(req),
    actorUserId: req.auth!.userId,
    batchId: routeParam(req, "id"),
    ip: req.ip,
  })));
api.post("/imports/products/preview", requirePermission("imports.create"), wrap(async (req) => {
  const body = z.object({ csvText: z.string().min(1).max(1_000_000) }).parse(req.body);
  return previewProductImport({
    tenantId: tenantId(req),
    actorUserId: req.auth!.userId,
    csvText: body.csvText,
  });
}));
api.post("/imports/products/:id/commit",
  requirePermission("imports.approve"),
  requirePermission("inventory.write"),
  wrap(async (req) => commitProductImport({
    tenantId: tenantId(req),
    actorUserId: req.auth!.userId,
    batchId: routeParam(req, "id"),
    ip: req.ip,
  })));
api.post("/imports/opening-stock/preview",
  requirePermission("imports.create"),
  requirePermission("inventory.write"),
  wrap(async (req) => {
    const body = z.object({ csvText: z.string().min(1).max(1_000_000) }).parse(req.body);
    return previewOpeningStockImport({
      tenantId: tenantId(req),
      actorUserId: req.auth!.userId,
      csvText: body.csvText,
    });
  }));
api.post("/imports/opening-stock/:id/commit",
  requirePermission("imports.approve"),
  requirePermission("inventory.write"),
  wrap(async (req) => commitOpeningStockImport({
    tenantId: tenantId(req),
    actorUserId: req.auth!.userId,
    batchId: routeParam(req, "id"),
  })));
api.post("/imports/bank-statement/preview",
  requirePermission("bank_statements.import"),
  wrap(async (req) => {
    const body = z.object({
      bankAccountId: z.string().uuid(),
      csvText: z.string().min(1).max(1_000_000),
    }).parse(req.body);
    return previewBankStatementImport({
      tenantId: tenantId(req),
      actorUserId: req.auth!.userId,
      ...body,
    });
  }));
api.post("/imports/bank-statement/:id/commit",
  requirePermission("bank_statements.import"),
  requirePermission("imports.approve"),
  wrap(async (req) => commitBankStatementImport({
    tenantId: tenantId(req),
    actorUserId: req.auth!.userId,
    batchId: routeParam(req, "id"),
  })));

// ---------------------------------------------------------------------------
// Bank accounts and unreviewed statement feed
// ---------------------------------------------------------------------------
api.get("/bank-accounts", requirePermission("bank_accounts.read"), wrap(async (req) =>
  db.select().from(schema.bankAccounts)
    .where(eq(schema.bankAccounts.tenantId, tenantId(req)))
    .orderBy(schema.bankAccounts.name)));
api.post("/bank-accounts", requirePermission("bank_accounts.configure"), wrap(async (req) => {
  const body = z.object({
    name: z.string().trim().min(2).max(120),
    bankName: z.string().trim().min(2).max(120),
    accountNumber: z.string().trim().min(4).max(40)
      .regex(/^[A-Za-z0-9 Xx*•-]+$/, "Use a masked account identifier only")
      .refine((value) => /[Xx*•]/.test(value) || value.replace(/\D/g, "").length <= 4,
        "Enter only a masked identifier or the last four digits"),
    currency: z.enum(["USD", "ZWG"]),
  }).parse(req.body);
  const tid = tenantId(req);
  return db.transaction(async (tx) => {
    const [account] = await tx.insert(schema.bankAccounts).values({
      ...body,
      tenantId: tid,
    }).returning();
    const ledgerAccount = await ensureBankLedgerAccount(tx, account);
    const [mappedAccount] = await tx.select().from(schema.bankAccounts).where(and(
      eq(schema.bankAccounts.id, account.id),
      eq(schema.bankAccounts.tenantId, tid),
    ));
    await audit(tx, tid, req.auth!.userId, "bank_account.created", "bank_account", account.id, {
      bankName: account.bankName,
      currency: account.currency,
      ledgerAccountId: ledgerAccount.id,
    });
    return mappedAccount;
  });
}));
api.get("/bank-transactions", requirePermission("bank_transactions.read"), wrap(async (req) => {
  const accountId = z.string().uuid().parse(req.query.bankAccountId);
  const [account] = await db.select({ id: schema.bankAccounts.id })
    .from(schema.bankAccounts).where(and(
      eq(schema.bankAccounts.id, accountId),
      eq(schema.bankAccounts.tenantId, tenantId(req)),
    ));
  if (!account) throw notFound("Bank account not found");
  return db.select().from(schema.bankTransactions)
    .where(eq(schema.bankTransactions.bankAccountId, account.id))
    .orderBy(desc(schema.bankTransactions.date))
    .limit(500);
}));
api.get("/bank-accounts/:id/reconciliation-summary",
  requirePermission("bank_transactions.read"),
  wrap(async (req) => getBankReconciliationSummary({
    tenantId: tenantId(req),
    bankAccountId: routeParam(req, "id"),
  })));
api.get("/bank-accounts/:id/reconciliation-worksheet",
  requirePermission("bank_transactions.read"),
  wrap(async (req) => {
    const query = reconciliationWorksheetQuerySchema.parse(req.query);
    return getBankReconciliationWorksheet({
      tenantId: tenantId(req),
      bankAccountId: routeParam(req, "id"),
      statementDate: query.statementDate,
      statementClosingBalance: query.statementClosingBalance,
    });
  }));
api.get("/bank-accounts/:id/reconciliations",
  requirePermission("bank_transactions.read"),
  wrap(async (req) => listBankReconciliations({
    tenantId: tenantId(req),
    bankAccountId: routeParam(req, "id"),
  })));
api.post("/bank-accounts/:id/reconciliations",
  requirePermission("bank_reconciliation.prepare"),
  wrap(async (req) => {
    const body = prepareReconciliationSchema.parse(req.body);
    return prepareBankReconciliation({
      tenantId: tenantId(req),
      actorUserId: req.auth!.userId,
      bankAccountId: routeParam(req, "id"),
      statementDate: body.statementDate,
      statementClosingBalance: body.statementClosingBalance,
      notes: body.notes,
    });
  }));
api.post("/bank-reconciliations/:id/approve",
  requirePermission("bank_reconciliation.approve"),
  wrap(async (req) => approveBankReconciliation({
    tenantId: tenantId(req),
    actorUserId: req.auth!.userId,
    reconciliationId: routeParam(req, "id"),
  })));
api.get("/bank-reconciliations/:id/report",
  requirePermission("bank_transactions.read"),
  wrap(async (req) => getBankReconciliationReport({
    tenantId: tenantId(req),
    actorUserId: req.auth!.userId,
    reconciliationId: routeParam(req, "id"),
  })));
api.get("/bank-transactions/:id/match-candidates",
  requirePermission("bank_transactions.read"),
  requirePermission("accounting.read"),
  wrap(async (req) => listBankInvoiceMatchCandidates({
    tenantId: tenantId(req),
    bankTransactionId: routeParam(req, "id"),
  })));
api.post("/bank-transactions/:id/match-invoice",
  requirePermission("bank_transactions.match"),
  requirePermission("accounting.post"),
  wrap(async (req) => {
    const body = z.object({ invoiceId: z.string().uuid() }).parse(req.body);
    return matchBankTransactionToInvoice({
      tenantId: tenantId(req),
      actorUserId: req.auth!.userId,
      bankTransactionId: routeParam(req, "id"),
      invoiceId: body.invoiceId,
    });
  }));
api.get("/bank-transactions/:id/split-candidates",
  requirePermission("bank_transactions.read"),
  requirePermission("accounting.read"),
  wrap(async (req) => listBankSplitMatchCandidates({
    tenantId: tenantId(req),
    bankTransactionId: routeParam(req, "id"),
  })));
api.post("/bank-transactions/:id/post-bank-fee",
  requirePermission("bank_transactions.match"),
  requirePermission("accounting.post"),
  wrap(async (req) => postBankTransactionFee({
    tenantId: tenantId(req),
    actorUserId: req.auth!.userId,
    bankTransactionId: routeParam(req, "id"),
  })));
api.get("/bank-transactions/:id/transfer-candidates",
  requirePermission("bank_transactions.read"),
  requirePermission("accounting.read"),
  wrap(async (req) => listBankTransferMatchCandidates({
    tenantId: tenantId(req),
    bankTransactionId: routeParam(req, "id"),
  })));
api.post("/bank-transactions/:id/match-transfer",
  requirePermission("bank_transactions.match"),
  requirePermission("accounting.post"),
  wrap(async (req) => {
    const body = z.object({ counterpartyBankTransactionId: z.string().uuid() }).parse(req.body);
    return matchBankTransactionsAsTransfer({
      tenantId: tenantId(req),
      actorUserId: req.auth!.userId,
      bankTransactionId: routeParam(req, "id"),
      counterpartyBankTransactionId: body.counterpartyBankTransactionId,
    });
  }));
api.post("/bank-transactions/:id/match-invoices",
  requirePermission("bank_transactions.match"),
  requirePermission("accounting.post"),
  wrap(async (req) => {
    const body = z.object({
      allocations: z.array(z.object({
        invoiceNumber: z.string().trim().min(1),
        amount: z.string().trim().regex(/^\d{1,12}(\.\d{1,2})?$/, "Amount must be positive with no more than 2 decimal places"),
      })).min(2),
    }).parse(req.body);
    return matchBankTransactionToInvoices({
      tenantId: tenantId(req),
      actorUserId: req.auth!.userId,
      bankTransactionId: routeParam(req, "id"),
      allocations: body.allocations,
    });
  }));

// ---------------------------------------------------------------------------
// CRM
// ---------------------------------------------------------------------------
const contactSchema = z.object({
  type: z.enum(["INDIVIDUAL", "COMPANY"]).default("COMPANY"),
  name: z.string().trim().min(1).max(200), email: z.string().trim().email().max(254).optional().nullable(),
  phone: z.string().trim().max(50).optional().nullable(), address: z.string().trim().max(500).optional().nullable(),
  addressLine1: z.string().trim().max(200).optional().nullable(),
  addressLine2: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  region: z.string().trim().max(100).optional().nullable(),
  postalCode: z.string().trim().max(30).optional().nullable(),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional().nullable(),
  website: z.string().trim().url().max(500).optional().nullable(),
  industry: z.string().trim().max(100).optional().nullable(),
  registrationNumber: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
  taxNumber: z.string().trim().max(100).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(50)).max(50).default([]),
  isCustomer: z.boolean().default(true), isVendor: z.boolean().default(false),
}).strict();
api.get("/contacts", requirePermission("crm.read"), wrap(async (req) =>
  db.select().from(schema.contacts).where(and(
    eq(schema.contacts.tenantId, tenantId(req)), isNull(schema.contacts.deletedAt),
  )).orderBy(schema.contacts.name)));
api.get("/invoice-customers", requirePermission("accounting.read"), wrap(async (req) =>
  db.select({
    id: schema.contacts.id,
    name: schema.contacts.name,
    email: schema.contacts.email,
    phone: schema.contacts.phone,
  }).from(schema.contacts).where(and(
    eq(schema.contacts.tenantId, tenantId(req)),
    eq(schema.contacts.isCustomer, true),
    isNull(schema.contacts.deletedAt),
  )).orderBy(schema.contacts.name)));
api.post("/contacts", requirePermission("crm.write"), wrap(async (req) => {
  const body = contactSchema.parse(req.body);
  const tid = tenantId(req);
  return runWithPostCommitEvents((queue) => db.transaction(async (tx) => {
    const [c] = await tx.insert(schema.contacts).values({ ...body, tenantId: tid }).returning();
    await audit(tx, tid, req.auth!.userId, "contact.created", "contact", c.id);
    await autoAuditContactRoles(tx, {
      tenantId: tid, actorId: req.auth!.userId, action: "created", objectId: c.id,
      before: null, after: c, ip: req.ip,
    });
    queuePartyRoleEvents(queue, {
      tenantId: tid, actorUserId: req.auth!.userId, contactId: c.id, change: "created", after: c,
    });
    return c;
  }));
}));
api.patch("/contacts/:id", requirePermission("crm.write"), wrap(async (req) => {
  const body = contactSchema.partial().parse(req.body);
  const tid = tenantId(req);
  return runWithPostCommitEvents((queue) => db.transaction(async (tx) => {
    const [before] = await tx.select().from(schema.contacts).where(and(
      eq(schema.contacts.id, routeParam(req, "id")), eq(schema.contacts.tenantId, tid),
      isNull(schema.contacts.deletedAt),
    )).for("update");
    if (!before) throw notFound("Contact not found");
    const [c] = await tx.update(schema.contacts).set(body)
      .where(and(eq(schema.contacts.id, before.id), eq(schema.contacts.tenantId, tid),
        isNull(schema.contacts.deletedAt))).returning();
    if (!c) throw notFound("Contact not found");
    await audit(tx, tid, req.auth!.userId, "contact.updated", "contact", c.id);
    await autoAuditContactRoles(tx, {
      tenantId: tid, actorId: req.auth!.userId, action: "updated", objectId: c.id,
      before, after: c, ip: req.ip,
    });
    queuePartyRoleEvents(queue, {
      tenantId: tid, actorUserId: req.auth!.userId, contactId: c.id, change: "updated", before, after: c,
    });
    return c;
  }));
}));
const contactIdsSchema = z.array(z.string().uuid()).min(1).max(100);
api.post("/contacts/bulk", requirePermission("crm.write"), wrap(async (req) => {
  const body = z.object({
    ids: contactIdsSchema,
    operation: z.discriminatedUnion("action", [
      z.object({ action: z.literal("ADD_TAG"), tag: z.string() }),
      z.object({ action: z.literal("REMOVE_TAG"), tag: z.string() }),
      z.object({ action: z.literal("MARK_CUSTOMER") }),
      z.object({ action: z.literal("MARK_VENDOR") }),
    ]),
  }).strict().parse(req.body);
  return bulkUpdateContacts({
    tenantId: tenantId(req), actorUserId: req.auth!.userId, ids: body.ids, operation: body.operation,
    ip: req.ip,
  });
}));
api.post("/contacts/deletions", requirePermission("crm.write"), wrap(async (req) => {
  const body = z.object({ ids: contactIdsSchema, reason: z.string().trim().min(3).max(500) }).strict().parse(req.body);
  // P9-011: an Owner performs an immediate deletion, so a fresh step-up proof
  // is required. Ordinary staff merely request deletion — no proof needed.
  if (req.auth!.isTenantOwner) assertStepUpProof(req);
  return deleteOrRequestContacts({
    tenantId: tenantId(req), actorUserId: req.auth!.userId,
    isTenantOwner: req.auth!.isTenantOwner, ids: body.ids, reason: body.reason, ip: req.ip,
  });
}));
api.get("/contacts/deletion-requests", requirePermission("crm.read"), wrap(async (req) =>
  listContactDeletionRequests({
    tenantId: tenantId(req), actorUserId: req.auth!.userId, isTenantOwner: req.auth!.isTenantOwner,
  })));
api.post("/contacts/deletion-requests/:requestId/decision",
  requirePermission("crm.write"), requireTenantOwner, wrap(async (req) => {
    const body = z.object({
      decision: z.enum(["APPROVE", "REJECT"]),
      reason: z.string().trim().min(3).max(500),
    }).strict().parse(req.body);
    // P9-011: approval deletes data and requires a fresh step-up proof;
    // rejection destroys nothing and does not.
    if (body.decision === "APPROVE") assertStepUpProof(req);
    return decideContactDeletionRequest({
      tenantId: tenantId(req), actorUserId: req.auth!.userId, isTenantOwner: req.auth!.isTenantOwner,
      requestId: routeParam(req, "requestId"), ...body, ip: req.ip,
    });
  }));
api.get("/contacts/:id/communication-preferences/email", requirePermission("crm.read"), wrap(async (req) => {
  const tid = tenantId(req);
  const [contact] = await db.select({ id: schema.contacts.id }).from(schema.contacts).where(and(
    eq(schema.contacts.id, routeParam(req, "id")),
    eq(schema.contacts.tenantId, tid), isNull(schema.contacts.deletedAt),
  ));
  if (!contact) throw notFound("Contact not found");
  return latestEmailPreference(tid, contact.id);
}));
api.post("/contacts/:id/communication-preferences/email", requirePermission("crm.write"), wrap(async (req) => {
  const body = emailPreferenceSchema.parse(req.body);
  return recordEmailPreference({
    tenantId: tenantId(req),
    contactId: routeParam(req, "id"),
    actorUserId: req.auth!.userId,
    ...body,
  });
}));
api.post("/contacts/:id/statements/send", requirePermission("accounting.post"), wrap(async (req) => {
  const body = financeDeliveryConfirmationSchema.extend({
    asAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).parse(req.body);
  return sendFinanceDocument({
    tenantId: tenantId(req),
    actorUserId: req.auth!.userId,
    idempotencyKey: financialIdempotencyKey(req),
    kind: "STATEMENT",
    contactId: routeParam(req, "id"),
    asAt: new Date(`${body.asAt}T23:59:59.999Z`),
  });
}));
api.get("/contacts/:id", requirePermission("crm.read"), wrap(async (req) => {
  const tid = tenantId(req);
  const [contact] = await db.select().from(schema.contacts)
    .where(and(eq(schema.contacts.id, routeParam(req, "id")), eq(schema.contacts.tenantId, tid),
      isNull(schema.contacts.deletedAt)));
  if (!contact) throw notFound("Contact not found");
  const dealRows = await db.select().from(schema.deals)
    .where(and(eq(schema.deals.contactId, contact.id), eq(schema.deals.tenantId, tid)));
  const activityRows = await db.select().from(schema.activities)
    .where(and(eq(schema.activities.contactId, contact.id), eq(schema.activities.tenantId, tid)))
    .orderBy(desc(schema.activities.createdAt)).limit(50);
  const invoiceRows = await db.select().from(schema.invoices)
    .where(and(eq(schema.invoices.contactId, contact.id), eq(schema.invoices.tenantId, tid)))
    .orderBy(desc(schema.invoices.createdAt)).limit(50);
  return { contact, deals: dealRows, activities: activityRows, invoices: invoiceRows };
}));
api.get("/contacts/:id/timeline", requirePermission("crm.read"), wrap(async (req, res) => {
  const tid = tenantId(req);
  const contactId = routeParam(req, "id");
  const query = timelineQuerySchema.parse(req.query);
  const [contact] = await db.select({ id: schema.contacts.id }).from(schema.contacts).where(and(
    eq(schema.contacts.id, contactId), eq(schema.contacts.tenantId, tid), eq(schema.contacts.isCustomer, true),
    isNull(schema.contacts.deletedAt),
  ));
  if (!contact) throw notFound("Customer not found");
  await new CustomerTimelineProjector().reconcileCustomer(tid, contactId);
  res.setHeader("Cache-Control", "private, no-store");
  try {
    return await getCustomerTimeline({ tenantId: tid, contactId, ...query });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_TIMELINE_CURSOR") throw badRequest("Timeline cursor is invalid");
    throw error;
  }
}));

// Supplier is a procurement/finance role projection of the canonical contact.
api.get("/suppliers", requirePermission("inventory.read"), wrap(async (req) =>
  listSuppliers(tenantId(req))));
api.post("/suppliers", requirePermission("inventory.write"), wrap(async (req) =>
  createSupplier({
    tenantId: tenantId(req), actorUserId: req.auth!.userId,
    input: supplierCreateSchema.parse(req.body),
    ip: req.ip,
  })));
api.get("/suppliers/:id", requirePermission("inventory.read"), wrap(async (req) =>
  getSupplier(tenantId(req), routeParam(req, "id"))));
api.patch("/suppliers/:id", requirePermission("inventory.write"), wrap(async (req) =>
  updateSupplier({
    tenantId: tenantId(req), actorUserId: req.auth!.userId, supplierId: routeParam(req, "id"),
    input: supplierUpdateSchema.parse(req.body),
    ip: req.ip,
  })));

const dealSchema = z.object({
  contactId: z.string().uuid(), title: z.string().min(1),
  valueAmount: z.string().default("0"), valueCurrency: z.enum(["USD", "ZWG"]).default("USD"),
  expectedCloseDate: z.coerce.date().optional().nullable(),
});
api.get("/deals", requirePermission("crm.read"), wrap(async (req) =>
  db.select().from(schema.deals).where(eq(schema.deals.tenantId, tenantId(req))).orderBy(desc(schema.deals.createdAt))));
api.post("/deals", requirePermission("crm.write"), wrap(async (req) => {
  const body = dealSchema.parse(req.body);
  const tid = tenantId(req);
  return db.transaction(async (tx) => {
    const [contact] = await tx.select({ id: schema.contacts.id }).from(schema.contacts).where(and(
      eq(schema.contacts.id, body.contactId),
      eq(schema.contacts.tenantId, tid),
      isNull(schema.contacts.deletedAt),
    ));
    if (!contact) throw notFound("Contact not found");
    const [deal] = await tx.insert(schema.deals).values({
      ...body,
      tenantId: tid,
      ownerUserId: req.auth!.userId,
    }).returning();
    return deal;
  });
}));
api.patch("/deals/:id/stage", requirePermission("crm.write"), wrap(async (req) => {
  const { stage } = z.object({ stage: z.enum(["NEW", "QUALIFIED", "PROPOSAL", "WON", "LOST"]) }).parse(req.body);
  const [d] = await db.update(schema.deals).set({ stage })
    .where(and(eq(schema.deals.id, routeParam(req, "id")), eq(schema.deals.tenantId, tenantId(req)))).returning();
  if (!d) throw notFound("Deal not found");
  await audit(db, tenantId(req), req.auth!.userId, "deal.stage_changed", "deal", d.id, { stage });
  return d;
}));
api.post("/activities", requirePermission("crm.write"), wrap(async (req) => {
  const body = z.object({
    contactId: z.string().uuid(), dealId: z.string().uuid().optional().nullable(),
    type: z.enum(["call", "email", "meeting", "note", "task"]), body: z.string().trim().min(1).max(5000),
    dueAt: z.coerce.date().optional().nullable(),
  }).parse(req.body);
  const tid = tenantId(req);
  return runWithPostCommitEvents((queue) => db.transaction(async (tx) => {
    const [contact] = await tx.select({ id: schema.contacts.id }).from(schema.contacts).where(and(
      eq(schema.contacts.id, body.contactId), eq(schema.contacts.tenantId, tid),
    ));
    if (!contact) throw notFound("Contact not found");
    if (body.dealId) {
      const [deal] = await tx.select({ id: schema.deals.id }).from(schema.deals).where(and(
        eq(schema.deals.id, body.dealId), eq(schema.deals.tenantId, tid), eq(schema.deals.contactId, body.contactId),
      ));
      if (!deal) throw notFound("Deal not found");
    }
    const [activity] = await tx.insert(schema.activities).values({
      ...body, tenantId: tid, ownerUserId: req.auth!.userId,
    }).returning();
    await audit(tx, tid, req.auth!.userId, "activity.recorded", "activity", activity.id, {
      contactId: activity.contactId, type: activity.type,
    });
    queue({
      id: `${DOMAIN_EVENTS.ACTIVITY_RECORDED}:${activity.id}`,
      type: DOMAIN_EVENTS.ACTIVITY_RECORDED,
      tenantId: tid,
      actorUserId: req.auth!.userId,
      payload: { activityId: activity.id, customerId: activity.contactId },
    });
    return activity;
  }));
}));

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------
const positiveStockQuantitySchema = z.string().trim()
  .regex(/^(?:0*[1-9]\d*)(?:\.\d{1,3})?$|^0*\.\d{1,3}$/, "Quantity must be positive with no more than 3 decimal places")
  .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 1_000_000,
    "Quantity must be between 0.001 and 1,000,000");
const positiveMoneySchema = z.string().trim()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, "Unit cost must use no more than 2 decimal places")
  .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 1_000_000_000,
    "Unit cost must be between 0.01 and 1,000,000,000");
const openingStockSchema = z.object({
  warehouseId: z.string().uuid(),
  quantity: positiveStockQuantitySchema,
  unitCost: positiveMoneySchema,
}).strict();
const productSchema = z.object({
  sku: z.string().trim().min(1).max(64), name: z.string().trim().min(1).max(200), description: z.string().max(5000).optional().nullable(),
  unitOfMeasure: z.string().trim().min(1).max(40).default("unit"),
  costPrice: z.string().default("0"), salePrice: z.string().default("0"),
  currency: z.enum(["USD", "ZWG"]).default("USD"),
  taxTreatment: z.enum(["standard", "zero-rated", "exempt"]).default("standard"),
  taxRate: z.string().optional(),
  reorderLevel: z.number().int().min(0).default(0), trackStock: z.boolean().default(true),
  openingStock: openingStockSchema.optional(),
}).strict().superRefine((body, context) => {
  if (body.openingStock && !body.trackStock) {
    context.addIssue({ code: "custom", path: ["openingStock"], message: "Opening stock is only available for physical stock products" });
  }
});
api.get("/products", requirePermission("inventory.read"), wrap(async (req) => {
  const rows = await db.execute(sql`
    SELECT p.*, COALESCE(SUM(sl.quantity_on_hand), 0) AS on_hand
    FROM products p LEFT JOIN stock_levels sl ON sl.product_id = p.id
    WHERE p.tenant_id = ${tenantId(req)} GROUP BY p.id ORDER BY p.name`);
  return (rows as any).rows;
}));
api.post("/products", requirePermission("inventory.write"), wrap(async (req) => {
  const body = productSchema.parse(req.body);
  const tid = tenantId(req);
  return runWithPostCommitEvents((queue) => db.transaction(async (tx) => {
    const [tenant] = await tx.select().from(schema.tenants).where(eq(schema.tenants.id, tid));
    if (!tenant) throw notFound("Tenant not found");
    const resolution = resolveTax(tenant.countryCode, body.taxTreatment, todayIsoDate());
    assertCompatibleTaxRate(body.taxRate, resolution);
    const { openingStock, ...productInput } = body;
    const [p] = await tx.insert(schema.products).values({
      ...productInput,
      tenantId: tid,
      taxRate: taxRateString(resolution),
      taxTreatment: body.taxTreatment,
    }).returning();
    await audit(tx, tid, req.auth!.userId, "product.created", "product", p.id, {
      taxTreatment: p.taxTreatment,
      taxRate: p.taxRate,
      taxJurisdiction: tenant.countryCode,
    });
    await autoAuditMutation(tx, {
      tenantId: tid, actorId: req.auth!.userId, actorType: "user",
      action: "product.created", objectType: "Product", objectId: p.id,
      before: null, after: p, ip: req.ip,
    });
    queue({ id: `${DOMAIN_EVENTS.PRODUCT_CHANGED}:${p.id}:created`, type: DOMAIN_EVENTS.PRODUCT_CHANGED,
      tenantId: tid, actorUserId: req.auth!.userId, payload: { productId: p.id, change: "created" } });
    queue({ id: `${DOMAIN_EVENTS.PRODUCT_CREATED}:${p.id}`, type: DOMAIN_EVENTS.PRODUCT_CREATED,
      tenantId: tid, actorUserId: req.auth!.userId, payload: { productId: p.id } });
    if (openingStock) {
      const opening = await recordOpeningStock(tx, {
        tenantId: tid,
        productId: p.id,
        warehouseId: openingStock.warehouseId,
        quantity: openingStock.quantity,
        unitCost: openingStock.unitCost,
        createdBy: req.auth!.userId,
        sourceType: "product_setup",
        sourceId: p.id,
      });
      queue({
        id: `${DOMAIN_EVENTS.STOCK_MOVED}:${opening.movementId}`,
        type: DOMAIN_EVENTS.STOCK_MOVED,
        tenantId: tid,
        actorUserId: req.auth!.userId,
        payload: {
          movementId: opening.movementId,
          productId: p.id,
          warehouseId: openingStock.warehouseId,
          quantityDelta: openingStock.quantity,
          kind: "OPENING",
        },
      });
    }
    return p;
  }));
}));
api.patch("/products/:id/reorder-rule", requirePermission("inventory.write"), wrap(async (req) => {
  const { reorderLevel } = z.object({
    reorderLevel: z.number().int().min(0).max(1_000_000),
  }).strict().parse(req.body);
  const tid = tenantId(req);
  const productId = z.string().uuid().parse(routeParam(req, "id"));
  return runWithPostCommitEvents((queue) => db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.products).where(and(
      eq(schema.products.id, productId), eq(schema.products.tenantId, tid),
    ));
    if (!existing) throw notFound("Product not found");
    const [product] = await tx.update(schema.products).set({ reorderLevel }).where(and(
      eq(schema.products.id, existing.id), eq(schema.products.tenantId, tid),
    )).returning();
    await audit(tx, tid, req.auth!.userId, "inventory.reorder_rule_changed", "product", product.id, {
      previousReorderLevel: existing.reorderLevel,
      reorderLevel: product.reorderLevel,
      alertsEnabled: product.reorderLevel > 0 && product.trackStock && product.isActive,
    });
    await autoAuditMutation(tx, {
      tenantId: tid, actorId: req.auth!.userId, actorType: "user",
      action: "product.updated", objectType: "Product", objectId: product.id,
      before: existing, after: product, ip: req.ip,
    });
    queue({
      id: `${DOMAIN_EVENTS.PRODUCT_CHANGED}:${product.id}:updated:${product.reorderLevel}`,
      type: DOMAIN_EVENTS.PRODUCT_CHANGED,
      tenantId: tid,
      actorUserId: req.auth!.userId,
      payload: { productId: product.id, change: "updated" },
    });
    return product;
  }));
}));
api.get("/warehouses", requirePermission("inventory.read"), wrap(async (req) =>
  db.select().from(schema.warehouses).where(eq(schema.warehouses.tenantId, tenantId(req)))));
api.post("/warehouses", requirePermission("inventory.write"), wrap(async (req) => {
  const result = await createWarehouse({
    tenantId: tenantId(req), actorUserId: req.auth!.userId,
    input: warehouseCreateSchema.parse(req.body),
  });
  return result.warehouse;
}));
api.get("/settings/warehouses",
  requireAnyPermission("settings.manage", "inventory.read", "inventory.write"),
  wrap(async (req) => getWarehouseSettings(tenantId(req))));
api.post("/settings/warehouses",
  requireAnyPermission("settings.manage", "inventory.write"),
  wrap(async (req) => createWarehouse({
    tenantId: tenantId(req), actorUserId: req.auth!.userId,
    input: warehouseCreateSchema.parse(req.body),
  })));
api.patch("/settings/warehouses/:id",
  requireAnyPermission("settings.manage", "inventory.write"),
  wrap(async (req) => updateWarehouse({
    tenantId: tenantId(req), actorUserId: req.auth!.userId,
    warehouseId: uuidRouteParam(req, "id"), input: warehouseUpdateSchema.parse(req.body),
  })));
api.post("/stock/adjust", requirePermission("inventory.write"), wrap(async (req) => {
  const body = z.object({
    productId: z.string().uuid(), warehouseId: z.string().uuid(),
    quantityDelta: z.string(), note: z.string().min(3), idempotencyKey: z.string().trim().min(8).max(120).optional(),
  }).parse(req.body);
  const idempotencyKey = financialIdempotencyKey(req, body.idempotencyKey);
  const tid = tenantId(req);
  return runWithPostCommitEvents((queue) => db.transaction(async (tx) => {
    const result = await adjustStock(tx, { ...body, idempotencyKey, tenantId: tid, createdBy: req.auth!.userId });
    queue({ id: `${DOMAIN_EVENTS.STOCK_MOVED}:${result.movementId}`, type: DOMAIN_EVENTS.STOCK_MOVED, tenantId: tid, actorUserId: req.auth!.userId,
      payload: { movementId: result.movementId, productId: body.productId, warehouseId: body.warehouseId, quantityDelta: body.quantityDelta, kind: "ADJUSTMENT" } });
    queue({ id: `${DOMAIN_EVENTS.STOCK_ADJUSTED}:${result.movementId}`, type: DOMAIN_EVENTS.STOCK_ADJUSTED, tenantId: tid, actorUserId: req.auth!.userId,
      payload: { movementId: result.movementId, productId: body.productId, warehouseId: body.warehouseId, quantityDelta: body.quantityDelta } });
    return result;
  }));
}));
api.post("/stock/opening", requirePermission("inventory.write"), wrap(async (req) => {
  // Opening balances: stock in + Dr Inventory / Cr Opening Balance Equity
  const body = openingStockSchema.extend({ productId: z.string().uuid() }).strict().parse(req.body);
  const tid = tenantId(req);
  return runWithPostCommitEvents((queue) => db.transaction(async (tx) => {
    const r = await recordOpeningStock(tx, {
      tenantId: tid,
      productId: body.productId,
      warehouseId: body.warehouseId,
      quantity: body.quantity,
      unitCost: body.unitCost,
      createdBy: req.auth!.userId,
    });
    queue({ id: `${DOMAIN_EVENTS.STOCK_MOVED}:${r.movementId}`, type: DOMAIN_EVENTS.STOCK_MOVED, tenantId: tid, actorUserId: req.auth!.userId,
      payload: { movementId: r.movementId, productId: body.productId, warehouseId: body.warehouseId, quantityDelta: body.quantity, kind: "OPENING" } });
    return r;
  }));
}));
api.get("/stock/movements", requirePermission("inventory.read"), wrap(async (req) =>
  db.select().from(schema.stockMovements).where(eq(schema.stockMovements.tenantId, tenantId(req)))
    .orderBy(desc(schema.stockMovements.createdAt)).limit(200)));

api.get("/purchase-requisitions", requirePermission("procurement.read"), wrap(async (req) =>
  listPurchaseRequisitions(tenantId(req))));
api.get("/procurement/reference-data", requirePermission("procurement.read"), wrap(async (req) =>
  getProcurementReferenceData(tenantId(req))));
api.post("/purchase-requisitions", requirePermission("procurement.request"), wrap(async (req) =>
  createPurchaseRequisition({
    tenantId: tenantId(req), actorUserId: req.auth!.userId,
    input: purchaseRequisitionCreateSchema.parse(req.body),
  })));
api.post("/purchase-requisitions/:id/decision", requirePermission("procurement.approve"), wrap(async (req) =>
  decidePurchaseRequisition({
    tenantId: tenantId(req), actorUserId: req.auth!.userId,
    requisitionId: uuidRouteParam(req, "id"), input: requisitionDecisionSchema.parse(req.body),
  })));

api.get("/request-for-quotes", requirePermission("procurement.read"), wrap(async (req) =>
  listRequestForQuotes(tenantId(req))));
api.post("/request-for-quotes", requirePermission("procurement.write"), wrap(async (req) =>
  createRequestForQuote({
    tenantId: tenantId(req), actorUserId: req.auth!.userId,
    input: requestForQuoteCreateSchema.parse(req.body),
  })));
api.post("/request-for-quotes/:id/award", requirePermission("procurement.write"), wrap(async (req) =>
  awardRequestForQuote({
    tenantId: tenantId(req), actorUserId: req.auth!.userId,
    requestForQuoteId: uuidRouteParam(req, "id"), input: requestForQuoteAwardSchema.parse(req.body),
  })));

api.post("/purchase-orders", requirePermission("procurement.write"), wrap(async (req) =>
  createDirectPurchaseOrder({
    tenantId: tenantId(req), actorUserId: req.auth!.userId,
    input: directPurchaseOrderSchema.parse(req.body),
  })));
api.get("/purchase-orders", requirePermission("procurement.read"), wrap(async (req) =>
  listPurchaseOrders(tenantId(req))));
api.post("/purchase-orders/:id/approve", requirePermission("procurement.approve"), wrap(async (req) =>
  approvePurchaseOrder({
    tenantId: tenantId(req), actorUserId: req.auth!.userId,
    actorPermissions: req.auth!.permissions,
    purchaseOrderId: uuidRouteParam(req, "id"),
    reason: purchaseOrderApprovalSchema.parse(req.body).reason,
  })));
api.post("/purchase-orders/:id/receipts", requirePermission("procurement.receive"), wrap(async (req) =>
  postGoodsReceipt({
    tenantId: tenantId(req), actorUserId: req.auth!.userId,
    purchaseOrderId: uuidRouteParam(req, "id"),
    idempotencyKey: requireIdempotencyKey(req.header("Idempotency-Key")),
    input: goodsReceiptSchema.parse(req.body),
  })));
api.get("/goods-receipts", requirePermission("procurement.read"), wrap(async (req) =>
  listGoodsReceipts(tenantId(req))));

api.get("/supplier-bills", requireAnyPermission("procurement.read", "accounting.read"), wrap(async (req) =>
  listSupplierBills(tenantId(req))));
api.get("/supplier-bills/:id", requireAnyPermission("procurement.read", "accounting.read"), wrap(async (req) =>
  getSupplierBill(tenantId(req), uuidRouteParam(req, "id"))));
api.get("/supplier-bills/:id/match", requireAnyPermission("procurement.read", "accounting.read"), wrap(async (req) =>
  evaluateSupplierBillMatch(tenantId(req), uuidRouteParam(req, "id"))));
api.get("/reports/supplier-performance", requireAnyPermission("procurement.read", "accounting.read", "reports.read"), wrap(async (req, res) => {
  const report = await getSupplierAnalytics({
    tenantId: tenantId(req), query: supplierAnalyticsQuerySchema.parse(req.query),
  });
  res.setHeader("Cache-Control", "private, no-store");
  return report;
}));
api.post("/supplier-bills", requirePermission("accounting.post"), wrap(async (req) =>
  createSupplierBill({ tenantId: tenantId(req), actorUserId: req.auth!.userId,
    input: supplierBillCreateSchema.parse(req.body) })));
api.put("/supplier-bills/:id", requirePermission("accounting.post"), wrap(async (req) =>
  updateSupplierBill({ tenantId: tenantId(req), actorUserId: req.auth!.userId,
    billId: uuidRouteParam(req, "id"), input: supplierBillUpdateSchema.parse(req.body) })));
api.post("/supplier-bills/:id/post", requirePermission("accounting.post"), wrap(async (req) =>
  postSupplierBill({ tenantId: tenantId(req), actorUserId: req.auth!.userId, ...supplierBillPostSchema.parse(req.body),
    billId: uuidRouteParam(req, "id"), idempotencyKey: requireIdempotencyKey(req.header("Idempotency-Key")) })));

// ---------------------------------------------------------------------------
// Accounting
// ---------------------------------------------------------------------------
api.get("/accounts", requirePermission("accounting.read"), wrap(async (req) =>
  db.select().from(schema.accounts).where(eq(schema.accounts.tenantId, tenantId(req))).orderBy(schema.accounts.code)));

api.get("/exchange-rates", requirePermission("accounting.read"), wrap(async (req) =>
  db.select().from(schema.exchangeRates).where(eq(schema.exchangeRates.tenantId, tenantId(req)))
    .orderBy(desc(schema.exchangeRates.effectiveDate)).limit(30)));
api.post("/exchange-rates", requirePermission("accounting.post"), wrap(async (req) => {
  const body = z.object({
    fromCurrency: z.enum(["USD", "ZWG"]), toCurrency: z.enum(["USD", "ZWG"]),
    rate: z.string(), effectiveDate: z.coerce.date(),
  }).parse(req.body);
  if (body.fromCurrency === body.toCurrency) throw badRequest("Currencies must differ");
  const [r] = await db.insert(schema.exchangeRates).values({ ...body, tenantId: tenantId(req) }).returning();
  await audit(db, tenantId(req), req.auth!.userId, "exchange_rate.set", "exchange_rate", r.id, body);
  return r;
}));

const invoiceSchema = z.object({
  contactId: z.string().uuid(), currency: z.enum(["USD", "ZWG"]),
  rateToBase: z.string().default("1"), dueDate: z.coerce.date().optional().nullable(),
  notes: z.string().optional().nullable(), dealId: z.string().uuid().optional(),
  taxDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  lines: z.array(z.object({
    productId: z.string().uuid().optional(), warehouseId: z.string().uuid().optional(),
    description: z.string().min(1), quantity: z.string(), unitPrice: z.string(),
    taxTreatment: z.enum(["standard", "zero-rated", "exempt"]).default("standard"),
    taxRate: z.string().optional(),
  })).min(1),
});
api.get("/invoices", requirePermission("accounting.read"), wrap(async (req) => {
  const rows = await db.execute(sql`
    SELECT i.*, c.name AS contact_name, c.email AS contact_email, c.phone AS contact_phone FROM invoices i
    JOIN contacts c ON c.id = i.contact_id
    WHERE i.tenant_id = ${tenantId(req)} ORDER BY i.created_at DESC LIMIT 200`);
  return (rows as any).rows;
}));
api.get("/invoices/:id", requirePermission("accounting.read"), wrap(async (req) => {
  const tid = tenantId(req);
  const [inv] = await db.select().from(schema.invoices)
    .where(and(eq(schema.invoices.id, routeParam(req, "id")), eq(schema.invoices.tenantId, tid)));
  if (!inv) throw notFound("Invoice not found");
  const lines = await db.select().from(schema.invoiceLineItems).where(eq(schema.invoiceLineItems.invoiceId, inv.id));
  const pays = await db.select().from(schema.payments).where(eq(schema.payments.invoiceId, inv.id));
  const [contact] = await db.select({
    id: schema.contacts.id, name: schema.contacts.name, email: schema.contacts.email, phone: schema.contacts.phone,
  }).from(schema.contacts).where(and(
    eq(schema.contacts.id, inv.contactId), eq(schema.contacts.tenantId, tid),
  ));
  return { ...inv, contact: contact ?? null, lines, payments: pays };
}));
api.get("/invoices/:id/pdf", requirePermission("accounting.read"), async (req, res, next) => {
  try {
    const request = req as AuthedRequest;
    const invoiceId = routeParam(request, "id");
    const document = await platformKernel().container.get(DOCUMENT_SERVICE).get(
      invoicePdfDocumentId(invoiceId),
      { tenantId: tenantId(request), actorUserId: request.auth!.userId },
    );
    if (!document) throw notFound("Issued invoice document is not available");
    await audit(db, tenantId(req as AuthedRequest), (req as AuthedRequest).auth!.userId,
      "invoice.downloaded", "invoice", invoiceId, { templateVersion: document.descriptor.version });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="invoice-${invoiceId}.pdf"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Length", String(document.bytes.byteLength));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(Buffer.from(document.bytes));
  } catch (error) { next(error); }
});
api.post("/invoices/:id/send", requirePermission("accounting.post"), wrap(async (req) => {
  financeDeliveryConfirmationSchema.parse(req.body);
  return sendFinanceDocument({
    tenantId: tenantId(req),
    actorUserId: req.auth!.userId,
    idempotencyKey: financialIdempotencyKey(req),
    kind: "INVOICE",
    invoiceId: routeParam(req, "id"),
  });
}));
api.post("/invoices/:id/payment-reminders/send", requirePermission("accounting.post"), wrap(async (req) => {
  financeDeliveryConfirmationSchema.parse(req.body);
  return sendFinanceDocument({
    tenantId: tenantId(req),
    actorUserId: req.auth!.userId,
    idempotencyKey: financialIdempotencyKey(req),
    kind: "PAYMENT_REMINDER",
    invoiceId: routeParam(req, "id"),
  });
}));
api.post("/invoices/:id/share-links", requirePermission("accounting.post"), wrap(async (req) => {
  const body = z.object({ expiresInDays: z.number().int().min(1).max(30).default(14) }).parse(req.body);
  return createInvoiceShareLink({
    tenantId: tenantId(req),
    invoiceId: routeParam(req, "id"),
    actorUserId: req.auth!.userId,
    expiresInDays: body.expiresInDays,
  });
}));
api.get("/invoices/:id/share-links", requirePermission("accounting.read"), wrap(async (req) =>
  listInvoiceShareLinks({ tenantId: tenantId(req), invoiceId: routeParam(req, "id") })));
api.delete("/invoices/:id/share-links/:linkId", requirePermission("accounting.post"), wrap(async (req) =>
  revokeInvoiceShareLink({
    tenantId: tenantId(req),
    invoiceId: routeParam(req, "id"),
    shareLinkId: routeParam(req, "linkId"),
    actorUserId: req.auth!.userId,
  })));
api.post("/invoices", requirePermission("accounting.post"), wrap(async (req) => {
  const body = invoiceSchema.parse(req.body);
  return createDraftInvoice({ ...body, tenantId: tenantId(req), createdBy: req.auth!.userId,
    dueDate: body.dueDate ?? undefined, notes: body.notes ?? undefined });
}));
api.patch("/invoices/:id", requirePermission("accounting.post"), wrap(async (req) => {
  const body = invoiceSchema.omit({ dealId: true }).parse(req.body);
  return updateDraftInvoice({
    ...body,
    tenantId: tenantId(req),
    invoiceId: routeParam(req, "id"),
    updatedBy: req.auth!.userId,
    dueDate: body.dueDate ?? null,
    notes: body.notes ?? null,
  });
}));
api.post("/invoices/:id/issue", requirePermission("accounting.post"), wrap(async (req) => {
  const issued = await issueInvoice({
    tenantId: tenantId(req), invoiceId: routeParam(req, "id"), createdBy: req.auth!.userId,
    approvalIdentity: platformKernel().container.get(IDENTITY_FACTORY).for(req.auth),
  });
  logEvent("invoice.posted", {
    requestId: req.requestId ?? null,
    tenantId: tenantId(req),
    userId: req.auth!.userId,
    invoiceId: issued.id,
  });
  return issued;
}));
api.post("/invoices/:id/payments", requirePermission("accounting.post"), wrap(async (req) => {
  const body = z.object({
    amount: z.string(), bankAccountId: z.string().uuid().optional(),
    date: z.coerce.date().optional(), reference: z.string().optional(),
    idempotencyKey: z.string().trim().min(8).max(120).optional(),
  }).parse(req.body);
  const idempotencyKey = financialIdempotencyKey(req, body.idempotencyKey);
  return recordPayment({ ...body, idempotencyKey, tenantId: tenantId(req), invoiceId: routeParam(req, "id"), createdBy: req.auth!.userId });
}));
api.post("/invoices/:id/void", requirePermission("accounting.post"), wrap(async (req) => {
  const { reason } = z.object({ reason: z.string().min(3) }).parse(req.body);
  return voidInvoice({ tenantId: tenantId(req), invoiceId: routeParam(req, "id"), reason, createdBy: req.auth!.userId });
}));

api.post("/expenses", requirePermission("accounting.post"), wrap(async (req) => {
  const body = z.object({
    categoryAccountId: z.string().uuid(), vendorContactId: z.string().uuid().optional().nullable(),
    amount: z.string(), currency: z.enum(["USD", "ZWG"]), rateToBase: z.string().default("1"),
    date: z.coerce.date(), description: z.string().min(1),
    idempotencyKey: z.string().trim().min(8).max(120).optional(),
  }).parse(req.body);
  const tid = tenantId(req);
  const idempotencyKey = financialIdempotencyKey(req, body.idempotencyKey);
  const fingerprint = payloadFingerprint({
    action: "expense",
    categoryAccountId: body.categoryAccountId,
    vendorContactId: body.vendorContactId ?? null,
    amount: body.amount,
    currency: body.currency,
    rateToBase: body.rateToBase,
    date: body.date.toISOString(),
    description: body.description,
  });
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.expenses).where(and(
      eq(schema.expenses.tenantId, tid),
      eq(schema.expenses.idempotencyKey, idempotencyKey),
    ));
    if (existing) {
      assertIdempotencyFingerprint(existing.idempotencyFingerprint, fingerprint, "expense");
      return existing;
    }
    const [categoryAccount] = await tx.select({ id: schema.accounts.id })
      .from(schema.accounts).where(and(
        eq(schema.accounts.id, body.categoryAccountId),
        eq(schema.accounts.tenantId, tid),
        eq(schema.accounts.type, "EXPENSE"),
        eq(schema.accounts.isActive, true),
      ));
    if (!categoryAccount) throw notFound("Expense category account not found");
    if (body.vendorContactId) {
      await assertActiveSupplier(tx, tid, body.vendorContactId);
    }
    const [exp] = await tx.insert(schema.expenses).values({
      ...body,
      tenantId: tid,
      idempotencyKey,
      idempotencyFingerprint: fingerprint,
      createdBy: req.auth!.userId,
    }).returning();
    const { toCents, fromCents, mulRate } = await import("./lib.js");
    const { systemAccount, postJournal } = await import("./accounting.js");
    const bank = await systemAccount(tx, tid, "BANK");
    const base = fromCents(mulRate(toCents(body.amount), body.rateToBase));
    await postJournal(tx, {
      tenantId: tid, date: body.date, memo: `Expense — ${body.description}`,
      sourceType: "expense", sourceId: exp.id, createdBy: req.auth!.userId,
      lines: [
        { accountId: body.categoryAccountId, debit: base, originalAmount: body.amount, originalCurrency: body.currency, exchangeRate: body.rateToBase },
        { accountId: bank.id, credit: base },
      ],
    });
    await audit(tx, tid, req.auth!.userId, "expense.recorded", "expense", exp.id, { amount: body.amount, currency: body.currency });
    return exp;
  });
}));
api.get("/expenses", requirePermission("accounting.read"), wrap(async (req) =>
  db.select().from(schema.expenses).where(eq(schema.expenses.tenantId, tenantId(req)))
    .orderBy(desc(schema.expenses.date)).limit(200)));

// ---------------------------------------------------------------------------
// P2-005: financial period close. Closing locks a month against every journal
// posting; corrections are offsetting entries in an open period. Reopening is
// restricted to the accountable Owner and fully audited.
// ---------------------------------------------------------------------------
api.get("/accounting/periods", requirePermission("accounting.read"), wrap(async (req) =>
  listAccountingPeriods(tenantId(req))));
api.post("/accounting/periods/close", requirePermission("accounting.post"), wrap(async (req) => {
  const body = z.object({ month: periodMonthSchema, reason: periodReasonSchema }).parse(req.body);
  return closeAccountingPeriod({
    tenantId: tenantId(req), actorUserId: req.auth!.userId,
    month: body.month, reason: body.reason,
  });
}));
api.post("/accounting/periods/:id/reopen",
  requirePermission("accounting.post"), requireTenantOwner as any, wrap(async (req) => {
    const body = z.object({ reason: periodReasonSchema }).parse(req.body);
    return reopenAccountingPeriod({
      tenantId: tenantId(req), actorUserId: req.auth!.userId,
      periodId: uuidRouteParam(req, "id"), reason: body.reason,
    });
  }));

// ---------------------------------------------------------------------------
// PW-003/004: tenant task centre + opt-in event automation. Tasks are
// operational work items (never financial writes); every close is audited.
// The whole surface ships dark behind the `workflow.centre` feature flag
// (FLAG-002 build-dark rule) — fail closed with FEATURE_DISABLED until a
// platform admin enables it per tenant.
// ---------------------------------------------------------------------------
api.get("/tasks", requireFeature("workflow.centre"), wrap(async (req) => {
  const status = z.enum(["OPEN", "DONE", "DISMISSED", "ALL"]).optional()
    .parse(req.query.status as string | undefined) ?? "OPEN";
  return listTasks(tenantId(req), status);
}));
api.post("/tasks", requireFeature("workflow.centre"), wrap(async (req) => {
  const input = manualTaskSchema.parse(req.body);
  return createManualTask(tenantId(req), req.auth!.userId, input);
}));
api.post("/tasks/:id/close", requireFeature("workflow.centre"), wrap(async (req) => {
  const body = closeTaskSchema.parse(req.body);
  return closeTask(tenantId(req), req.auth!.userId, uuidRouteParam(req, "id"), body.outcome);
}));
api.get("/settings/automation-rules", requireFeature("workflow.centre"),
  requirePermission("settings.manage"), wrap(async (req) =>
    listAutomationRules(tenantId(req))));
api.put("/settings/automation-rules/:key", requireFeature("workflow.centre"),
  requirePermission("settings.manage"), wrap(async (req) => {
    const key = automationRuleKeySchema.parse(routeParam(req, "key"));
    const body = z.object({ enabled: z.boolean() }).parse(req.body);
    return setAutomationRule(tenantId(req), req.auth!.userId, key, body.enabled);
  }));

// ---------------------------------------------------------------------------
// PD-001: documents workspace — folders, versioned uploads, classification.
// Binary reads go through the kernel document service (`workspace-doc` kind);
// uploads share the capture envelope (PNG/JPEG/PDF, ≤1.5 MB, protected at
// rest). The whole surface ships dark behind `documents.workspace` and fails
// closed with FEATURE_DISABLED until a platform admin enables it per tenant.
// Fixed paths are registered before "/documents/:id" so they never shadow.
// ---------------------------------------------------------------------------
api.get("/documents/folders", requireFeature("documents.workspace"),
  requirePermission("documents.read"), wrap(async (req) =>
    listFolders(tenantId(req))));
api.post("/documents/folders", requireFeature("documents.workspace"),
  requirePermission("documents.manage"), wrap(async (req) =>
    createFolder(tenantId(req), req.auth!.userId, folderSchema.parse(req.body))));
api.get("/documents", requireFeature("documents.workspace"),
  requirePermission("documents.read"), wrap(async (req) => {
    const status = documentStatusFilterSchema.optional()
      .parse(req.query.status as string | undefined) ?? "ACTIVE";
    const folderId = z.string().uuid().optional()
      .parse(req.query.folderId as string | undefined);
    return listDocuments(tenantId(req), { folderId, status });
  }));
api.post("/documents", requireFeature("documents.workspace"),
  requirePermission("documents.manage"), wrap(async (req) =>
    createDocument(tenantId(req), req.auth!.userId, createDocumentSchema.parse(req.body))));
api.post("/documents/:id/versions", requireFeature("documents.workspace"),
  requirePermission("documents.manage"), wrap(async (req) =>
    addDocumentVersion(tenantId(req), req.auth!.userId,
      uuidRouteParam(req, "id"), addVersionSchema.parse(req.body))));
api.get("/documents/:id/content", requireFeature("documents.workspace"),
  requirePermission("documents.read"), wrap(async (req, res) => {
    const tid = tenantId(req);
    const version = versionQuerySchema.parse(req.query.version as string | undefined);
    const versionId = await resolveVersionId(tid, uuidRouteParam(req, "id"), version);
    const document = await platformKernel().container.get(DOCUMENT_SERVICE).get(
      workspaceDocumentVersionId(versionId), { tenantId: tid, actorUserId: req.auth!.userId });
    if (!document) throw notFound("Document version not found");
    res.setHeader("Cache-Control", "no-store");
    return {
      fileName: document.descriptor.fileName,
      mediaType: document.descriptor.mediaType,
      byteSize: document.descriptor.byteSize,
      version: Number(document.descriptor.version),
      dataUrl: documentDataUrl(document),
    };
  }));
api.post("/documents/:id/archive", requireFeature("documents.workspace"),
  requirePermission("documents.manage"), wrap(async (req) =>
    setDocumentStatus(tenantId(req), req.auth!.userId, uuidRouteParam(req, "id"), "ARCHIVED")));
api.post("/documents/:id/restore", requireFeature("documents.workspace"),
  requirePermission("documents.manage"), wrap(async (req) =>
    setDocumentStatus(tenantId(req), req.auth!.userId, uuidRouteParam(req, "id"), "ACTIVE")));
api.get("/documents/:id", requireFeature("documents.workspace"),
  requirePermission("documents.read"), wrap(async (req) =>
    getDocument(tenantId(req), uuidRouteParam(req, "id"))));

// PD-002: approvals (second-person rule) + retention.
api.get("/documents/approvals/list", requireFeature("documents.workspace"),
  requirePermission("documents.read"), wrap(async (req) =>
    listApprovals(tenantId(req),
      z.enum(["PENDING", "APPROVED", "REJECTED"]).optional()
        .parse(req.query.status as string | undefined))));
api.post("/documents/:id/approvals", requireFeature("documents.workspace"),
  requirePermission("documents.manage"), wrap(async (req) =>
    requestApproval(tenantId(req), req.auth!.userId, uuidRouteParam(req, "id"),
      approvalRequestSchema.parse(req.body ?? {}).note)));
api.post("/documents/approvals/:approvalId/decide", requireFeature("documents.workspace"),
  requirePermission("documents.manage"), wrap(async (req) => {
    const body = approvalDecisionSchema.parse(req.body);
    return decideApproval(tenantId(req), req.auth!.userId,
      uuidRouteParam(req, "approvalId"), body.decision, body.note);
  }));
api.put("/documents/:id/retention", requireFeature("documents.workspace"),
  requirePermission("documents.manage"), wrap(async (req) =>
    setRetention(tenantId(req), req.auth!.userId, uuidRouteParam(req, "id"),
      retentionSchema.parse(req.body).retentionUntil)));

// ---------------------------------------------------------------------------
// PB-001/PB-003: Black Book registry reads and universal-search projection.
// Ships dark behind `blackbook.directory`; fails closed with FEATURE_DISABLED.
// Reads are open to any authenticated tenant member (reference data), and
// every detail response carries sources + review date (directory, not advice).
// ---------------------------------------------------------------------------
api.get("/blackbook/search", requireFeature("blackbook.directory"), wrap(async (req, res) => {
  const query = searchQuerySchema.parse({
    q: req.query.q,
    limit: req.query.limit,
    cursor: req.query.cursor,
    entityTypes: ["blackbook"],
  });
  let result;
  try {
    result = await platformKernel().container.get(SEARCH_SERVICE).search<SearchResultDocument>({
      text: query.q,
      limit: query.limit,
      cursor: query.cursor,
      entityTypes: query.entityTypes,
    }, {
      tenantId: tenantId(req),
      actorUserId: req.auth!.userId,
      permissions: req.auth!.permissions,
    });
  } catch (error) {
    if (error instanceof InvalidSearchQueryError) throw badRequest(error.message);
    throw error;
  }
  res.setHeader("Cache-Control", "private, no-store");
  return result;
}));
api.get("/blackbook/entries", requireFeature("blackbook.directory"), wrap(async (req) =>
  listBlackbookEntries(listBlackbookEntriesQuerySchema.parse({
    category: req.query.category as string | undefined,
    q: req.query.q as string | undefined,
    country: (req.query.country as string | undefined) ?? "ZW",
  }))));
api.get("/blackbook/entries/:key", requireFeature("blackbook.directory"), wrap(async (req) => {
  const key = z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).parse(routeParam(req, "key"));
  const country = z.string().trim().regex(/^[A-Z]{2}$/).default("ZW")
    .parse((req.query.country as string | undefined) ?? "ZW");
  return getBlackbookEntry(country, key);
}));

// ---------------------------------------------------------------------------
// PV-001: verification evidence vault. Typed, expiring references into the
// PD-001 documents workspace with an append-only renewal chain. Ships dark
// behind `verify.centre`; fails closed. Review/badges arrive with PV-002 —
// nothing here asserts that a business "is verified".
// ---------------------------------------------------------------------------
api.get("/verification/evidence", requireFeature("verify.centre"),
  requirePermission("verify.read"), wrap(async (req) =>
    listEvidence(tenantId(req), {
      status: evidenceStatusFilterSchema.optional()
        .parse(req.query.status as string | undefined) ?? "ACTIVE",
    })));
api.post("/verification/evidence", requireFeature("verify.centre"),
  requirePermission("verify.manage"), wrap(async (req) =>
    addEvidence(tenantId(req), req.auth!.userId, addEvidenceSchema.parse(req.body))));
api.get("/verification/evidence/:id", requireFeature("verify.centre"),
  requirePermission("verify.read"), wrap(async (req) =>
    getEvidence(tenantId(req), uuidRouteParam(req, "id"))));
api.post("/verification/evidence/:id/renew", requireFeature("verify.centre"),
  requirePermission("verify.manage"), wrap(async (req) =>
    renewEvidence(tenantId(req), req.auth!.userId, uuidRouteParam(req, "id"),
      renewEvidenceSchema.parse(req.body))));
api.post("/verification/evidence/:id/withdraw", requireFeature("verify.centre"),
  requirePermission("verify.manage"), wrap(async (req) =>
    withdrawEvidence(tenantId(req), req.auth!.userId, uuidRouteParam(req, "id"),
      withdrawEvidenceSchema.parse(req.body).reason)));

// PV-002: one tenant request at a time. Submission atomically freezes the
// complete ACTIVE evidence set; status never exposes platform reviewer ids.
api.get("/verification/status", requireFeature("verify.centre"),
  requirePermission("verify.read"), wrap(async (req) =>
    getVerificationStatus(tenantId(req))));
api.post("/verification/requests", requireFeature("verify.centre"),
  requirePermission("verify.manage"), wrap(async (req) =>
    createVerificationDraft(tenantId(req), req.auth!.userId)));
api.post("/verification/requests/:id/submit", requireFeature("verify.centre"),
  requirePermission("verify.manage"), wrap(async (req) =>
    submitVerificationRequest(tenantId(req), req.auth!.userId, uuidRouteParam(req, "id"))));

// ---------------------------------------------------------------------------
// PN-001: opt-in public business profile. Nothing public by default; edits
// stay private; only the tenant OWNER can publish (freezes the snapshot the
// PN-002 directory will read) or unpublish (removes it immediately). Ships
// dark behind `network.directory` and fails closed.
// ---------------------------------------------------------------------------
api.get("/network/profile", requireFeature("network.directory"),
  requirePermission("settings.manage"), wrap(async (req) =>
    getMyProfile(tenantId(req))));
api.put("/network/profile", requireFeature("network.directory"),
  requirePermission("settings.manage"), wrap(async (req) =>
    saveProfile(tenantId(req), req.auth!.userId, profileInputSchema.parse(req.body))));
api.post("/network/profile/publish", requireFeature("network.directory"),
  requireTenantOwner as any, wrap(async (req) =>
    publishProfile(tenantId(req), req.auth!.userId)));
api.post("/network/profile/unpublish", requireFeature("network.directory"),
  requireTenantOwner as any, wrap(async (req) =>
    unpublishProfile(tenantId(req), req.auth!.userId)));

// ---------------------------------------------------------------------------
// PN-002: business directory. Serves ONLY published snapshots (never drafts,
// never live tenant records); results expose the opaque profile id, not the
// tenant id. Behind `network.directory`; the privacy-review gate governs
// per-tenant flag enablement.
// ---------------------------------------------------------------------------
api.get("/network/directory", requireFeature("network.directory"), wrap(async (req) =>
  searchDirectory(directoryQuerySchema.parse({
    category: req.query.category as string | undefined,
    city: req.query.city as string | undefined,
    q: req.query.q as string | undefined,
    country: (req.query.country as string | undefined) ?? "ZW",
  }))));
api.get("/network/directory/:id", requireFeature("network.directory"), wrap(async (req) =>
  getDirectoryProfile(uuidRouteParam(req, "id"))));

// PN-003: consent-first enquiries; conversion to CRM is explicit + audited.
api.post("/network/directory/:id/enquire", requireFeature("network.directory"),
  wrap(async (req) => {
    const body = enquirySchema.parse(req.body);
    return sendEnquiry({
      senderTenantId: tenantId(req), senderUserId: req.auth!.userId,
      profileId: uuidRouteParam(req, "id"),
      message: body.message, replyEmail: body.replyEmail,
    });
  }));
api.get("/network/enquiries", requireFeature("network.directory"),
  requirePermission("crm.read"), wrap(async (req) => listEnquiries(tenantId(req))));
api.post("/network/enquiries/:id/convert", requireFeature("network.directory"),
  requirePermission("crm.write"), wrap(async (req) =>
    resolveEnquiry({
      tenantId: tenantId(req), userId: req.auth!.userId,
      enquiryId: uuidRouteParam(req, "id"), action: "convert",
    })));
api.post("/network/enquiries/:id/dismiss", requireFeature("network.directory"),
  requirePermission("crm.write"), wrap(async (req) =>
    resolveEnquiry({
      tenantId: tenantId(req), userId: req.auth!.userId,
      enquiryId: uuidRouteParam(req, "id"), action: "dismiss",
    })));

// ---------------------------------------------------------------------------
// PM-001/PM-002: Migration Hub — project-grouped staged migrations over the
// existing import framework. stage → validate → commit → reconcile →
// rollback. Rollback and sign-off are OWNER actions; the reconciliation
// report backs the PM-002 accountant gate. Dark behind `migration.hub`.
// ---------------------------------------------------------------------------
api.get("/migration/projects", requireFeature("migration.hub"),
  requirePermission("imports.create"), wrap(async (req) =>
    listMigrationProjects(tenantId(req))));
api.post("/migration/projects", requireFeature("migration.hub"),
  requirePermission("imports.create"), wrap(async (req) =>
    createMigrationProject(tenantId(req), req.auth!.userId, migrationProjectSchema.parse(req.body))));
api.get("/migration/projects/:id", requireFeature("migration.hub"),
  requirePermission("imports.create"), wrap(async (req) =>
    getMigrationProject(tenantId(req), uuidRouteParam(req, "id"))));
api.get("/migration/projects/:id/reconciliation", requireFeature("migration.hub"),
  requirePermission("imports.create"), wrap(async (req) =>
    projectReconciliation(tenantId(req), uuidRouteParam(req, "id"))));
api.post("/migration/projects/:id/steps/:kind/preview", requireFeature("migration.hub"),
  requirePermission("imports.create"), wrap(async (req) =>
    previewMigrationStep({
      tenantId: tenantId(req), userId: req.auth!.userId,
      projectId: uuidRouteParam(req, "id"),
      kind: migrationStepKindSchema.parse(routeParam(req, "kind")),
      csvText: migrationPreviewSchema.parse(req.body).csvText,
    })));
api.post("/migration/projects/:id/steps/:stepId/commit", requireFeature("migration.hub"),
  requirePermission("imports.approve"), wrap(async (req) => {
    const applied = await commitMigrationStep({
      tenantId: tenantId(req), userId: req.auth!.userId,
      projectId: uuidRouteParam(req, "id"), stepId: uuidRouteParam(req, "stepId"),
      asOfDate: migrationCommitSchema.parse(req.body ?? {}).asOfDate,
    });
    logEvent("migration.applied", {
      requestId: req.requestId ?? null,
      tenantId: tenantId(req),
      userId: req.auth!.userId,
      projectId: applied.step.projectId,
      stepId: applied.step.id,
      migrationKind: applied.step.kind,
    });
    return applied;
  }));
api.post("/migration/projects/:id/steps/:stepId/discard", requireFeature("migration.hub"),
  requirePermission("imports.approve"), wrap(async (req) =>
    discardMigrationStep({
      tenantId: tenantId(req), userId: req.auth!.userId,
      projectId: uuidRouteParam(req, "id"), stepId: uuidRouteParam(req, "stepId"),
    })));
api.post("/migration/projects/:id/steps/:stepId/rollback", requireFeature("migration.hub"),
  requireTenantOwner as any, wrap(async (req) =>
    rollbackMigrationStep({
      tenantId: tenantId(req), userId: req.auth!.userId,
      projectId: uuidRouteParam(req, "id"), stepId: uuidRouteParam(req, "stepId"),
      reason: z.object({ reason: z.string().trim().min(5).max(500) }).parse(req.body).reason,
    })));
api.post("/migration/projects/:id/sign-off", requireFeature("migration.hub"),
  requireTenantOwner as any, wrap(async (req) =>
    signOffMigrationProject(tenantId(req), req.auth!.userId,
      uuidRouteParam(req, "id"), migrationSignOffSchema.parse(req.body))));
api.post("/migration/projects/:id/close", requireFeature("migration.hub"),
  requireTenantOwner as any, wrap(async (req) =>
    closeMigrationProject(tenantId(req), req.auth!.userId, uuidRouteParam(req, "id"))));

// ---------------------------------------------------------------------------
// PW-002: tenant-configurable approval policies (thresholds, extra
// permission, second-person rule) for purchase orders and payroll runs.
// Configuration is an Owner/Admin settings action and audited.
// ---------------------------------------------------------------------------
api.get("/settings/approval-policies", requirePermission("settings.manage"), wrap(async (req) =>
  listApprovalPolicies(tenantId(req))));
api.put("/settings/approval-policies/:subjectType", requirePermission("settings.manage"), wrap(async (req) => {
  const subjectType = approvalPolicySubjectSchema.parse(routeParam(req, "subjectType"));
  const input = approvalPolicyInputSchema.parse(req.body);
  return setApprovalPolicy(tenantId(req), req.auth!.userId, subjectType, input);
}));
api.delete("/settings/approval-policies/:subjectType", requirePermission("settings.manage"), wrap(async (req) => {
  const subjectType = approvalPolicySubjectSchema.parse(routeParam(req, "subjectType"));
  return removeApprovalPolicy(tenantId(req), req.auth!.userId, subjectType);
}));

// ---------------------------------------------------------------------------
// P2-009: payroll (TECHNICAL PREVIEW — accountant gate). Employee register has
// no ledger effect; posting a run creates one balanced journal through
// postJournal. Posted runs are immutable; corrections are full reversals.
// `payroll.post` is separate from `payroll.manage` so preparation and posting
// can be segregated in custom roles.
// ---------------------------------------------------------------------------
api.get("/payroll/config", requirePermission("payroll.read"), wrap(async (req) =>
  payrollConfigView(tenantId(req))));

api.get("/payroll/employees", requirePermission("payroll.read"), wrap(async (req) =>
  listEmployees(tenantId(req))));
api.post("/payroll/employees", requirePermission("payroll.manage"), wrap(async (req) => {
  const input = employeeInputSchema.parse(req.body);
  return createEmployee(tenantId(req), req.auth!.userId, input, req.ip);
}));
api.patch("/payroll/employees/:id", requirePermission("payroll.manage"), wrap(async (req) => {
  const input = employeeUpdateSchema.parse(req.body);
  return updateEmployee(tenantId(req), req.auth!.userId, uuidRouteParam(req, "id"), input, req.ip);
}));

api.get("/payroll/runs", requirePermission("payroll.read"), wrap(async (req) =>
  listPayrollRuns(tenantId(req))));
api.get("/payroll/runs/:id", requirePermission("payroll.read"), wrap(async (req) =>
  getPayrollRun(tenantId(req), uuidRouteParam(req, "id"))));
api.post("/payroll/runs", requirePermission("payroll.manage"), wrap(async (req) => {
  const body = z.object({ month: periodMonthSchema }).parse(req.body);
  return createPayrollRun(tenantId(req), req.auth!.userId, body.month);
}));
api.patch("/payroll/runs/:id/payslips/:payslipId", requirePermission("payroll.manage"), wrap(async (req) => {
  const body = payslipAdjustmentSchema.parse(req.body);
  return updateDraftPayslip(
    tenantId(req), req.auth!.userId,
    uuidRouteParam(req, "id"), uuidRouteParam(req, "payslipId"), body.allowances,
  );
}));
api.delete("/payroll/runs/:id", requirePermission("payroll.manage"), wrap(async (req) => {
  await deleteDraftRun(tenantId(req), req.auth!.userId, uuidRouteParam(req, "id"));
  return { deleted: true };
}));
api.post("/payroll/runs/:id/post", requirePermission("payroll.post"), wrap(async (req) =>
  postPayrollRun(tenantId(req), req.auth!.userId, uuidRouteParam(req, "id"), req.auth!.permissions)));
api.post("/payroll/runs/:id/reverse", requirePermission("payroll.post"), wrap(async (req) => {
  const body = z.object({ reason: reverseReasonSchema }).parse(req.body);
  return reversePayrollRun(tenantId(req), req.auth!.userId, uuidRouteParam(req, "id"), body.reason);
}));

api.get("/journal", requirePermission("accounting.read"), wrap(async (req) => {
  const rows = await db.execute(sql`
    SELECT je.id, je.date, je.memo, je.source_type, je.source_id,
           json_agg(json_build_object('accountCode', a.code, 'accountName', a.name,
             'debit', jl.debit, 'credit', jl.credit) ORDER BY jl.debit DESC) AS lines
    FROM journal_entries je
    JOIN journal_lines jl ON jl.journal_entry_id = je.id
    JOIN accounts a ON a.id = jl.account_id
    WHERE je.tenant_id = ${tenantId(req)}
    GROUP BY je.id ORDER BY je.date DESC, je.created_at DESC LIMIT 100`);
  return (rows as any).rows;
}));

// ---------------------------------------------------------------------------
// Reports & dashboard (cross-module)
// ---------------------------------------------------------------------------
api.post("/reports/snapshots", requirePermission("reports.read"), wrap(async (req, res) => {
  const body = financeReportSnapshotCreateSchema.parse(req.body);
  const result = await createFinanceReportSnapshot({
    ...body,
    tenantId: tenantId(req),
    actorUserId: req.auth!.userId,
    idempotencyKey: financialIdempotencyKey(req),
  });
  res.status(result.deduplicated ? 200 : 201);
  return result;
}));
api.get("/reports/snapshots", requirePermission("reports.read"), wrap(async (req) => {
  const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(req.query);
  return listFinanceReportSnapshots(tenantId(req), limit);
}));
api.get("/reports/snapshots/:id", requirePermission("reports.read"), wrap(async (req) =>
  getFinanceReportSnapshot(tenantId(req), z.string().uuid().parse(routeParam(req, "id")))));
api.get("/reports/snapshots/:id/pdf", requirePermission("reports.read"), async (req, res, next) => {
  try {
    const request = req as AuthedRequest;
    const snapshotId = z.string().uuid().parse(routeParam(request, "id"));
    const document = await platformKernel().container.get(DOCUMENT_SERVICE).get(
      financeReportPdfDocumentId(snapshotId),
      { tenantId: tenantId(request), actorUserId: request.auth!.userId },
    );
    if (!document) throw notFound("Finance report snapshot not found");
    await audit(db, tenantId(request), request.auth!.userId,
      "report.snapshot_opened", "finance_report_snapshot", snapshotId, {
        reportType: document.descriptor.classification,
        pdfTemplateVersion: document.descriptor.version,
        byteSize: document.descriptor.byteSize,
        checksum: document.descriptor.checksum,
      });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${document.descriptor.fileName}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Length", String(document.bytes.byteLength));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(Buffer.from(document.bytes));
  } catch (error) { next(error); }
});
api.get("/reports/dashboard", requirePermission("reports.read"), wrap(async (req) => dashboard(tenantId(req))));
api.get("/reports/trial-balance", requirePermission("reports.read"), wrap(async (req) =>
  trialBalance(tenantId(req), req.query.asAt ? new Date(String(req.query.asAt)) : new Date())));
api.get("/reports/profit-loss", requirePermission("reports.read"), wrap(async (req) => {
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(new Date().getFullYear(), 0, 1);
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();
  return profitAndLoss(tenantId(req), from, to);
}));
api.get("/reports/balance-sheet", requirePermission("reports.read"), wrap(async (req) =>
  balanceSheet(tenantId(req), req.query.asAt ? new Date(String(req.query.asAt)) : new Date())));
api.get("/reports/aged-receivables", requirePermission("reports.read"), wrap(async (req) =>
  agedReceivables(tenantId(req))));
api.get("/reports/inventory-valuation", requirePermission("reports.read"), wrap(async (req) =>
  inventoryValuationReconciliation(tenantId(req))));
api.get("/reports/vat", requirePermission("reports.read"), wrap(async (req) =>
  getVatTechnicalReport({ tenantId: tenantId(req), period: vatReportPeriodSchema.parse(req.query) })));
api.get("/reports/vat.csv", requirePermission("reports.read"), async (req, res, next) => {
  try {
    const period = vatReportPeriodSchema.parse(req.query);
    const report = await getVatTechnicalReport({ tenantId: tenantId(req as AuthedRequest), period });
    await recordAudit({
      tenantId: tenantId(req as AuthedRequest),
      actorUserId: (req as AuthedRequest).auth!.userId,
      action: "report.vat_exported",
      entityType: "tenant",
      entityId: tenantId(req as AuthedRequest),
      metadata: { format: "csv", from: period.from, to: period.to, evidenceCount: report.evidence.length },
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="vat-technical-preview-${period.from}-${period.to}.csv"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(renderVatReportCsv(report));
  } catch (error) { next(error); }
});
api.get("/reports/vat.pdf", requirePermission("reports.read"), async (req, res, next) => {
  try {
    const period = vatReportPeriodSchema.parse(req.query);
    const report = await getVatTechnicalReport({ tenantId: tenantId(req as AuthedRequest), period });
    await recordAudit({
      tenantId: tenantId(req as AuthedRequest),
      actorUserId: (req as AuthedRequest).auth!.userId,
      action: "report.vat_exported",
      entityType: "tenant",
      entityId: tenantId(req as AuthedRequest),
      metadata: { format: "pdf", from: period.from, to: period.to, evidenceCount: report.evidence.length },
    });
    const branding = await getReportBranding(tenantId(req as AuthedRequest));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="vat-technical-preview-${period.from}-${period.to}.pdf"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(renderVatReportPdf(report, branding));
  } catch (error) { next(error); }
});
api.get("/reports/statutory-pack", requirePermission("reports.read"), wrap(async (req, res) => {
  const period = statutoryReportPeriodSchema.parse(req.query);
  res.setHeader("Cache-Control", "private, no-store");
  return getStatutoryReportPack({ tenantId: tenantId(req), period });
}));
async function exportStatutoryPack(req: AuthedRequest, res: Response, format: "csv" | "pdf") {
  const period = statutoryReportPeriodSchema.parse(req.query);
  const report = await getStatutoryReportPack({ tenantId: tenantId(req), period });
  await recordAudit({
    tenantId: tenantId(req), actorUserId: req.auth!.userId, action: "report.statutory_pack_exported",
    entityType: "tenant", entityId: tenantId(req),
    metadata: {
      format, ...period, version: report.version, currency: report.currency, checks: report.checks,
      trialBalanceRows: report.trialBalance.length, receivableRows: report.agedReceivables.items.length,
      payableRows: report.agedPayables.items.length,
    },
  });
  const branding = format === "pdf" ? await getReportBranding(tenantId(req)) : null;
  res.setHeader("Content-Type", format === "csv" ? "text/csv; charset=utf-8" : "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="statutory-report-technical-preview-${period.from}-${period.to}.${format}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(format === "csv" ? renderStatutoryReportCsv(report) : renderStatutoryReportPdf(report, branding!));
}
api.get("/reports/statutory-pack.csv", requirePermission("reports.read"), (req, res, next) => {
  exportStatutoryPack(req as AuthedRequest, res, "csv").catch(next);
});
api.get("/reports/statutory-pack.pdf", requirePermission("reports.read"), (req, res, next) => {
  exportStatutoryPack(req as AuthedRequest, res, "pdf").catch(next);
});

// ---------------------------------------------------------------------------
// Governed AI foundation plus the legacy deterministic business read model.
// ---------------------------------------------------------------------------
const aiSummariseSchema = z.object({
  objectType: z.string().trim().min(1).max(100),
  objectId: z.string().uuid(),
}).strict();
api.post("/ai/summarise", wrap(async (req, res) => {
  const body = aiSummariseSchema.parse(req.body);
  try {
    const result = await platformKernel().container.get(AI_SERVICE_FACTORY)
      .for(req.auth)
      .summarise(req.auth!.userId, tenantId(req), body);
    res.setHeader("Cache-Control", "private, no-store");
    return result;
  } catch (error) {
    if (error instanceof AIPermissionDeniedError || error instanceof AIContextBoundaryError) {
      throw forbidden(error.message);
    }
    if (error instanceof AIObjectNotFoundError) throw notFound(error.message);
    if (error instanceof AIObjectUnavailableError) throw badRequest(error.message);
    if (error instanceof AIAgentUnavailableError || error instanceof AIProviderUnavailableError) {
      throw new AppError(503, error.message, "AI_UNAVAILABLE");
    }
    if (error instanceof AIProviderResponseError) {
      throw new AppError(502, error.message, "AI_PROVIDER_RESPONSE_INVALID");
    }
    throw error;
  }
}));

// Deterministic context only; no model/provider call.
api.get("/ai/read-models/business-summary", requirePermission("reports.read"), wrap(async (req) => {
  const query = businessSummaryQuerySchema.parse(req.query);
  const tenant = (req as any).tenant as { baseCurrency: "USD" | "ZWG" };
  const summary = await getBusinessSummary({
    tenantId: tenantId(req),
    actorUserId: req.auth!.userId,
    baseCurrency: tenant.baseCurrency,
    permissions: req.auth!.permissions,
  }, query);
  await audit(db, tenantId(req), req.auth!.userId, "ai.read_model.business_summary_generated", "tenant", tenantId(req), {
    schemaVersion: summary.schemaVersion,
    period: summary.scope.period,
    sectionStatus: Object.fromEntries(
      Object.entries(summary.sections).map(([name, section]) => [name, section.status]),
    ),
  });
  return summary;
}));

// ---------------------------------------------------------------------------
// Data export — always available, even suspended/closed (their data is theirs)
// ---------------------------------------------------------------------------
api.get("/export/:entity", wrap(async (req) => {
  const tid = tenantId(req);
  const entity = routeParam(req, "entity");
  const tableMap: Record<string, any> = {
    contacts: schema.contacts, invoices: schema.invoices, products: schema.products,
    expenses: schema.expenses, deals: schema.deals,
  };
  const table = tableMap[entity];
  if (!table) throw badRequest(`Unknown export entity. Available: ${Object.keys(tableMap).join(", ")}`);
  const rows = await db.select().from(table).where(eq(table.tenantId, tid));
  await audit(db, tid, req.auth!.userId, "data.exported", entity);
  return rows;
}));

// ---------------------------------------------------------------------------
// Billing (tenant-facing)
// ---------------------------------------------------------------------------
api.get("/billing/subscription", wrap(async (req) => {
  const tid = tenantId(req);
  const [sub] = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.tenantId, tid));
  if (!sub) throw notFound("No subscription");
  const [plan] = await db.select().from(schema.plans).where(eq(schema.plans.id, sub.planId));
  const usage = await collectUsageSummary(db, tid);
  return { ...sub, plan, currentUsage: usage };
}));
api.get("/billing/invoices", wrap(async (req) =>
  db.select().from(schema.subscriptionInvoices).where(eq(schema.subscriptionInvoices.tenantId, tenantId(req)))
    .orderBy(desc(schema.subscriptionInvoices.issuedAt))));
api.get("/billing/payment-provider", wrap(async () => subscriptionPaymentAvailability()));
api.get("/billing/payment-attempts", requirePermission("billing.manage"), wrap(async (req) =>
  listSubscriptionPaymentAttempts(tenantId(req))));
api.post("/billing/invoices/:id/payment-attempts", requirePermission("billing.manage"), wrap(async (req) =>
  initiateSubscriptionPayment({
    tenantId: tenantId(req),
    invoiceId: routeParam(req, "id"),
    actorUserId: req.auth!.userId,
    idempotencyKey: financialIdempotencyKey(req),
  })));
api.post("/billing/payment-attempts/:id/refresh", requirePermission("billing.manage"), wrap(async (req) =>
  refreshSubscriptionPayment({
    tenantId: tenantId(req),
    attemptId: routeParam(req, "id"),
    actorUserId: req.auth!.userId,
  })));
api.get("/billing/plans", wrap(async () => db.select().from(schema.plans)));
api.get("/billing/arrears-status", wrap(async (req) => {
  const tenant = (req as any).tenant as { status: string };
  return getArrearsStatus(tenantId(req), tenant.status);
}));
api.post("/billing/upgrade-interest", requirePermission("billing.manage"), wrap(async (req) => {
  const body = z.object({
    requestedPlan: z.enum(["Starter", "Growth", "Business", "Enterprise"]),
  }).parse(req.body);
  const tid = tenantId(req);
  const [subscription] = await db.select().from(schema.subscriptions)
    .where(eq(schema.subscriptions.tenantId, tid));
  if (!subscription) throw notFound("Subscription not found");
  const [currentPlan] = await db.select().from(schema.plans)
    .where(eq(schema.plans.id, subscription.planId));
  if (!currentPlan) throw notFound("Current plan not found");
  const order = ["Starter", "Growth", "Business", "Enterprise"];
  if (order.indexOf(body.requestedPlan) <= order.indexOf(currentPlan.name)) {
    throw badRequest("Select a plan above your current package");
  }
  await audit(db, tid, req.auth!.userId, "billing.upgrade_interest_recorded",
    "subscription", subscription.id, {
      currentPlan: currentPlan.name,
      requestedPlan: body.requestedPlan,
    });
  return {
    recorded: true,
    currentPlan: currentPlan.name,
    requestedPlan: body.requestedPlan,
  };
}));

// ---------------------------------------------------------------------------
// Platform admin (Jonomi staff only)
// ---------------------------------------------------------------------------
const platformStaffProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  platformRoleKey: z.enum(["OPERATIONS_ADMIN", "FINANCE_OPERATIONS", "SUPPORT_ANALYST", "SECURITY_AUDITOR"]),
  employeeNumber: z.string().trim().max(40).optional().nullable(),
  businessFunction: z.string().trim().min(2).max(100),
  jobTitle: z.string().trim().min(2).max(120),
  workPhone: z.string().trim().max(40).optional().nullable(),
  location: z.string().trim().max(120).optional().nullable(),
  managerUserId: z.string().uuid().optional().nullable(),
  employmentState: z.enum(["ACTIVE", "LEAVE", "ENDED"]).default("ACTIVE"),
  startDate: z.string().date().optional().nullable(),
  endDate: z.string().date().optional().nullable(),
  operationalNotes: z.string().trim().max(1000).optional().nullable(),
});

api.get("/platform/staff/roles", requirePlatformPermission("platform.staff.read"), wrap(async () => listPlatformRoles()));
api.get("/platform/staff", requirePlatformPermission("platform.staff.read"), wrap(async () => listPlatformStaff()));
api.post("/platform/staff", requirePlatformPermission("platform.staff.manage"), requireStepUp as any, wrap(async (req) => {
  const body = platformStaffProfileSchema.extend({
    email: z.string().email(),
    initialPassword: z.string().min(12).max(256).optional(),
  }).parse(req.body);
  return createPlatformStaff(req.auth!.userId, body);
}));
api.patch("/platform/staff/:id", requirePlatformPermission("platform.staff.manage"), requireStepUp as any, wrap(async (req) => {
  const body = platformStaffProfileSchema.extend({ status: z.enum(["active", "disabled"]) }).parse(req.body);
  return updatePlatformStaff(req.auth!.userId, routeParam(req, "id"), body);
}));
api.post("/platform/staff/:id/temporary-password", requirePlatformPermission("platform.staff.manage"), requireStepUp as any, wrap(async (req) => {
  const body = z.object({ temporaryPassword: z.string().min(12).max(256).optional() }).parse(req.body);
  return issuePlatformStaffTemporaryPassword(req.auth!.userId, routeParam(req, "id"), body.temporaryPassword);
}));

// ---------------------------------------------------------------------------
// PV-002: platform verification review queue. Reads require the closed
// catalogue permission; every state-changing action additionally requires a
// fresh step-up proof. ApprovalService owns decision and SoD semantics.
// ---------------------------------------------------------------------------
api.get("/platform/verification/requests",
  requirePlatformPermission("platform.verification.review"), wrap(async (req) =>
    listVerificationQueue(
      req.auth!.userId,
      verificationQueueStatusSchema.optional()
        .parse(req.query.status as string | undefined) ?? "OPEN",
    )));
api.get("/platform/verification/requests/:id",
  requirePlatformPermission("platform.verification.review"), wrap(async (req) =>
    getPlatformVerificationRequest(uuidRouteParam(req, "id"), req.auth!.userId)));
api.get("/platform/verification/requests/:id/evidence/:snapshotId/content",
  requirePlatformPermission("platform.verification.review"), wrap(async (req) =>
    getPlatformVerificationEvidenceContent(
      uuidRouteParam(req, "id"), uuidRouteParam(req, "snapshotId"),
    )));
api.post("/platform/verification/requests/:id/start-review",
  requirePlatformPermission("platform.verification.review"), requireStepUp as any, wrap(async (req) =>
    startVerificationReview(uuidRouteParam(req, "id"), req.auth!.userId)));
api.post("/platform/verification/requests/:id/decisions",
  requirePlatformPermission("platform.verification.review"), requireStepUp as any, wrap(async (req) =>
    decideVerificationRequest(
      uuidRouteParam(req, "id"), req.auth!.userId,
      verificationDecisionSchema.parse(req.body),
    )));
api.post("/platform/verification/badges/:id/revoke",
  requirePlatformPermission("platform.verification.review"), requireStepUp as any, wrap(async (req) =>
    revokeVerificationBadge(
      uuidRouteParam(req, "id"), req.auth!.userId,
      verificationRevocationSchema.parse(req.body).reason,
    )));

api.get("/platform/analytics", requirePlatformPermission("platform.overview.read"), wrap(async () => {
  const [summary] = (await db.execute(sql`
    SELECT
      COUNT(*)::int AS total_tenants,
      COUNT(*) FILTER (WHERE status = 'TRIAL')::int AS trial_tenants,
      COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active_tenants,
      COUNT(*) FILTER (WHERE status = 'PAST_DUE')::int AS past_due_tenants,
      COUNT(*) FILTER (WHERE status = 'SUSPENDED')::int AS suspended_tenants,
      (SELECT COUNT(*)::int FROM users WHERE tenant_id IS NOT NULL) AS total_users,
      (SELECT COUNT(DISTINCT s.user_id)::int FROM user_sessions s
        WHERE s.tenant_id IS NOT NULL AND s.revoked_at IS NULL
          AND s.idle_expires_at > NOW() AND s.absolute_expires_at > NOW()) AS signed_in_users,
      (SELECT COUNT(*)::int FROM invoices WHERE status IN ('ISSUED', 'PARTIAL', 'PAID')) AS invoices_issued,
      (SELECT COUNT(*)::int FROM invoices WHERE status IN ('ISSUED', 'PARTIAL')) AS invoices_outstanding
    FROM tenants`).then((result) => (result as any).rows)) as any;
  const planMix = await db.execute(sql`
    SELECT p.name AS plan, COUNT(*)::int AS tenants
    FROM subscriptions s JOIN plans p ON p.id = s.plan_id
    GROUP BY p.name ORDER BY tenants DESC, p.name ASC`);
  const tenantGrowth = await db.execute(sql`
    SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month, COUNT(*)::int AS tenants
    FROM tenants WHERE created_at >= DATE_TRUNC('month', NOW()) - INTERVAL '11 months'
    GROUP BY DATE_TRUNC('month', created_at) ORDER BY month ASC`);
  const billing = await db.execute(sql`
    SELECT status, currency, COUNT(*)::int AS invoices,
      COALESCE(SUM(amount), 0)::numeric(14,2)::text AS amount
    FROM subscription_invoices GROUP BY status, currency ORDER BY status ASC, currency ASC`);
  const activity = await db.execute(sql`
    SELECT action, COUNT(*)::int AS events
    FROM audit_logs WHERE created_at >= NOW() - INTERVAL '30 days'
    GROUP BY action ORDER BY events DESC, action ASC LIMIT 25`);
  return {
    summary: summary ?? {},
    planMix: (planMix as any).rows,
    tenantGrowth: (tenantGrowth as any).rows,
    billing: (billing as any).rows,
    activity: (activity as any).rows,
  };
}));
api.get("/platform/control-center", requirePlatformPermission("platform.operations.read"), wrap(async () => {
  type ControlCenterRow = {
    database_observed_at: string;
    active_sessions: number;
    audit_events_24h: number;
    past_due_tenants: number;
    suspended_tenants: number;
    accepted_restore_drills: number;
  };
  const result = await db.execute(sql`
    SELECT
      TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS database_observed_at,
      (SELECT COUNT(*)::int FROM user_sessions s
        WHERE s.tenant_id IS NOT NULL AND s.revoked_at IS NULL
          AND s.idle_expires_at > NOW() AND s.absolute_expires_at > NOW()) AS active_sessions,
      (SELECT COUNT(*)::int FROM audit_logs a
        WHERE a.created_at >= NOW() - INTERVAL '24 hours') AS audit_events_24h,
      (SELECT COUNT(*)::int FROM tenants t WHERE t.status = 'PAST_DUE') AS past_due_tenants,
      (SELECT COUNT(*)::int FROM tenants t WHERE t.status = 'SUSPENDED') AS suspended_tenants,
      (SELECT COUNT(*)::int FROM platform_restore_drill_reviews r
        WHERE r.decision = 'ACCEPTED') AS accepted_restore_drills`);
  const [row] = (result as unknown as { rows: ControlCenterRow[] }).rows;
  if (!row) throw new Error("Control centre did not return an operational snapshot");
  return buildControlCenterSnapshot({
    databaseObservedAt: row.database_observed_at,
    activeSessions: row.active_sessions,
    auditEvents24h: row.audit_events_24h,
    pastDueTenants: row.past_due_tenants,
    suspendedTenants: row.suspended_tenants,
    acceptedRestoreDrills: row.accepted_restore_drills,
  });
}));
const platformEventQuerySchema = z.object({
  tenantId: z.string().uuid(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(["pending", "processing", "retrying", "processed", "failed"]).optional(),
  eventType: z.enum(EVENT_TYPES as [EventType, ...EventType[]]).optional(),
}).strict();
api.get("/platform/events", requirePlatformPermission("platform.operations.read"), wrap(async (req) => {
  const query = platformEventQuerySchema.parse(req.query);
  return listPlatformEvents(query.tenantId, query);
}));
api.get("/platform/audit/verify", requirePlatformPermission("platform.tenant_audit.read"), wrap(async (req, res) => {
  const { tenantId: verifiedTenantId } = z.object({ tenantId: z.string().uuid() }).strict().parse(req.query);
  const result = await verifyAuditChain(verifiedTenantId);
  await db.insert(schema.platformAuditLogs).values({
    userId: req.auth!.userId,
    action: "platform.tenant_audit_chain_verified",
    metadata: {
      verifiedTenantId,
      valid: result.valid,
      checked: result.checked,
      brokenAt: result.brokenAt,
      reason: result.reason,
    },
  });
  res.setHeader("Cache-Control", "private, no-store");
  return result;
}));
api.get("/platform/operations/email-failures/today",
  requirePlatformPermission("platform.operations.read"),
  wrap(async () => ({
    timezone: "UTC",
    failures: await listFailedEmailDeliveriesToday(),
  })));
api.get("/platform/backup-manifests", requirePlatformPermission("platform.backups.read"), wrap(async () =>
  db.select({
    id: schema.platformBackupManifests.id,
    manifestId: schema.platformBackupManifests.manifestId,
    contractVersion: schema.platformBackupManifests.contractVersion,
    environment: schema.platformBackupManifests.environment,
    startedAt: schema.platformBackupManifests.startedAt,
    completedAt: schema.platformBackupManifests.completedAt,
    status: schema.platformBackupManifests.status,
    databaseSnapshotRef: schema.platformBackupManifests.databaseSnapshotRef,
    objectSnapshotRef: schema.platformBackupManifests.objectSnapshotRef,
    checksum: schema.platformBackupManifests.checksum,
    encryptionRef: schema.platformBackupManifests.encryptionRef,
    retentionExpiresAt: schema.platformBackupManifests.retentionExpiresAt,
    operator: schema.platformBackupManifests.operator,
    failureReason: schema.platformBackupManifests.failureReason,
    createdAt: schema.platformBackupManifests.createdAt,
  }).from(schema.platformBackupManifests)
    .orderBy(desc(schema.platformBackupManifests.completedAt))
    .limit(50)));
api.post("/platform/backup-manifests", requirePlatformPermission("platform.backups.write"), wrap(async (req) => {
  const body = backupManifestInputSchema.parse(req.body);
  return db.transaction(async (tx) => {
    const [recorded] = await tx.insert(schema.platformBackupManifests).values({
      ...body,
      objectSnapshotRef: body.objectSnapshotRef ?? null,
      failureReason: body.failureReason ?? null,
      metadata: body.metadata ?? null,
      recordedBy: req.auth!.userId,
    }).returning({
      id: schema.platformBackupManifests.id,
      manifestId: schema.platformBackupManifests.manifestId,
      status: schema.platformBackupManifests.status,
      completedAt: schema.platformBackupManifests.completedAt,
    });
    await tx.insert(schema.platformAuditLogs).values({
      userId: req.auth!.userId,
      action: "platform.backup_manifest_recorded",
      metadata: {
        manifestId: recorded.manifestId,
        status: recorded.status,
        completedAt: recorded.completedAt.toISOString(),
      },
    });
    return recorded;
  });
}));
api.get("/platform/restore-drills", requirePlatformPermission("platform.backups.read"), wrap(async () =>
  listRestoreDrills()));
api.post("/platform/restore-drills", requirePlatformPermission("platform.backups.write"), wrap(async (req) =>
  recordRestoreDrill(req.auth!.userId, req.body)));
// P9-011 follow-up: Principal acceptance/rejection of restore-drill evidence
// requires a fresh step-up proof (permission check runs first, independently).
api.post("/platform/restore-drills/:id/review",
  requirePlatformPermission("platform.security.manage"), requireStepUp as any, wrap(async (req) =>
    reviewRestoreDrill(req.auth!.userId, routeParam(req, "id"), req.body)));
api.post("/platform/referral-codes", requirePlatformPermission("platform.referrals.manage"), wrap(async (req) => {
  const body = z.object({
    code: z.string().min(5).max(32),
    program: z.enum(["GENERAL", "PROFESSIONAL"]),
    ruleVersion: z.string().min(1).max(50),
    referrerTenantId: z.string().uuid().optional(),
    referrerUserId: z.string().uuid().optional(),
    campaign: z.string().max(100).optional(),
    expiresAt: z.coerce.date().optional(),
  }).parse(req.body);
  return createReferralCode({ ...body, createdBy: req.auth!.userId });
}));
api.get("/platform/referral-codes", requirePlatformPermission("platform.referrals.manage"), wrap(async () =>
  db.select({
    id: schema.referralCodes.id,
    code: schema.referralCodes.code,
    program: schema.referralCodes.program,
    ruleVersion: schema.referralCodes.ruleVersion,
    referrerTenantId: schema.referralCodes.referrerTenantId,
    referrerUserId: schema.referralCodes.referrerUserId,
    campaign: schema.referralCodes.campaign,
    status: schema.referralCodes.status,
    expiresAt: schema.referralCodes.expiresAt,
    createdAt: schema.referralCodes.createdAt,
  }).from(schema.referralCodes).orderBy(desc(schema.referralCodes.createdAt))));
api.get("/platform/referral-attributions", requirePlatformPermission("platform.referrals.manage"), wrap(async () => {
  const rows = await db.execute(sql`
    SELECT ra.id, ra.referred_tenant_id, t.company_name, ra.program,
           ra.rule_version, ra.captured_at, rc.code, rc.referrer_tenant_id,
           rc.referrer_user_id, latest.decision, latest.reason_code,
           latest.created_at AS reviewed_at
    FROM referral_attributions ra
    JOIN tenants t ON t.id = ra.referred_tenant_id
    JOIN referral_codes rc ON rc.id = ra.referral_code_id
    LEFT JOIN LATERAL (
      SELECT decision, reason_code, created_at
      FROM referral_review_events
      WHERE referral_attribution_id = ra.id
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    ) latest ON true
    ORDER BY ra.captured_at DESC`);
  return (rows as any).rows;
}));
api.post("/platform/referral-attributions/:id/reviews", requirePlatformPermission("platform.referrals.manage"), wrap(async (req) => {
  const body = z.object({
    decision: z.enum(["QUALIFIED", "REJECTED", "HELD"]),
    reasonCode: z.string().min(3).max(50),
    notes: z.string().max(500).optional(),
  }).parse(req.body);
  return recordReferralReview({
    referralAttributionId: routeParam(req, "id"),
    ...body,
    actorUserId: req.auth!.userId,
  });
}));
api.get("/platform/tenants", requirePlatformPermission("platform.tenants.read"), wrap(async () => {
  const rows = await db.execute(sql`
    SELECT t.id, t.company_name, t.subdomain, t.status, t.trial_ends_at, t.created_at,
           p.name AS plan, s.status AS sub_status,
           (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS user_count
    FROM tenants t
    LEFT JOIN subscriptions s ON s.tenant_id = t.id
    LEFT JOIN plans p ON p.id = s.plan_id
    ORDER BY t.created_at DESC`);
  return (rows as any).rows;
}));
// ---------------------------------------------------------------------------
// FLAG-001: per-tenant feature flags (build-dark model). Reads need tenant
// visibility; toggles need settings authority plus a fresh step-up proof and
// a mandatory note, and are audited on the target tenant.
// ---------------------------------------------------------------------------
api.get("/platform/tenants/:id/features", requirePlatformPermission("platform.tenants.read"), wrap(async (req) =>
  listTenantFeatures(z.string().uuid().parse(routeParam(req, "id")))));
api.put("/platform/tenants/:id/features/:key",
  requirePlatformPermission("platform.settings.manage"), requireStepUp as any, wrap(async (req) => {
    const body = z.object({ enabled: z.boolean(), note: featureNoteSchema }).parse(req.body);
    return setTenantFeature({
      tenantId: z.string().uuid().parse(routeParam(req, "id")),
      key: routeParam(req, "key"),
      enabled: body.enabled,
      note: body.note,
      actorUserId: req.auth!.userId,
    });
  }));

// ---------------------------------------------------------------------------
// PB-001: Black Book registry governance — the ONLY write path for registry
// content. Imports are all-or-nothing (a failed validation leaves the
// registry unchanged), versioned per entry, recorded per run with the dataset
// revision, and audited to platform_audit_logs. Step-up required.
// ---------------------------------------------------------------------------
api.post("/platform/blackbook/import",
  requirePlatformPermission("platform.settings.manage"), requireStepUp as any, wrap(async (req) => {
    const body = blackbookImportRequestSchema.parse(req.body);
    return importBlackbookDataset({
      actorUserId: req.auth!.userId,
      countryCode: body.countryCode,
      datasetRevision: body.datasetRevision,
      dataset: body.dataset as Record<string, unknown>,
    });
  }));
api.get("/platform/blackbook/import-runs",
  requirePlatformPermission("platform.operations.read"), wrap(async (req) =>
    listBlackbookImportRuns((req.query.country as string | undefined) || undefined)));

api.post("/platform/billing/run", requirePlatformPermission("platform.billing.run"), wrap(async (req) => {
  const asOf = req.body?.asOf ? new Date(req.body.asOf) : new Date();
  return runBillingCycle(asOf);
}));
api.post("/platform/tenants/:id/mark-invoice-paid/:invoiceId", requirePlatformPermission("platform.billing.payment.manage"), wrap(async (req) =>
  markSubscriptionInvoicePaid({
    tenantId: routeParam(req, "id"),
    invoiceId: routeParam(req, "invoiceId"),
    actorUserId: req.auth!.userId,
  })));
api.get("/platform/audit/:tenantId", requirePlatformPermission("platform.tenant_audit.read"), wrap(async (req) => {
  const reviewedTenantId = z.string().uuid().parse(routeParam(req, "tenantId"));
  const events = await db.select().from(schema.auditLogs)
    .where(eq(schema.auditLogs.tenantId, reviewedTenantId))
    .orderBy(desc(schema.auditLogs.createdAt)).limit(200);
  await db.insert(schema.platformAuditLogs).values({
    userId: req.auth!.userId,
    action: "platform.tenant_audit_reviewed",
    metadata: { reviewedTenantId, eventCount: events.length },
  });
  return events;
}));
