import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { db, schema } from "../src/lib.js";

const app = createApp();
const uniq = Date.now().toString(36);

async function signup(label: string) {
  const response = await request(app).post("/api/v1/auth/signup").send({
    companyName: `Bank Match ${label}`,
    subdomain: `bankmatch${uniq}${label}`,
    baseCurrency: "USD",
    ownerEmail: `bank-match-${uniq}-${label}@test.zw`,
    ownerPassword: "Match-Password-123!",
    ownerName: "Finance Owner",
    planName: "Growth",
  });
  expect(response.status).toBe(200);
  return response.body;
}

describe("bank invoice matching", () => {
  it("matches an imported positive bank line to an exact open invoice with audit and journal evidence", async () => {
    const tenant = await signup("a");
    const auth = { Authorization: `Bearer ${tenant.token}` };
    const customer = await request(app).post("/api/v1/contacts").set(auth)
      .send({ name: "Exact Match Customer" });
    expect(customer.status).toBe(200);
    const draft = await request(app).post("/api/v1/invoices").set(auth).send({
      contactId: customer.body.id,
      currency: "USD",
      lines: [{ description: "Consulting", quantity: "1", unitPrice: "100.00", taxRate: "0" }],
    });
    expect(draft.status).toBe(200);
    const issued = await request(app).post(`/api/v1/invoices/${draft.body.id}/issue`).set(auth).send({});
    expect(issued.status).toBe(200);
    expect(issued.body.status).toBe("ISSUED");

    const account = await request(app).post("/api/v1/bank-accounts").set(auth).send({
      name: "Operating Account",
      bankName: "Example Zimbabwe Bank",
      accountNumber: "**** 9401",
      currency: "USD",
    });
    expect(account.status).toBe(200);
    const csvText = [
      "date,description,amount,reference",
      `2026-07-03,Customer payment,100.00,${issued.body.number}`,
    ].join("\n");
    const preview = await request(app).post("/api/v1/imports/bank-statement/preview")
      .set(auth).send({ bankAccountId: account.body.id, csvText });
    expect(preview.status).toBe(200);
    const committed = await request(app)
      .post(`/api/v1/imports/bank-statement/${preview.body.batch.id}/commit`)
      .set(auth).send({});
    expect(committed.status).toBe(200);

    const [bankTransaction] = await db.select().from(schema.bankTransactions)
      .where(eq(schema.bankTransactions.bankAccountId, account.body.id));
    const candidates = await request(app)
      .get(`/api/v1/bank-transactions/${bankTransaction.id}/match-candidates`)
      .set(auth);
    expect(candidates.status).toBe(200);
    expect(candidates.body.candidates[0]).toMatchObject({
      id: issued.body.id,
      outstanding: "100.00",
      reference_match: true,
    });

    const other = await signup("b");
    const denied = await request(app)
      .post(`/api/v1/bank-transactions/${bankTransaction.id}/match-invoice`)
      .set({ Authorization: `Bearer ${other.token}` }).send({ invoiceId: issued.body.id });
    expect(denied.status).toBe(404);

    const matched = await request(app)
      .post(`/api/v1/bank-transactions/${bankTransaction.id}/match-invoice`)
      .set(auth).send({ invoiceId: issued.body.id });
    expect(matched.status).toBe(200);
    expect(matched.body.invoice).toMatchObject({ status: "PAID", amountPaid: "100.00" });

    const [updatedBankTransaction] = await db.select().from(schema.bankTransactions)
      .where(eq(schema.bankTransactions.id, bankTransaction.id));
    expect(updatedBankTransaction.matchedJournalEntryId).toBe(matched.body.journalEntryId);
    const [journal] = await db.select().from(schema.journalEntries)
      .where(eq(schema.journalEntries.id, matched.body.journalEntryId));
    expect(journal).toMatchObject({ sourceType: "payment", sourceId: issued.body.id });
    const payments = await db.select().from(schema.payments).where(eq(schema.payments.invoiceId, issued.body.id));
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ amount: "100.00", bankAccountId: account.body.id });

    const replay = await request(app)
      .post(`/api/v1/bank-transactions/${bankTransaction.id}/match-invoice`)
      .set(auth).send({ invoiceId: issued.body.id });
    expect(replay.status).toBe(409);
  });
});
