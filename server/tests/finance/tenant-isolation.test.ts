import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "../../src/lib.js";
import { recordPayment } from "../../src/invoicing.js";
import { postGoodsReceipt } from "../../src/procurement.js";
import { postJournal, systemAccount } from "../../src/accounting.js";
import {
  accountByCode, createIssuedServiceInvoice, createProduct, createPurchaseOrder,
  defaultWarehouse, signupFinanceTenant,
} from "./helpers.js";

describe("finance kernel - tenant isolation", () => {
  it("blocks cross-tenant reads and cross-tenant source object use through finance routes", async () => {
    const tenantA = await signupFinanceTenant("isolation-a");
    const tenantB = await signupFinanceTenant("isolation-b");
    const invoiceA = await createIssuedServiceInvoice(tenantA, "isolation-a");

    const [readInvoice] = await db.select().from(schema.invoices)
      .where(and(eq(schema.invoices.id, invoiceA.id), eq(schema.invoices.tenantId, tenantB.tenantId)));
    expect(readInvoice).toBeUndefined();

    const journalB = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.tenantId, tenantB.tenantId));
    expect(JSON.stringify(journalB)).not.toContain(invoiceA.id);

    await expect(recordPayment({
      tenantId: tenantB.tenantId,
      invoiceId: invoiceA.id,
      amount: "10.00",
      idempotencyKey: "payment-isolation-1",
      createdBy: tenantB.userId,
    })).rejects.toThrow(/Invoice not found/);

    const [bankA] = await db.insert(schema.bankAccounts).values({
      tenantId: tenantA.tenantId,
      name: "Tenant A Bank",
      bankName: "Example Bank",
      accountNumber: "**** 4444",
      currency: "USD",
    }).returning();
    const [bankReadByB] = await db.select().from(schema.bankAccounts)
      .where(and(eq(schema.bankAccounts.id, bankA.id), eq(schema.bankAccounts.tenantId, tenantB.tenantId)));
    expect(bankReadByB).toBeUndefined();

    const productA = await createProduct(tenantA, "isolation-a");
    await expect(db.transaction(async (tx) => {
      const inventory = await systemAccount(tx, tenantB.tenantId, "INVENTORY");
      const opening = await systemAccount(tx, tenantB.tenantId, "OPENING_EQUITY");
      await postJournal(tx, {
        tenantId: tenantB.tenantId,
        date: new Date(),
        memo: "Tenant isolation probe",
        sourceType: "manual_test",
        lines: [
          { accountId: inventory.id, debit: "1.00" },
          { accountId: opening.id, credit: "1.00" },
        ],
      });
    })).resolves.toBeUndefined();
    const stockByB = await db.select().from(schema.stockMovements).where(and(
      eq(schema.stockMovements.tenantId, tenantB.tenantId),
      eq(schema.stockMovements.productId, productA.id),
    ));
    expect(stockByB).toHaveLength(0);
  });

  it("rejects cross-tenant and mixed-tenant account references atomically", async () => {
    const tenantA = await signupFinanceTenant("cross-account-a");
    const tenantB = await signupFinanceTenant("cross-account-b");
    const tenantAExpenseAccount = await accountByCode(tenantA.tenantId, "6900");
    const tenantAInventory = await accountByCode(tenantA.tenantId, "1200");

    const before = await db.select().from(schema.journalEntries)
      .where(eq(schema.journalEntries.tenantId, tenantB.tenantId));

    await expect(db.transaction(async (tx) => {
      const bank = await systemAccount(tx, tenantB.tenantId, "BANK");
      return postJournal(tx, {
        tenantId: tenantB.tenantId,
        date: new Date("2026-07-04T00:00:00.000Z"),
        memo: "Cross-tenant account probe",
        sourceType: "manual_test",
        sourceId: "cross-tenant-account",
        createdBy: tenantB.userId,
        lines: [
          { accountId: tenantAExpenseAccount.id, debit: "7.00" },
          { accountId: bank.id, credit: "7.00" },
        ],
      });
    })).rejects.toThrow(/account is invalid/);

    await expect(db.transaction((tx) => postJournal(tx, {
      tenantId: tenantB.tenantId,
      date: new Date("2026-07-04T00:00:00.000Z"),
      memo: "Mixed tenant account probe",
      sourceType: "manual_test",
      sourceId: "mixed-tenant-account",
      createdBy: tenantB.userId,
      lines: [
        { accountId: tenantAInventory.id, debit: "7.00" },
        { accountId: tenantAExpenseAccount.id, credit: "7.00" },
      ],
    }))).rejects.toThrow(/account is invalid/);

    const after = await db.select().from(schema.journalEntries)
      .where(eq(schema.journalEntries.tenantId, tenantB.tenantId));
    expect(after).toHaveLength(before.length);
    const allLines = await db.select().from(schema.journalLines);
    expect(allLines.some((line) => line.accountId === tenantAExpenseAccount.id)).toBe(false);
  });

  it("does not allow tenant B to receive tenant A's purchase order", async () => {
    const tenantA = await signupFinanceTenant("po-isolation-a");
    const tenantB = await signupFinanceTenant("po-isolation-b");
    const warehouseA = await defaultWarehouse(tenantA);
    const productA = await createProduct(tenantA, "po-isolation");
    const poA = await createPurchaseOrder(tenantA, productA.id, warehouseA.id);

    await expect(postGoodsReceipt({
      tenantId: tenantB.tenantId,
      purchaseOrderId: poA.id,
      actorUserId: tenantB.userId,
      idempotencyKey: "goods-receipt-cross-tenant-1",
      input: { lines: [{ purchaseOrderLineItemId: poA.lines[0].id, quantity: "1" }] },
    })).rejects.toThrow(/Purchase order not found/);
    expect(await db.select().from(schema.stockMovements).where(eq(schema.stockMovements.tenantId, tenantB.tenantId))).toHaveLength(0);
  });
});
