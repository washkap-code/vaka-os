import { describe, expect, it } from "vitest";
import { db } from "../../src/lib.js";
import { postJournal } from "../../src/accounting.js";
import { accountByCode, signupFinanceTenant } from "./helpers.js";

describe("finance kernel - invalid journal lines", () => {
  it("rejects negative debit, negative credit, both-sided lines, zero-value journals, and single-line journals", async () => {
    const tenant = await signupFinanceTenant("invalid-lines");
    const bank = await accountByCode(tenant.tenantId, "1000");
    const sales = await accountByCode(tenant.tenantId, "4000");

    await expect(db.transaction((tx) => postJournal(tx, {
      tenantId: tenant.tenantId,
      date: new Date("2026-07-01T00:00:00.000Z"),
      memo: "Negative debit",
      sourceType: "manual_test",
      lines: [{ accountId: bank.id, debit: "-1.00" }, { accountId: sales.id, credit: "-1.00" }],
    }))).rejects.toThrow(/non-negative/);

    await expect(db.transaction((tx) => postJournal(tx, {
      tenantId: tenant.tenantId,
      date: new Date("2026-07-01T00:00:00.000Z"),
      memo: "Negative credit",
      sourceType: "manual_test",
      lines: [{ accountId: bank.id, debit: "1.00" }, { accountId: sales.id, credit: "-1.00" }],
    }))).rejects.toThrow(/non-negative/);

    await expect(db.transaction((tx) => postJournal(tx, {
      tenantId: tenant.tenantId,
      date: new Date("2026-07-01T00:00:00.000Z"),
      memo: "Both debit and credit",
      sourceType: "manual_test",
      lines: [{ accountId: bank.id, debit: "1.00", credit: "1.00" }, { accountId: sales.id, credit: "1.00" }],
    }))).rejects.toThrow(/both debit and credit/);

    await expect(db.transaction((tx) => postJournal(tx, {
      tenantId: tenant.tenantId,
      date: new Date("2026-07-01T00:00:00.000Z"),
      memo: "Zero value",
      sourceType: "manual_test",
      lines: [{ accountId: bank.id, debit: "0.00" }, { accountId: sales.id, credit: "0.00" }],
    }))).rejects.toThrow(/zero value/);

    await expect(db.transaction((tx) => postJournal(tx, {
      tenantId: tenant.tenantId,
      date: new Date("2026-07-01T00:00:00.000Z"),
      memo: "Single line",
      sourceType: "manual_test",
      lines: [{ accountId: bank.id, debit: "1.00" }],
    }))).rejects.toThrow(/at least 2 lines/);
  });

  it("currently allows a zero-value line inside an otherwise balanced journal", async () => {
    const tenant = await signupFinanceTenant("zero-line");
    const bank = await accountByCode(tenant.tenantId, "1000");
    const sales = await accountByCode(tenant.tenantId, "4000");
    const expense = await accountByCode(tenant.tenantId, "6900");

    const journalEntryId = await db.transaction((tx) => postJournal(tx, {
      tenantId: tenant.tenantId,
      date: new Date("2026-07-01T00:00:00.000Z"),
      memo: "Balanced with zero line",
      sourceType: "manual_test",
      lines: [
        { accountId: bank.id, debit: "10.00" },
        { accountId: sales.id, credit: "10.00" },
        { accountId: expense.id, debit: "0.00", credit: "0.00" },
      ],
    }));
    expect(journalEntryId).toEqual(expect.any(String));
  });
});

