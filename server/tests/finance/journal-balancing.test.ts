import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, audit, fromCents, mulRate, schema, toCents } from "../../src/lib.js";
import { createDraftInvoice, recordPayment } from "../../src/invoicing.js";
import { adjustStock } from "../../src/inventory.js";
import { postJournal, systemAccount } from "../../src/accounting.js";
import { commitBankStatementImport, previewBankStatementImport } from "../../src/imports.js";
import {
  accountByCode, createContact, createIssuedServiceInvoice, createProduct,
  createPurchaseOrder, defaultWarehouse, expectJournalBalanced,
  expectTenantJournalsBalanced, journalEntriesBySource, receiveTestPurchaseOrder, signupFinanceTenant,
} from "./helpers.js";

describe("finance kernel - journal balancing across posting paths", () => {
  it("posts balanced journals for invoice issue, payment receipt, expense, stock adjustment, and PO receipt", async () => {
    const tenant = await signupFinanceTenant("balancing");
    const invoice = await createIssuedServiceInvoice(tenant, "balancing");
    const invoiceJournals = await journalEntriesBySource(tenant.tenantId, "invoice", invoice.id);
    expect(invoiceJournals).toHaveLength(1);
    expect(invoiceJournals[0]).toMatchObject({ tenantId: tenant.tenantId, sourceType: "invoice", sourceId: invoice.id });
    await expectJournalBalanced(invoiceJournals[0].id);

    await recordPayment({
      tenantId: tenant.tenantId,
      invoiceId: invoice.id,
      amount: "40.00",
      reference: "Mission 2 receipt",
      idempotencyKey: "payment-balancing-1",
      createdBy: tenant.userId,
    });
    const paymentJournals = await journalEntriesBySource(tenant.tenantId, "payment", invoice.id);
    expect(paymentJournals).toHaveLength(1);
    await expectJournalBalanced(paymentJournals[0].id);

    const expenseAccount = await accountByCode(tenant.tenantId, "6900");
    const expense = await db.transaction(async (tx) => {
      const [exp] = await tx.insert(schema.expenses).values({
        tenantId: tenant.tenantId,
        categoryAccountId: expenseAccount.id,
        amount: "12.50",
        currency: "USD",
        rateToBase: "1",
        date: new Date("2026-07-02T00:00:00.000Z"),
        description: "Mission 2 expense",
        createdBy: tenant.userId,
      }).returning();
      const bank = await systemAccount(tx, tenant.tenantId, "BANK");
      await postJournal(tx, {
        tenantId: tenant.tenantId,
        date: exp.date,
        memo: `Expense - ${exp.description}`,
        sourceType: "expense",
        sourceId: exp.id,
        createdBy: tenant.userId,
        lines: [
          { accountId: expenseAccount.id, debit: fromCents(mulRate(toCents(exp.amount), exp.rateToBase)), originalAmount: exp.amount, originalCurrency: exp.currency, exchangeRate: exp.rateToBase },
          { accountId: bank.id, credit: fromCents(mulRate(toCents(exp.amount), exp.rateToBase)) },
        ],
      });
      await audit(tx, tenant.tenantId, tenant.userId, "expense.recorded", "expense", exp.id, { amount: exp.amount, currency: exp.currency });
      return exp;
    });
    const expenseJournals = await journalEntriesBySource(tenant.tenantId, "expense", expense.id);
    expect(expenseJournals).toHaveLength(1);
    await expectJournalBalanced(expenseJournals[0].id);

    const warehouse = await defaultWarehouse(tenant);
    const product = await createProduct(tenant, "balancing", { costPrice: "8.00", salePrice: "12.00" });
    const po = await createPurchaseOrder(tenant, product.id, warehouse.id, "4", "8.00");
    const receipt = await receiveTestPurchaseOrder(tenant, po, "goods-receipt-balancing-1");
    const poJournals = await journalEntriesBySource(tenant.tenantId, "goods_receipt", receipt.receipt.id);
    expect(poJournals).toHaveLength(1);
    await expectJournalBalanced(poJournals[0].id);

    const adjustment = await db.transaction((tx) => adjustStock(tx, {
      tenantId: tenant.tenantId,
      productId: product.id,
      warehouseId: warehouse.id,
      quantityDelta: "-1",
      note: "Mission 2 shrinkage evidence",
      idempotencyKey: "stock-balancing-1",
      createdBy: tenant.userId,
    }));
    const adjustmentJournals = await journalEntriesBySource(tenant.tenantId, "stock_adjustment", adjustment.movementId);
    expect(adjustmentJournals).toHaveLength(1);
    await expectJournalBalanced(adjustmentJournals[0].id);

    const entries = await expectTenantJournalsBalanced(tenant.tenantId);
    expect(entries.length).toBeGreaterThanOrEqual(5);
  });

  it("invoice draft creation and bank statement import do not post journals", async () => {
    const tenant = await signupFinanceTenant("non-posting");
    const customer = await createContact(tenant, "Draft Customer");
    const draft = await createDraftInvoice({
      tenantId: tenant.tenantId,
      contactId: customer.id,
      currency: "USD",
      createdBy: tenant.userId,
      lines: [{ description: "Draft only", quantity: "1", unitPrice: "10.00", taxRate: "15" }],
    });
    expect(await journalEntriesBySource(tenant.tenantId, "invoice", draft.id)).toHaveLength(0);

    const [bank] = await db.insert(schema.bankAccounts).values({
      tenantId: tenant.tenantId,
      name: "Mission 2 Bank",
      bankName: "Example Bank",
      accountNumber: "**** 2222",
      currency: "USD",
    }).returning();
    const preview = await previewBankStatementImport({
      tenantId: tenant.tenantId,
      actorUserId: tenant.userId,
      bankAccountId: bank.id,
      csvText: ["date,description,amount,reference", "2026-07-01,Deposit,25.00,DEP-1"].join("\n"),
    });
    await commitBankStatementImport({ tenantId: tenant.tenantId, actorUserId: tenant.userId, batchId: preview.batch.id });
    const importedJournals = await db.select().from(schema.journalEntries)
      .where(and(eq(schema.journalEntries.tenantId, tenant.tenantId), eq(schema.journalEntries.sourceType, "bank_statement_import")));
    expect(importedJournals).toHaveLength(0);
  });
});
