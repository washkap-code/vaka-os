import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { db, schema } from "../../src/lib.js";
import { recordPayment } from "../../src/invoicing.js";
import { adjustStock } from "../../src/inventory.js";
import { postGoodsReceipt } from "../../src/procurement.js";
import { commitBankStatementImport, previewBankStatementImport } from "../../src/imports.js";
import {
  accountByCode, createContact, createIssuedServiceInvoice, createProduct, createPurchaseOrder,
  defaultWarehouse, journalEntriesBySource, receiveTestPurchaseOrder, signupFinanceTenant,
} from "./helpers.js";

const app = createApp();

describe("finance kernel - current source duplicate protections", () => {
  it("uses business-state protection for repeated invoice issue and PO receipt", async () => {
    const tenant = await signupFinanceTenant("state-protection");
    const invoice = await createIssuedServiceInvoice(tenant, "state-protection");
    await expect(import("../../src/invoicing.js").then(({ issueInvoice }) =>
      issueInvoice({ tenantId: tenant.tenantId, invoiceId: invoice.id, createdBy: tenant.userId }))).rejects.toThrow(/Only DRAFT/);
    expect(await journalEntriesBySource(tenant.tenantId, "invoice", invoice.id)).toHaveLength(1);

    const warehouse = await defaultWarehouse(tenant);
    const product = await createProduct(tenant, "state-protection");
    const po = await createPurchaseOrder(tenant, product.id, warehouse.id, "2", "10.00");
    const receipt = await receiveTestPurchaseOrder(tenant, po, "goods-receipt-state-protection-1");
    const replay = await receiveTestPurchaseOrder(tenant, po, "goods-receipt-state-protection-1");
    expect(replay).toMatchObject({ replayed: true, receipt: { id: receipt.receipt.id } });
    await expect(postGoodsReceipt({
      tenantId: tenant.tenantId,
      purchaseOrderId: po.id,
      actorUserId: tenant.userId,
      idempotencyKey: "goods-receipt-state-protection-1",
      input: { lines: [{ purchaseOrderLineItemId: po.lines[0].id, quantity: "1" }] },
    })).rejects.toThrow(/different goods receipt details/);
    expect(await journalEntriesBySource(tenant.tenantId, "goods_receipt", receipt.receipt.id)).toHaveLength(1);
  });

  it("requires explicit idempotency keys and detects conflicting payment, expense, and stock adjustment retries", async () => {
    const tenant = await signupFinanceTenant("duplicate-effects");
    const invoice = await createIssuedServiceInvoice(tenant, "duplicate-effects", { unitPrice: "200.00" });

    const paymentBody = { amount: "25.00", reference: "Same external receipt", idempotencyKey: "pay-duplicate-effects-1" };
    await recordPayment({ tenantId: tenant.tenantId, invoiceId: invoice.id, ...paymentBody, createdBy: tenant.userId });
    await recordPayment({ tenantId: tenant.tenantId, invoiceId: invoice.id, ...paymentBody, createdBy: tenant.userId });
    expect(await journalEntriesBySource(tenant.tenantId, "payment", invoice.id)).toHaveLength(1);
    await expect(recordPayment({
      tenantId: tenant.tenantId,
      invoiceId: invoice.id,
      amount: "30.00",
      reference: "Same external receipt",
      idempotencyKey: "pay-duplicate-effects-1",
      createdBy: tenant.userId,
    })).rejects.toThrow(/different payment details/);
    const missingPaymentKey = await request(app).post(`/api/v1/invoices/${invoice.id}/payments`)
      .set(tenant.auth)
      .send({ amount: "5.00", reference: "Missing key" });
    expect(missingPaymentKey.status).toBe(400);
    expect(missingPaymentKey.body.message).toMatch(/Idempotency-Key is required/);
    await recordPayment({
      tenantId: tenant.tenantId,
      invoiceId: invoice.id,
      amount: "25.00",
      reference: "Separate receipt",
      idempotencyKey: "pay-duplicate-effects-2",
      createdBy: tenant.userId,
    });
    expect(await journalEntriesBySource(tenant.tenantId, "payment", invoice.id)).toHaveLength(2);

    const expenseAccount = await accountByCode(tenant.tenantId, "6900");
    const expenseBody = {
      categoryAccountId: expenseAccount.id,
      amount: "5.00",
      currency: "USD" as const,
      rateToBase: "1",
      date: "2026-07-03T00:00:00.000Z",
      description: "Repeated expense request",
      idempotencyKey: "expense-duplicate-effects-1",
    };
    const missingExpenseKey = await request(app).post("/api/v1/expenses").set(tenant.auth).send({
      ...expenseBody,
      idempotencyKey: undefined,
    });
    expect(missingExpenseKey.status).toBe(400);
    const firstExpense = await request(app).post("/api/v1/expenses")
      .set(tenant.auth)
      .set("Idempotency-Key", expenseBody.idempotencyKey)
      .send({ ...expenseBody, idempotencyKey: undefined });
    const secondExpense = await request(app).post("/api/v1/expenses")
      .set(tenant.auth)
      .set("Idempotency-Key", expenseBody.idempotencyKey)
      .send({ ...expenseBody, idempotencyKey: undefined });
    expect(firstExpense.status).toBe(200);
    expect(secondExpense.status).toBe(200);
    expect(secondExpense.body.id).toBe(firstExpense.body.id);
    const conflictingExpense = await request(app).post("/api/v1/expenses")
      .set(tenant.auth)
      .set("Idempotency-Key", expenseBody.idempotencyKey)
      .send({ ...expenseBody, amount: "6.00", idempotencyKey: undefined });
    expect(conflictingExpense.status).toBe(409);
    expect(conflictingExpense.body.message).toMatch(/different expense details/);
    const expenseJournals = await journalEntriesBySource(tenant.tenantId, "expense", firstExpense.body.id);
    expect(expenseJournals).toHaveLength(1);

    const warehouse = await defaultWarehouse(tenant);
    const product = await createProduct(tenant, "duplicate-effects-stock");
    const po = await createPurchaseOrder(tenant, product.id, warehouse.id, "5", "10.00");
    await receiveTestPurchaseOrder(tenant, po, "goods-receipt-duplicate-effects-1");
    const adjustmentBody = { productId: product.id, warehouseId: warehouse.id, quantityDelta: "-1", note: "Repeated adjustment", idempotencyKey: "stock-duplicate-effects-1" };
    await db.transaction((tx) => adjustStock(tx, { tenantId: tenant.tenantId, ...adjustmentBody, createdBy: tenant.userId }));
    await db.transaction((tx) => adjustStock(tx, { tenantId: tenant.tenantId, ...adjustmentBody, createdBy: tenant.userId }));
    const movements = await db.select().from(schema.stockMovements).where(eq(schema.stockMovements.productId, product.id));
    expect(movements.filter((movement) => movement.reason === "ADJUSTMENT")).toHaveLength(1);
    await expect(db.transaction((tx) => adjustStock(tx, {
      tenantId: tenant.tenantId,
      productId: product.id,
      warehouseId: warehouse.id,
      quantityDelta: "-2",
      note: "Repeated adjustment",
      idempotencyKey: "stock-duplicate-effects-1",
      createdBy: tenant.userId,
    }))).rejects.toThrow(/different stock adjustment details/);
    const missingStockKey = await request(app).post("/api/v1/stock/adjust").set(tenant.auth).send({
      productId: product.id,
      warehouseId: warehouse.id,
      quantityDelta: "-1",
      note: "Missing key adjustment",
    });
    expect(missingStockKey.status).toBe(400);
    await db.transaction((tx) => adjustStock(tx, {
      tenantId: tenant.tenantId,
      productId: product.id,
      warehouseId: warehouse.id,
      quantityDelta: "-1",
      note: "Separate adjustment",
      idempotencyKey: "stock-duplicate-effects-2",
      createdBy: tenant.userId,
    }));
    const movementsAfterDistinct = await db.select().from(schema.stockMovements).where(eq(schema.stockMovements.productId, product.id));
    expect(movementsAfterDistinct.filter((movement) => movement.reason === "ADJUSTMENT")).toHaveLength(2);
  });

  it("rejects expense accounts and vendor contacts that do not belong to the current tenant", async () => {
    const tenant = await signupFinanceTenant("expense-tenant-boundary");
    const otherTenant = await signupFinanceTenant("expense-tenant-other");
    const otherExpenseAccount = await accountByCode(otherTenant.tenantId, "6900");
    const otherVendor = await createContact(otherTenant, "Other tenant vendor", {
      isVendor: true,
      isCustomer: false,
    });
    const tenantExpenseAccount = await accountByCode(tenant.tenantId, "6900");
    const baseExpense = {
      amount: "5.00",
      currency: "USD" as const,
      rateToBase: "1",
      date: "2026-07-03T00:00:00.000Z",
      description: "Tenant boundary test",
    };

    const crossTenantAccount = await request(app).post("/api/v1/expenses")
      .set(tenant.auth)
      .set("Idempotency-Key", "expense-cross-tenant-account")
      .send({ ...baseExpense, categoryAccountId: otherExpenseAccount.id });
    expect(crossTenantAccount.status).toBe(404);

    const crossTenantVendor = await request(app).post("/api/v1/expenses")
      .set(tenant.auth)
      .set("Idempotency-Key", "expense-cross-tenant-vendor")
      .send({
        ...baseExpense,
        categoryAccountId: tenantExpenseAccount.id,
        vendorContactId: otherVendor.id,
      });
    expect(crossTenantVendor.status).toBe(404);

    const expenses = await db.select().from(schema.expenses)
      .where(eq(schema.expenses.tenantId, tenant.tenantId));
    expect(expenses).toHaveLength(0);
  });

  it("uses database uniqueness plus import state to prevent repeated bank transaction imports", async () => {
    const tenant = await signupFinanceTenant("bank-duplicates");
    const [bank] = await db.insert(schema.bankAccounts).values({
      tenantId: tenant.tenantId,
      name: "Duplicate Import Bank",
      bankName: "Example Bank",
      accountNumber: "**** 3333",
      currency: "USD",
    }).returning();
    const csvText = ["date,description,amount,reference", "2026-07-01,Deposit,25.00,DEP-1"].join("\n");
    const preview = await previewBankStatementImport({ tenantId: tenant.tenantId, actorUserId: tenant.userId, bankAccountId: bank.id, csvText });
    await commitBankStatementImport({ tenantId: tenant.tenantId, actorUserId: tenant.userId, batchId: preview.batch.id });
    await expect(commitBankStatementImport({ tenantId: tenant.tenantId, actorUserId: tenant.userId, batchId: preview.batch.id }))
      .rejects.toThrow(/unavailable|already processed/);

    const secondPreview = await previewBankStatementImport({ tenantId: tenant.tenantId, actorUserId: tenant.userId, bankAccountId: bank.id, csvText });
    expect(secondPreview.batch.duplicateRows).toBe(1);
  });
});
