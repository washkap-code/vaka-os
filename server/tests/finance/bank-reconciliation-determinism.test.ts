import { describe, expect, it } from "vitest";
import { db, schema } from "../../src/lib.js";
import {
  approveBankReconciliation, getBankReconciliationWorksheet, prepareBankReconciliation,
} from "../../src/bank-reconciliation.js";
import { commitBankStatementImport, previewBankStatementImport } from "../../src/imports.js";
import { signupFinanceTenant } from "./helpers.js";

describe("finance kernel - bank reconciliation determinism", () => {
  it("returns deterministic worksheet values for repeated calculations and records duplicate imports", async () => {
    const tenant = await signupFinanceTenant("bank-determinism");
    const [bank] = await db.insert(schema.bankAccounts).values({
      tenantId: tenant.tenantId,
      name: "Deterministic Bank",
      bankName: "Example Bank",
      accountNumber: "**** 5555",
      currency: "USD",
    }).returning();
    const csvText = [
      "date,description,amount,reference",
      "2026-07-01,Customer receipt,150.00,DEP-150",
      "2026-07-02,Bank charge,-10.00,FEE-10",
      "2026-07-03,Supplier payment,-40.00,PAY-40",
    ].join("\n");
    const preview = await previewBankStatementImport({ tenantId: tenant.tenantId, actorUserId: tenant.userId, bankAccountId: bank.id, csvText });
    await commitBankStatementImport({ tenantId: tenant.tenantId, actorUserId: tenant.userId, batchId: preview.batch.id });

    const first = await getBankReconciliationWorksheet({ tenantId: tenant.tenantId, bankAccountId: bank.id, statementDate: "2026-07-31", statementClosingBalance: "100.00" });
    const second = await getBankReconciliationWorksheet({ tenantId: tenant.tenantId, bankAccountId: bank.id, statementDate: "2026-07-31", statementClosingBalance: "100.00" });
    expect(second).toMatchObject({
      statementClosingBalance: first.statementClosingBalance,
      openingBalance: first.openingBalance,
      importedNetMovement: first.importedNetMovement,
      expectedBookBalance: first.expectedBookBalance,
      difference: first.difference,
      totalLines: first.totalLines,
      matchedLines: first.matchedLines,
      unreviewedLines: first.unreviewedLines,
      unreviewedNet: first.unreviewedNet,
      status: first.status,
    });
    expect(first).toMatchObject({
      importedNetMovement: "100.00",
      expectedBookBalance: "100.00",
      difference: "0.00",
      totalLines: 3,
      matchedLines: 0,
      unreviewedLines: 3,
      unreviewedNet: "100.00",
      status: "needs_review",
    });

    const needsReview = await prepareBankReconciliation({
      tenantId: tenant.tenantId,
      actorUserId: tenant.userId,
      bankAccountId: bank.id,
      statementDate: "2026-07-31",
      statementClosingBalance: "100.00",
    });
    expect(needsReview.reconciliationStatus).toBe("needs_review");
    await expect(prepareBankReconciliation({
      tenantId: tenant.tenantId,
      actorUserId: tenant.userId,
      bankAccountId: bank.id,
      statementDate: "2026-07-31",
      statementClosingBalance: "100.00",
    })).rejects.toThrow(/already exists/);

    const secondPreview = await previewBankStatementImport({ tenantId: tenant.tenantId, actorUserId: tenant.userId, bankAccountId: bank.id, csvText });
    expect(secondPreview.batch).toMatchObject({ validRows: 0, duplicateRows: 3 });
  });

  it("approves a balanced reconciliation with no unreviewed lines deterministically", async () => {
    const tenant = await signupFinanceTenant("bank-balanced");
    const [bank] = await db.insert(schema.bankAccounts).values({
      tenantId: tenant.tenantId,
      name: "Empty Balanced Bank",
      bankName: "Example Bank",
      accountNumber: "**** 6666",
      currency: "USD",
    }).returning();
    const prepared = await prepareBankReconciliation({
      tenantId: tenant.tenantId,
      actorUserId: tenant.userId,
      bankAccountId: bank.id,
      statementDate: "2026-07-31",
      statementClosingBalance: "0.00",
    });
    expect(prepared).toMatchObject({
      expectedBookBalance: "0.00",
      difference: "0.00",
      totalLines: 0,
      matchedLines: 0,
      unreviewedLines: 0,
      unreviewedNet: "0.00",
      reconciliationStatus: "balanced",
    });
    const approved = await approveBankReconciliation({ tenantId: tenant.tenantId, actorUserId: tenant.userId, reconciliationId: prepared.id });
    expect(approved.status).toBe("APPROVED");
  });
});
