import { and, eq, sql } from "drizzle-orm";
import { expect } from "vitest";
import { db, fromCents, mulRate, nextDocNumber, schema, toCents } from "../../src/lib.js";
import { login, signupTenant } from "../../src/auth.js";
import { createDraftInvoice, issueInvoice } from "../../src/invoicing.js";
import { assertSafeFinanceTestDatabase } from "./test-db-guard.js";

assertSafeFinanceTestDatabase();

const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
let tenantSequence = 0;

export type TestTenant = {
  token: string;
  tenantId: string;
  userId: string;
  auth: { Authorization: string };
};

export async function signupFinanceTenant(label: string, currency: "USD" | "ZWG" = "USD"): Promise<TestTenant> {
  tenantSequence += 1;
  const safeLabel = label.toLowerCase().replace(/[^a-z0-9-]/g, "");
  const subdomain = `fin${runId}${tenantSequence.toString(36)}${safeLabel}`.slice(0, 31);
  const ownerEmail = `finance-${runId}-${label}@test.zw`;
  const ownerPassword = "Finance-Test-123!";
  const { tenant, owner } = await signupTenant({
    companyName: `Finance Kernel ${label}`,
    subdomain,
    baseCurrency: currency,
    ownerEmail,
    ownerPassword,
    ownerName: "Finance Owner",
    planName: "Growth",
  });
  const session = await login(ownerEmail, ownerPassword, subdomain);
  return {
    token: session.token,
    tenantId: tenant.id,
    userId: owner.id,
    auth: { Authorization: `Bearer ${session.token}` },
  };
}

export async function systemAccountId(tenantId: string, systemKey: string) {
  const [account] = await db.select().from(schema.accounts)
    .where(and(eq(schema.accounts.tenantId, tenantId), eq(schema.accounts.systemKey, systemKey)));
  expect(account, `Missing system account ${systemKey}`).toBeTruthy();
  return account.id;
}

export async function accountByCode(tenantId: string, code: string) {
  const [account] = await db.select().from(schema.accounts)
    .where(and(eq(schema.accounts.tenantId, tenantId), eq(schema.accounts.code, code)));
  expect(account, `Missing account ${code}`).toBeTruthy();
  return account;
}

export async function createContact(tenant: TestTenant, name: string, extra: Record<string, unknown> = {}) {
  const [contact] = await db.insert(schema.contacts).values({
    tenantId: tenant.tenantId,
    name,
    type: "COMPANY",
    ownerUserId: tenant.userId,
    ...extra,
  }).returning();
  return contact;
}

export async function defaultWarehouse(tenant: TestTenant) {
  const [warehouse] = await db.select().from(schema.warehouses)
    .where(and(eq(schema.warehouses.tenantId, tenant.tenantId), eq(schema.warehouses.isDefault, true)));
  expect(warehouse).toBeTruthy();
  return warehouse;
}

export async function createProduct(
  tenant: TestTenant,
  label: string,
  overrides: Record<string, unknown> = {},
) {
  const [product] = await db.insert(schema.products).values({
    tenantId: tenant.tenantId,
    sku: `SKU-${runId}-${label}`,
    name: `Finance Product ${label}`,
    costPrice: "10.00",
    salePrice: "15.00",
    taxRate: "15",
    ...overrides,
  }).returning();
  return product;
}

export async function createIssuedServiceInvoice(
  tenant: TestTenant,
  label: string,
  overrides: {
    currency?: "USD" | "ZWG";
    rateToBase?: string;
    unitPrice?: string;
    taxRate?: string;
    quantity?: string;
  } = {},
) {
  const customer = await createContact(tenant, `Customer ${label}`);
  const draft = await createDraftInvoice({
    tenantId: tenant.tenantId,
    contactId: customer.id,
    currency: overrides.currency ?? "USD",
    rateToBase: overrides.rateToBase ?? "1",
    createdBy: tenant.userId,
    lines: [{
      description: `Service ${label}`,
      quantity: overrides.quantity ?? "1",
      unitPrice: overrides.unitPrice ?? "100.00",
      taxRate: overrides.taxRate ?? "15",
    }],
  });
  return issueInvoice({ tenantId: tenant.tenantId, invoiceId: draft.id, createdBy: tenant.userId });
}

export async function createPurchaseOrder(
  tenant: TestTenant,
  productId: string,
  warehouseId: string,
  quantity = "5",
  unitCost = "10.00",
) {
  const vendor = await createContact(tenant, `Vendor ${productId.slice(0, 6)}`, { isVendor: true, isCustomer: false });
  return db.transaction(async (tx) => {
    const lineTotal = fromCents(mulRate(toCents(unitCost), Number(quantity).toFixed(6)));
    const number = await nextDocNumber(tx, tenant.tenantId, "purchase_order", "PO");
    const [po] = await tx.insert(schema.purchaseOrders).values({
      tenantId: tenant.tenantId,
      vendorContactId: vendor.id,
      number,
      status: "ORDERED",
      currency: "USD",
      total: lineTotal,
      createdBy: tenant.userId,
    }).returning();
    await tx.insert(schema.purchaseOrderLineItems).values({
      purchaseOrderId: po.id,
      productId,
      warehouseId,
      quantity,
      unitCost,
      lineTotal,
    });
    return po;
  });
}

export async function expectJournalBalanced(journalEntryId: string) {
  const lines = await db.select().from(schema.journalLines)
    .where(eq(schema.journalLines.journalEntryId, journalEntryId));
  expect(lines.length).toBeGreaterThanOrEqual(2);
  let debit = 0n;
  let credit = 0n;
  for (const line of lines) {
    debit += toCents(line.debit);
    credit += toCents(line.credit);
    const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, line.accountId));
    expect(account).toBeTruthy();
  }
  expect(fromCents(debit)).toBe(fromCents(credit));
}

export async function expectTenantJournalsBalanced(tenantId: string) {
  const entries = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.tenantId, tenantId));
  for (const entry of entries) {
    await expectJournalBalanced(entry.id);
  }
  return entries;
}

export async function journalEntriesBySource(tenantId: string, sourceType: string, sourceId: string) {
  return db.select().from(schema.journalEntries)
    .where(and(
      eq(schema.journalEntries.tenantId, tenantId),
      eq(schema.journalEntries.sourceType, sourceType),
      eq(schema.journalEntries.sourceId, sourceId),
    ));
}

export async function stockQuantityFromMovements(productId: string, warehouseId: string) {
  const result = await db.execute(sql`
    SELECT COALESCE(SUM(quantity_delta), 0)::numeric(12,3)::text AS quantity
    FROM stock_movements
    WHERE product_id = ${productId} AND warehouse_id = ${warehouseId}
  `);
  return (result.rows[0] as { quantity: string }).quantity;
}

export async function stockLevelQuantity(productId: string, warehouseId: string) {
  const [level] = await db.select().from(schema.stockLevels)
    .where(and(eq(schema.stockLevels.productId, productId), eq(schema.stockLevels.warehouseId, warehouseId)));
  return level?.quantityOnHand ?? "0.000";
}
