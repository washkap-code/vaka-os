import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { db, schema } from "../src/lib.js";

const app = createApp();
const uniq = Date.now().toString(36);

async function signup(label: string) {
  const response = await request(app).post("/api/v1/auth/signup").send({
    companyName: `Bank Import ${label}`,
    subdomain: `bankimport${uniq}${label}`,
    baseCurrency: "USD",
    ownerEmail: `bank-import-${uniq}-${label}@test.zw`,
    ownerPassword: "Import-Password-123!",
    ownerName: "Finance Owner",
    planName: "Growth",
  });
  expect(response.status).toBe(200);
  return response.body;
}

describe("bank statement CSV imports", () => {
  it("imports an exact unreviewed feed without posting accounting entries", async () => {
    const tenant = await signup("a");
    const auth = { Authorization: `Bearer ${tenant.token}` };
    const account = await request(app).post("/api/v1/bank-accounts").set(auth).send({
      name: "Operating Account",
      bankName: "Example Zimbabwe Bank",
      accountNumber: "**** 4821",
      currency: "USD",
    });
    expect(account.status).toBe(200);
    const csvText = [
      "date,description,amount,reference",
      "2026-07-01,Customer payment,100.00,INV-1001",
      "02/07/2026,Bank charge,-20.00,FEE-22",
      "2026-13-40,Invalid date,10.00,BAD",
    ].join("\n");
    const preview = await request(app).post("/api/v1/imports/bank-statement/preview")
      .set(auth).send({ bankAccountId: account.body.id, csvText });
    expect(preview.status).toBe(200);
    expect(preview.body.batch).toMatchObject({
      totalRows: 3, validRows: 2, duplicateRows: 0, invalidRows: 1,
    });

    const other = await signup("b");
    const denied = await request(app)
      .post(`/api/v1/imports/bank-statement/${preview.body.batch.id}/commit`)
      .set({ Authorization: `Bearer ${other.token}` }).send({});
    expect(denied.status).toBe(409);

    const committed = await request(app)
      .post(`/api/v1/imports/bank-statement/${preview.body.batch.id}/commit`)
      .set(auth).send({});
    expect(committed.status).toBe(200);
    expect(committed.body).toMatchObject({ importedRows: 2, accountCurrency: "USD" });

    const transactions = await db.select().from(schema.bankTransactions)
      .where(eq(schema.bankTransactions.bankAccountId, account.body.id));
    expect(transactions.map((row) => row.amount).sort()).toEqual(["-20.00", "100.00"]);
    expect(transactions.every((row) => row.matchedJournalEntryId === null)).toBe(true);
    const summary = await request(app)
      .get(`/api/v1/bank-accounts/${account.body.id}/reconciliation-summary`)
      .set(auth);
    expect(summary.status).toBe(200);
    expect(summary.body).toMatchObject({
      totalLines: 2,
      matchedLines: 0,
      unreviewedLines: 2,
      inflow: "100.00",
      outflow: "20.00",
      netMovement: "80.00",
      unreviewedNet: "80.00",
    });
    const worksheet = await request(app)
      .get(`/api/v1/bank-accounts/${account.body.id}/reconciliation-worksheet?statementDate=2026-07-31&statementClosingBalance=80.00`)
      .set(auth);
    expect(worksheet.status).toBe(200);
    expect(worksheet.body).toMatchObject({
      statementDate: "2026-07-31",
      statementClosingBalance: "80.00",
      openingBalance: "0.00",
      importedNetMovement: "80.00",
      expectedBookBalance: "80.00",
      difference: "0.00",
      totalLines: 2,
      matchedLines: 0,
      unreviewedLines: 2,
      unreviewedNet: "80.00",
      status: "needs_review",
    });
    const differenceWorksheet = await request(app)
      .get(`/api/v1/bank-accounts/${account.body.id}/reconciliation-worksheet?statementDate=2026-07-31&statementClosingBalance=70.00`)
      .set(auth);
    expect(differenceWorksheet.status).toBe(200);
    expect(differenceWorksheet.body.difference).toBe("10.00");
    const importedJournal = await db.select().from(schema.journalEntries)
      .where(eq(schema.journalEntries.sourceType, "bank_statement_import"));
    expect(importedJournal).toHaveLength(0);

    const otherRead = await request(app)
      .get(`/api/v1/bank-transactions?bankAccountId=${account.body.id}`)
      .set({ Authorization: `Bearer ${other.token}` });
    expect(otherRead.status).toBe(404);
    const otherSummary = await request(app)
      .get(`/api/v1/bank-accounts/${account.body.id}/reconciliation-summary`)
      .set({ Authorization: `Bearer ${other.token}` });
    expect(otherSummary.status).toBe(404);
    const otherWorksheet = await request(app)
      .get(`/api/v1/bank-accounts/${account.body.id}/reconciliation-worksheet?statementDate=2026-07-31&statementClosingBalance=80.00`)
      .set({ Authorization: `Bearer ${other.token}` });
    expect(otherWorksheet.status).toBe(404);

    const retry = await request(app)
      .post(`/api/v1/imports/bank-statement/${preview.body.batch.id}/commit`)
      .set(auth).send({});
    expect(retry.status).toBe(409);

    const duplicatePreview = await request(app).post("/api/v1/imports/bank-statement/preview")
      .set(auth).send({ bankAccountId: account.body.id, csvText });
    expect(duplicatePreview.status).toBe(200);
    expect(duplicatePreview.body.batch).toMatchObject({
      totalRows: 3, validRows: 0, duplicateRows: 2, invalidRows: 1,
    });
  });
});
