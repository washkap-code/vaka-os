// ============================================================================
// API ROUTES — every business endpoint is tenant-scoped via the auth token;
// every write is permission-checked and audited; suspended tenants pass
// through the lifecycle gate (read-only + billing + export).
// ============================================================================
import { Router, Response } from "express";
import { z } from "zod";
import { and, eq, desc, sql } from "drizzle-orm";
import {
  db, schema, badRequest, notFound, conflict, audit, nextDocNumber,
  assertIdempotencyFingerprint, payloadFingerprint, requireIdempotencyKey,
} from "./lib.js";
import {
  AuthedRequest, authenticate, lifecycleGate, requirePermission,
  requirePlatformAdmin, tenantId, signupTenant, login, changePassword,
  requireCompletedPasswordChange,
} from "./auth.js";
import { createDraftInvoice, issueInvoice, recordPayment, voidInvoice } from "./invoicing.js";
import { adjustStock, receivePurchaseOrder, recordStockMovement } from "./inventory.js";
import { ensureBankLedgerAccount, postJournal } from "./accounting.js";
import { trialBalance, profitAndLoss, balanceSheet, agedReceivables, dashboard } from "./reports.js";
import { runBillingCycle, markSubscriptionInvoicePaid, collectUsageSummary, getArrearsStatus } from "./billing.js";
import { businessSummaryQuerySchema, getBusinessSummary } from "./ai/business-summary.js";
import { createReferralCode, recordReferralReview } from "./referrals.js";
import { getInvoicePdf } from "./invoice-documents.js";
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

export const api = Router();
const wrap = (fn: (req: AuthedRequest, res: Response) => Promise<unknown>) =>
  (req: any, res: any, next: any) => fn(req, res).then((r) => r !== undefined && res.json(r)).catch(next);
const routeParam = (req: AuthedRequest, name: string): string => {
  const value = req.params[name];
  if (typeof value !== "string") throw badRequest(`Invalid route parameter: ${name}`);
  return value;
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
api.post("/auth/signup", wrap(async (req) => {
  const body = signupSchema.parse(req.body);
  const { tenant, owner } = await signupTenant(body);
  const session = await login(body.ownerEmail, body.ownerPassword, tenant.subdomain);
  return { tenant: { id: tenant.id, subdomain: tenant.subdomain, companyName: tenant.companyName, trialEndsAt: tenant.trialEndsAt }, ...session };
}));

api.post("/auth/login", wrap(async (req) => {
  const { email, password, subdomain } = z.object({
    email: z.string().email(), password: z.string(), subdomain: z.string().optional(),
  }).parse(req.body);
  return login(email, password, subdomain);
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

// everything below requires auth + lifecycle gate
api.use(authenticate as any, lifecycleGate as any);

api.get("/me", wrap(async (req) => {
  const t = (req as any).tenant;
  const [currentUser] = await db.select({
    id: schema.users.id,
    email: schema.users.email,
    fullName: schema.users.fullName,
  }).from(schema.users).where(eq(schema.users.id, req.auth!.userId));
  return {
    ...req.auth,
    user: currentUser,
    tenant: t ? {
      id: t.id, companyName: t.companyName, subdomain: t.subdomain, status: t.status,
      baseCurrency: t.baseCurrency, trialEndsAt: t.trialEndsAt,
      brandPrimaryColor: t.brandPrimaryColor, brandSecondaryColor: t.brandSecondaryColor,
      logoUrl: t.logoUrl, taxNumber: t.taxNumber, vatNumber: t.vatNumber,
      registrationNumber: t.registrationNumber, physicalAddress: t.physicalAddress,
    } : null,
  };
}));

api.post("/auth/change-password", wrap(async (req) => {
  const body = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(12).max(256),
  }).parse(req.body);
  return changePassword({ userId: req.auth!.userId, ...body });
}));

api.use(requireCompletedPasswordChange as any);

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
      z.string().url().refine((value) => new URL(value).protocol === "https:", "Logo URL must use HTTPS"),
      z.literal(""),
    ]).optional()
      .transform((value) => value === "" ? null : value),
    brandPrimaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    brandSecondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    taxNumber: z.string().trim().max(100).optional(),
    vatNumber: z.string().trim().max(100).optional(),
    registrationNumber: z.string().trim().max(100).optional(),
    physicalAddress: z.string().trim().max(500).optional(),
  }).parse(req.body);
  const tid = tenantId(req);
  const [updated] = await db.update(schema.tenants).set(body).where(eq(schema.tenants.id, tid)).returning();
  await audit(db, tid, req.auth!.userId, "settings.branding_updated", "tenant", tid, body);
  return updated;
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
    const [updated] = await tx.update(schema.tenants).set({ logoUrl: dataUrl })
      .where(eq(schema.tenants.id, tid)).returning();
    await audit(tx, tid, req.auth!.userId, "settings.logo_uploaded", "tenant", tid, {
      mediaType, bytes: bytes.length, width: width ?? null, height: height ?? null,
    });
    return { logoUrl: updated.logoUrl, mediaType, bytes: bytes.length };
  });
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
  name: z.string().min(1), email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(), address: z.string().optional().nullable(),
  taxNumber: z.string().optional().nullable(), tags: z.array(z.string()).default([]),
  isCustomer: z.boolean().default(true), isVendor: z.boolean().default(false),
});
api.get("/contacts", requirePermission("crm.read"), wrap(async (req) =>
  db.select().from(schema.contacts).where(eq(schema.contacts.tenantId, tenantId(req))).orderBy(schema.contacts.name)));
api.post("/contacts", requirePermission("crm.write"), wrap(async (req) => {
  const body = contactSchema.parse(req.body);
  const [c] = await db.insert(schema.contacts).values({ ...body, tenantId: tenantId(req) }).returning();
  await audit(db, tenantId(req), req.auth!.userId, "contact.created", "contact", c.id);
  return c;
}));
api.patch("/contacts/:id", requirePermission("crm.write"), wrap(async (req) => {
  const body = contactSchema.partial().parse(req.body);
  const [c] = await db.update(schema.contacts).set(body)
    .where(and(eq(schema.contacts.id, routeParam(req, "id")), eq(schema.contacts.tenantId, tenantId(req)))).returning();
  if (!c) throw notFound("Contact not found");
  return c;
}));
api.get("/contacts/:id", requirePermission("crm.read"), wrap(async (req) => {
  const tid = tenantId(req);
  const [contact] = await db.select().from(schema.contacts)
    .where(and(eq(schema.contacts.id, routeParam(req, "id")), eq(schema.contacts.tenantId, tid)));
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

const dealSchema = z.object({
  contactId: z.string().uuid(), title: z.string().min(1),
  valueAmount: z.string().default("0"), valueCurrency: z.enum(["USD", "ZWG"]).default("USD"),
  expectedCloseDate: z.coerce.date().optional().nullable(),
});
api.get("/deals", requirePermission("crm.read"), wrap(async (req) =>
  db.select().from(schema.deals).where(eq(schema.deals.tenantId, tenantId(req))).orderBy(desc(schema.deals.createdAt))));
api.post("/deals", requirePermission("crm.write"), wrap(async (req) => {
  const body = dealSchema.parse(req.body);
  const [d] = await db.insert(schema.deals).values({ ...body, tenantId: tenantId(req), ownerUserId: req.auth!.userId }).returning();
  return d;
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
    type: z.enum(["call", "email", "meeting", "note", "task"]), body: z.string().min(1),
    dueAt: z.coerce.date().optional().nullable(),
  }).parse(req.body);
  const [a] = await db.insert(schema.activities).values({ ...body, tenantId: tenantId(req), ownerUserId: req.auth!.userId }).returning();
  return a;
}));

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------
const productSchema = z.object({
  sku: z.string().min(1), name: z.string().min(1), description: z.string().optional().nullable(),
  unitOfMeasure: z.string().default("unit"),
  costPrice: z.string().default("0"), salePrice: z.string().default("0"),
  currency: z.enum(["USD", "ZWG"]).default("USD"), taxRate: z.string().default("15"),
  reorderLevel: z.number().int().min(0).default(0), trackStock: z.boolean().default(true),
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
  const [p] = await db.insert(schema.products).values({ ...body, tenantId: tenantId(req) }).returning();
  await audit(db, tenantId(req), req.auth!.userId, "product.created", "product", p.id);
  return p;
}));
api.get("/warehouses", requirePermission("inventory.read"), wrap(async (req) =>
  db.select().from(schema.warehouses).where(eq(schema.warehouses.tenantId, tenantId(req)))));
api.post("/warehouses", requirePermission("inventory.write"), wrap(async (req) => {
  const body = z.object({ name: z.string().min(1), address: z.string().optional().nullable() }).parse(req.body);
  const tid = tenantId(req);
  return db.transaction(async (tx) => {
    const [warehouse] = await tx.insert(schema.warehouses).values({ ...body, tenantId: tid }).returning();
    await audit(tx, tid, req.auth!.userId, "warehouse.created", "warehouse", warehouse.id, {
      name: warehouse.name,
      address: warehouse.address,
    });
    return warehouse;
  });
}));
api.post("/stock/adjust", requirePermission("inventory.write"), wrap(async (req) => {
  const body = z.object({
    productId: z.string().uuid(), warehouseId: z.string().uuid(),
    quantityDelta: z.string(), note: z.string().min(3), idempotencyKey: z.string().trim().min(8).max(120).optional(),
  }).parse(req.body);
  const idempotencyKey = financialIdempotencyKey(req, body.idempotencyKey);
  return db.transaction((tx) => adjustStock(tx, { ...body, idempotencyKey, tenantId: tenantId(req), createdBy: req.auth!.userId }));
}));
api.post("/stock/opening", requirePermission("inventory.write"), wrap(async (req) => {
  // Opening balances: stock in + Dr Inventory / Cr Opening Balance Equity
  const body = z.object({
    productId: z.string().uuid(), warehouseId: z.string().uuid(),
    quantity: z.string(), unitCost: z.string(),
  }).parse(req.body);
  const tid = tenantId(req);
  return db.transaction(async (tx) => {
    const r = await recordStockMovement(tx, {
      tenantId: tid, productId: body.productId, warehouseId: body.warehouseId,
      quantityDelta: body.quantity, unitCost: body.unitCost, reason: "OPENING",
      sourceType: "manual", createdBy: req.auth!.userId,
      requireZeroCurrent: true, requireNoHistory: true,
    });
    const { toCents, fromCents, mulRate } = await import("./lib.js");
    const { systemAccount, postJournal } = await import("./accounting.js");
    const value = fromCents(mulRate(toCents(body.unitCost), Number(body.quantity).toFixed(6)));
    const inventory = await systemAccount(tx, tid, "INVENTORY");
    const opening = await systemAccount(tx, tid, "OPENING_EQUITY");
    await postJournal(tx, {
      tenantId: tid, date: new Date(), memo: "Opening stock balance",
      sourceType: "stock_adjustment", sourceId: r.movementId, createdBy: req.auth!.userId,
      lines: [{ accountId: inventory.id, debit: value }, { accountId: opening.id, credit: value }],
    });
    return r;
  });
}));
api.get("/stock/movements", requirePermission("inventory.read"), wrap(async (req) =>
  db.select().from(schema.stockMovements).where(eq(schema.stockMovements.tenantId, tenantId(req)))
    .orderBy(desc(schema.stockMovements.createdAt)).limit(200)));

const poSchema = z.object({
  vendorContactId: z.string().uuid(), currency: z.enum(["USD", "ZWG"]).default("USD"),
  rateToBase: z.string().default("1"), expectedDate: z.coerce.date().optional().nullable(),
  lines: z.array(z.object({
    productId: z.string().uuid(), warehouseId: z.string().uuid(),
    quantity: z.string(), unitCost: z.string(),
  })).min(1),
});
api.post("/purchase-orders", requirePermission("inventory.write"), wrap(async (req) => {
  const body = poSchema.parse(req.body);
  const tid = tenantId(req);
  return db.transaction(async (tx) => {
    const { toCents, fromCents, mulRate } = await import("./lib.js");
    let total = 0n;
    const lines = body.lines.map((l) => {
      const lineTotal = mulRate(toCents(l.unitCost), Number(l.quantity).toFixed(6));
      total += lineTotal;
      return { ...l, lineTotal: fromCents(lineTotal) };
    });
    const number = await nextDocNumber(tx, tid, "purchase_order", "PO");
    const [po] = await tx.insert(schema.purchaseOrders).values({
      tenantId: tid, vendorContactId: body.vendorContactId, number, status: "ORDERED",
      currency: body.currency, rateToBase: body.rateToBase,
      expectedDate: body.expectedDate ?? null, total: fromCents(total), createdBy: req.auth!.userId,
    }).returning();
    await tx.insert(schema.purchaseOrderLineItems).values(lines.map((l) => ({ ...l, purchaseOrderId: po.id })));
    await audit(tx, tid, req.auth!.userId, "po.created", "purchase_order", po.id, { number, total: fromCents(total) });
    return po;
  });
}));
api.get("/purchase-orders", requirePermission("inventory.read"), wrap(async (req) =>
  db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.tenantId, tenantId(req)))
    .orderBy(desc(schema.purchaseOrders.createdAt))));
api.post("/purchase-orders/:id/receive", requirePermission("inventory.write", "accounting.post"), wrap(async (req) =>
  db.transaction((tx) => receivePurchaseOrder(tx, {
    tenantId: tenantId(req), purchaseOrderId: routeParam(req, "id"), createdBy: req.auth!.userId,
  }))));

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
  lines: z.array(z.object({
    productId: z.string().uuid().optional(), warehouseId: z.string().uuid().optional(),
    description: z.string().min(1), quantity: z.string(), unitPrice: z.string(), taxRate: z.string().default("15"),
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
  return { ...inv, lines, payments: pays };
}));
api.get("/invoices/:id/pdf", requirePermission("accounting.read"), async (req, res, next) => {
  try {
    const result = await getInvoicePdf(tenantId(req as AuthedRequest), routeParam(req as AuthedRequest, "id"));
    await audit(db, tenantId(req as AuthedRequest), (req as AuthedRequest).auth!.userId,
      "invoice.downloaded", "invoice", result.invoiceId, { templateVersion: result.templateVersion });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="invoice-${result.invoiceId}.pdf"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(result.pdf);
  } catch (error) { next(error); }
});
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
api.post("/invoices/:id/issue", requirePermission("accounting.post"), wrap(async (req) =>
  issueInvoice({ tenantId: tenantId(req), invoiceId: routeParam(req, "id"), createdBy: req.auth!.userId })));
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
      const [vendor] = await tx.select({ id: schema.contacts.id }).from(schema.contacts).where(and(
        eq(schema.contacts.id, body.vendorContactId),
        eq(schema.contacts.tenantId, tid),
      ));
      if (!vendor) throw notFound("Vendor contact not found");
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

// ---------------------------------------------------------------------------
// AI-ready read models — deterministic context only; no model/provider call.
// ---------------------------------------------------------------------------
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
api.post("/platform/referral-codes", requirePlatformAdmin as any, wrap(async (req) => {
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
api.get("/platform/referral-codes", requirePlatformAdmin as any, wrap(async () =>
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
api.get("/platform/referral-attributions", requirePlatformAdmin as any, wrap(async () => {
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
api.post("/platform/referral-attributions/:id/reviews", requirePlatformAdmin as any, wrap(async (req) => {
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
api.get("/platform/tenants", requirePlatformAdmin as any, wrap(async () => {
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
api.post("/platform/billing/run", requirePlatformAdmin as any, wrap(async (req) => {
  const asOf = req.body?.asOf ? new Date(req.body.asOf) : new Date();
  return runBillingCycle(asOf);
}));
api.post("/platform/tenants/:id/mark-invoice-paid/:invoiceId", requirePlatformAdmin as any, wrap(async (req) =>
  markSubscriptionInvoicePaid({
    tenantId: routeParam(req, "id"),
    invoiceId: routeParam(req, "invoiceId"),
    actorUserId: req.auth!.userId,
  })));
api.get("/platform/audit/:tenantId", requirePlatformAdmin as any, wrap(async (req) =>
  db.select().from(schema.auditLogs).where(eq(schema.auditLogs.tenantId, routeParam(req, "tenantId")))
    .orderBy(desc(schema.auditLogs.createdAt)).limit(200)));
