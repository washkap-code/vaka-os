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
  // Synthetic exempt lines keep these fixtures focused on bank allocation,
  // not on whether a real Zimbabwe supply qualifies for a tax treatment.
  it("matches an imported positive bank line to an exact open invoice with audit and journal evidence", async () => {
    const tenant = await signup("a");
    const auth = { Authorization: `Bearer ${tenant.token}` };
    const customer = await request(app).post("/api/v1/contacts").set(auth)
      .send({ name: "Exact Match Customer" });
    expect(customer.status).toBe(200);
    const draft = await request(app).post("/api/v1/invoices").set(auth).send({
      contactId: customer.body.id,
      currency: "USD",
      lines: [{ description: "Consulting", quantity: "1", unitPrice: "100.00", taxTreatment: "exempt" }],
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

  it("can match a positive bank line as a partial payment on one open invoice", async () => {
    const tenant = await signup("partial");
    const auth = { Authorization: `Bearer ${tenant.token}` };
    const customer = await request(app).post("/api/v1/contacts").set(auth)
      .send({ name: "Partial Payment Customer" });
    expect(customer.status).toBe(200);
    const draft = await request(app).post("/api/v1/invoices").set(auth).send({
      contactId: customer.body.id,
      currency: "USD",
      lines: [{ description: "Implementation", quantity: "1", unitPrice: "250.00", taxTreatment: "exempt" }],
    });
    expect(draft.status).toBe(200);
    const issued = await request(app).post(`/api/v1/invoices/${draft.body.id}/issue`).set(auth).send({});
    expect(issued.status).toBe(200);

    const account = await request(app).post("/api/v1/bank-accounts").set(auth).send({
      name: "Operating Account",
      bankName: "Example Zimbabwe Bank",
      accountNumber: "**** 7788",
      currency: "USD",
    });
    expect(account.status).toBe(200);
    const csvText = [
      "date,description,amount,reference",
      `2026-07-04,Customer instalment,100.00,${issued.body.number}`,
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
      outstanding: "250.00",
      reference_match: true,
    });

    const matched = await request(app)
      .post(`/api/v1/bank-transactions/${bankTransaction.id}/match-invoice`)
      .set(auth).send({ invoiceId: issued.body.id });
    expect(matched.status).toBe(200);
    expect(matched.body.invoice).toMatchObject({ status: "PARTIAL", amountPaid: "100.00" });

    const payments = await db.select().from(schema.payments).where(eq(schema.payments.invoiceId, issued.body.id));
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ amount: "100.00", bankAccountId: account.body.id });
  });

  it("can split one positive bank line across multiple open invoices", async () => {
    const tenant = await signup("split");
    const auth = { Authorization: `Bearer ${tenant.token}` };
    const customer = await request(app).post("/api/v1/contacts").set(auth)
      .send({ name: "Split Payment Customer" });
    expect(customer.status).toBe(200);
    const firstDraft = await request(app).post("/api/v1/invoices").set(auth).send({
      contactId: customer.body.id,
      currency: "USD",
      lines: [{ description: "Support", quantity: "1", unitPrice: "100.00", taxTreatment: "exempt" }],
    });
    const secondDraft = await request(app).post("/api/v1/invoices").set(auth).send({
      contactId: customer.body.id,
      currency: "USD",
      lines: [{ description: "Training", quantity: "1", unitPrice: "150.00", taxTreatment: "exempt" }],
    });
    expect(firstDraft.status).toBe(200);
    expect(secondDraft.status).toBe(200);
    const firstIssued = await request(app).post(`/api/v1/invoices/${firstDraft.body.id}/issue`).set(auth).send({});
    const secondIssued = await request(app).post(`/api/v1/invoices/${secondDraft.body.id}/issue`).set(auth).send({});
    expect(firstIssued.status).toBe(200);
    expect(secondIssued.status).toBe(200);

    const account = await request(app).post("/api/v1/bank-accounts").set(auth).send({
      name: "Operating Account",
      bankName: "Example Zimbabwe Bank",
      accountNumber: "**** 5522",
      currency: "USD",
    });
    expect(account.status).toBe(200);
    const csvText = [
      "date,description,amount,reference",
      "2026-07-05,Bulk customer payment,250.00,BULK-001",
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
      .get(`/api/v1/bank-transactions/${bankTransaction.id}/split-candidates`)
      .set(auth);
    expect(candidates.status).toBe(200);
    expect(candidates.body.candidates.map((candidate: any) => candidate.number))
      .toEqual(expect.arrayContaining([firstIssued.body.number, secondIssued.body.number]));

    const mismatch = await request(app)
      .post(`/api/v1/bank-transactions/${bankTransaction.id}/match-invoices`)
      .set(auth).send({
        allocations: [
          { invoiceNumber: firstIssued.body.number, amount: "100.00" },
          { invoiceNumber: secondIssued.body.number, amount: "140.00" },
        ],
      });
    expect(mismatch.status).toBe(409);

    const matched = await request(app)
      .post(`/api/v1/bank-transactions/${bankTransaction.id}/match-invoices`)
      .set(auth).send({
        allocations: [
          { invoiceNumber: firstIssued.body.number, amount: "100.00" },
          { invoiceNumber: secondIssued.body.number, amount: "150.00" },
        ],
      });
    expect(matched.status).toBe(200);
    expect(matched.body.invoices).toHaveLength(2);

    const [updatedBankTransaction] = await db.select().from(schema.bankTransactions)
      .where(eq(schema.bankTransactions.id, bankTransaction.id));
    expect(updatedBankTransaction.matchedJournalEntryId).toBe(matched.body.journalEntryId);
    const [journal] = await db.select().from(schema.journalEntries)
      .where(eq(schema.journalEntries.id, matched.body.journalEntryId));
    expect(journal).toMatchObject({ sourceType: "bank_match", sourceId: bankTransaction.id });
    const first = await request(app).get(`/api/v1/invoices/${firstIssued.body.id}`).set(auth);
    const second = await request(app).get(`/api/v1/invoices/${secondIssued.body.id}`).set(auth);
    expect(first.body).toMatchObject({ status: "PAID", amountPaid: "100.00" });
    expect(second.body).toMatchObject({ status: "PAID", amountPaid: "150.00" });
    const firstPayments = await db.select().from(schema.payments).where(eq(schema.payments.invoiceId, firstIssued.body.id));
    const secondPayments = await db.select().from(schema.payments).where(eq(schema.payments.invoiceId, secondIssued.body.id));
    expect(firstPayments).toHaveLength(1);
    expect(secondPayments).toHaveLength(1);
    expect(firstPayments[0]).toMatchObject({ amount: "100.00", bankAccountId: account.body.id });
    expect(secondPayments[0]).toMatchObject({ amount: "150.00", bankAccountId: account.body.id });
  });
});
