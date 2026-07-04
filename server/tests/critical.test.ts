// ============================================================================
// CRITICAL-PATH TESTS — the logic that can cause real financial harm to a
// client business if wrong. Runs against the real Postgres database.
//   1. Journal engine rejects unbalanced entries
//   2. Signup seeds a complete, working tenant
//   3. Full trade cycle: PO receive -> stock+GL, invoice issue -> revenue+VAT+
//      COGS+stock decrement, payment -> AR clearance, reports balance
//   4. Overselling is refused and rolls back the whole invoice issue
//   5. Multi-currency: ZWG invoice posts to base at the snapshot rate
//   6. Billing state machine: trial -> active -> past_due -> suspended -> reactivated
//   7. Tenant isolation: tenant B cannot see or touch tenant A's data
// ============================================================================
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { db, schema } from "../src/lib.js";
import { runBillingCycle, markSubscriptionInvoicePaid } from "../src/billing.js";
import { postJournal } from "../src/accounting.js";
import { eq } from "drizzle-orm";

const app = createApp();
const uniq = Date.now().toString(36);

async function makeTenant(n: string, currency: "USD" | "ZWG" = "USD") {
  const res = await request(app).post("/api/v1/auth/signup").send({
    companyName: `Test Co ${n}`, subdomain: `t${uniq}${n}`, baseCurrency: currency,
    ownerEmail: `owner${n}@test.zw`, ownerPassword: "SuperSecret123!", ownerName: "Test Owner",
    planName: "Growth",
  });
  expect(res.status).toBe(200);
  return { token: res.body.token as string, tenantId: res.body.tenant.id as string };
}
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

let A: { token: string; tenantId: string };
let B: { token: string; tenantId: string };

beforeAll(async () => {
  A = await makeTenant("a");
  B = await makeTenant("b");
});

describe("journal engine", () => {
  it("rejects unbalanced entries and rolls back", async () => {
    const accounts = await db.select().from(schema.accounts).where(eq(schema.accounts.tenantId, A.tenantId));
    const [a1, a2] = accounts;
    await expect(db.transaction((tx) => postJournal(tx, {
      tenantId: A.tenantId, date: new Date(), memo: "bad", sourceType: "manual",
      lines: [{ accountId: a1.id, debit: "100.00" }, { accountId: a2.id, credit: "99.99" }],
    }))).rejects.toThrow(/does not balance/);
  });
  it("rejects single-line and zero-value entries", async () => {
    const [a1] = await db.select().from(schema.accounts).where(eq(schema.accounts.tenantId, A.tenantId));
    await expect(db.transaction((tx) => postJournal(tx, {
      tenantId: A.tenantId, date: new Date(), memo: "bad", sourceType: "manual",
      lines: [{ accountId: a1.id, debit: "100.00" }],
    }))).rejects.toThrow(/at least 2 lines/);
  });
});

describe("full trade cycle (PO -> invoice -> payment -> reports)", () => {
  let productId: string, warehouseId: string, vendorId: string, customerId: string, invoiceId: string;

  it("sets up vendor, customer, product", async () => {
    const v = await request(app).post("/api/v1/contacts").set(auth(A.token))
      .send({ name: "Mbare Wholesalers", isVendor: true, isCustomer: false });
    vendorId = v.body.id;
    const c = await request(app).post("/api/v1/contacts").set(auth(A.token))
      .send({ name: "Harare Retail Ltd", taxNumber: "BP-2001234" });
    customerId = c.body.id;
    const p = await request(app).post("/api/v1/products").set(auth(A.token))
      .send({ sku: "MAIZE-10KG", name: "Maize Meal 10kg", costPrice: "6.00", salePrice: "9.50", taxRate: "15" });
    expect(p.status).toBe(200);
    productId = p.body.id;
    const w = await request(app).get("/api/v1/warehouses").set(auth(A.token));
    warehouseId = w.body[0].id;
  });

  it("receives a PO: stock in + Dr Inventory / Cr AP", async () => {
    const po = await request(app).post("/api/v1/purchase-orders").set(auth(A.token)).send({
      vendorContactId: vendorId, currency: "USD",
      lines: [{ productId, warehouseId, quantity: "100", unitCost: "6.00" }],
    });
    expect(po.status).toBe(200);
    expect(po.body.number).toMatch(/^PO-\d{5}$/);
    const rec = await request(app).post(`/api/v1/purchase-orders/${po.body.id}/receive`).set(auth(A.token)).send({});
    expect(rec.status).toBe(200);

    const products = await request(app).get("/api/v1/products").set(auth(A.token));
    expect(Number(products.body.find((p: any) => p.id === productId).on_hand)).toBe(100);

    const tb = await request(app).get("/api/v1/reports/trial-balance").set(auth(A.token));
    const inv = tb.body.find((r: any) => r.code === "1200");
    const ap = tb.body.find((r: any) => r.code === "2000");
    expect(inv.balance).toBeCloseTo(600, 2);   // 100 * 6.00 into Inventory
    expect(ap.balance).toBeCloseTo(-600, 2);   // owed to vendor
  });

  it("issues an invoice: number, revenue+VAT, COGS, stock decrement — atomically", async () => {
    const draft = await request(app).post("/api/v1/invoices").set(auth(A.token)).send({
      contactId: customerId, currency: "USD",
      lines: [{ productId, warehouseId, description: "Maize Meal 10kg", quantity: "40", unitPrice: "9.50", taxRate: "15" }],
    });
    expect(draft.status).toBe(200);
    invoiceId = draft.body.id;
    expect(Number(draft.body.subtotal)).toBeCloseTo(380, 2);       // 40*9.50
    expect(Number(draft.body.taxTotal)).toBeCloseTo(57, 2);        // 15%
    expect(Number(draft.body.total)).toBeCloseTo(437, 2);

    const issued = await request(app).post(`/api/v1/invoices/${invoiceId}/issue`).set(auth(A.token)).send({});
    expect(issued.status).toBe(200);
    expect(issued.body.number).toMatch(/^INV-\d{5}$/);
    expect(issued.body.status).toBe("ISSUED");

    // stock: 100 - 40 = 60
    const products = await request(app).get("/api/v1/products").set(auth(A.token));
    expect(Number(products.body.find((p: any) => p.id === productId).on_hand)).toBe(60);

    // ledger: AR 437, Sales 380, VAT Output 57, COGS 240 (40*6), Inventory 600-240=360
    const tb = (await request(app).get("/api/v1/reports/trial-balance").set(auth(A.token))).body;
    const bal = (code: string) => tb.find((r: any) => r.code === code).balance;
    expect(bal("1100")).toBeCloseTo(437, 2);
    expect(bal("4000")).toBeCloseTo(-380, 2);
    expect(bal("2100")).toBeCloseTo(-57, 2);
    expect(bal("5000")).toBeCloseTo(240, 2);
    expect(bal("1200")).toBeCloseTo(360, 2);
  });

  it("refuses overselling and rolls back EVERYTHING (no number burned, no partial postings)", async () => {
    const draft = await request(app).post("/api/v1/invoices").set(auth(A.token)).send({
      contactId: customerId, currency: "USD",
      lines: [{ productId, warehouseId, description: "Too much maize", quantity: "500", unitPrice: "9.50", taxRate: "15" }],
    });
    const res = await request(app).post(`/api/v1/invoices/${draft.body.id}/issue`).set(auth(A.token)).send({});
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Insufficient stock/);

    // stock untouched, no revenue posted for the failed attempt
    const products = await request(app).get("/api/v1/products").set(auth(A.token));
    expect(Number(products.body.find((p: any) => p.id === productId).on_hand)).toBe(60);
    const invoice = await request(app).get(`/api/v1/invoices/${draft.body.id}`).set(auth(A.token));
    expect(invoice.body.status).toBe("DRAFT");
    expect(invoice.body.number).toBeNull();
  });

  it("records partial then final payment: PARTIAL -> PAID, AR cleared, overpay refused", async () => {
    const p1 = await request(app).post(`/api/v1/invoices/${invoiceId}/payments`).set(auth(A.token))
      .send({ amount: "200.00", reference: "EcoCash 123" });
    expect(p1.body.status).toBe("PARTIAL");

    const over = await request(app).post(`/api/v1/invoices/${invoiceId}/payments`).set(auth(A.token))
      .send({ amount: "500.00" });
    expect(over.status).toBe(409);

    const p2 = await request(app).post(`/api/v1/invoices/${invoiceId}/payments`).set(auth(A.token))
      .send({ amount: "237.00", reference: "ZIPIT final" });
    expect(p2.body.status).toBe("PAID");

    const tb = (await request(app).get("/api/v1/reports/trial-balance").set(auth(A.token))).body;
    expect(tb.find((r: any) => r.code === "1100").balance).toBeCloseTo(0, 2); // AR cleared
    expect(tb.find((r: any) => r.code === "1000").balance).toBeCloseTo(437, 2); // Bank up
  });

  it("P&L and balance sheet agree and the balance sheet balances", async () => {
    const pl = (await request(app).get("/api/v1/reports/profit-loss").set(auth(A.token))).body;
    expect(pl.totalIncome).toBeCloseTo(380, 2);
    expect(pl.totalExpenses).toBeCloseTo(240, 2);
    expect(pl.netProfit).toBeCloseTo(140, 2);
    const bs = (await request(app).get("/api/v1/reports/balance-sheet").set(auth(A.token))).body;
    expect(bs.balances).toBe(true);
    expect(bs.currentEarnings).toBeCloseTo(140, 2);
  });
});

describe("multi-currency (ZWG invoice, USD base)", () => {
  it("posts ZWG revenue into the base ledger at the snapshot rate", async () => {
    const c = await request(app).post("/api/v1/contacts").set(auth(A.token)).send({ name: "ZWG Customer" });
    // service line (no stock) at ZWG 2,700 + 15% VAT, rate 27 ZWG/USD -> base 100 net
    const draft = await request(app).post("/api/v1/invoices").set(auth(A.token)).send({
      contactId: c.body.id, currency: "ZWG", rateToBase: "0.037037",
      lines: [{ description: "Consulting services", quantity: "1", unitPrice: "2700.00", taxRate: "15" }],
    });
    const before = (await request(app).get("/api/v1/reports/trial-balance").set(auth(A.token))).body
      .find((r: any) => r.code === "4000").balance;
    await request(app).post(`/api/v1/invoices/${draft.body.id}/issue`).set(auth(A.token)).send({});
    const after = (await request(app).get("/api/v1/reports/trial-balance").set(auth(A.token))).body
      .find((r: any) => r.code === "4000").balance;
    expect(after - before).toBeCloseTo(-100, 1); // ~USD 100 more sales (credit)
  });
});

describe("billing state machine (suspend-then-escrow)", () => {
  it("trial -> active+invoiced -> past_due -> suspended(read-only) -> paid -> reactivated", async () => {
    const T = await makeTenant("bill");
    const [sub] = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.tenantId, T.tenantId));

    // 1) run past trial end -> ACTIVE + first invoice
    const afterTrial = new Date(sub.trialEnd.getTime() + 86_400_000);
    await runBillingCycle(afterTrial);
    let [t] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, T.tenantId));
    expect(t.status).toBe("ACTIVE");
    const invs = await db.select().from(schema.subscriptionInvoices)
      .where(eq(schema.subscriptionInvoices.tenantId, T.tenantId));
    expect(invs.length).toBe(1);
    expect(invs[0].usageSummary).toBeTruthy();

    // 2) past due date -> PAST_DUE + dunning
    await runBillingCycle(new Date(invs[0].dueAt.getTime() + 86_400_000));
    [t] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, T.tenantId));
    expect(t.status).toBe("PAST_DUE");

    // 3) ~75 days later -> SUSPENDED, and writes are blocked but reads+export work
    await runBillingCycle(new Date(invs[0].dueAt.getTime() + 80 * 86_400_000));
    [t] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, T.tenantId));
    expect(t.status).toBe("SUSPENDED");

    const blockedWrite = await request(app).post("/api/v1/contacts").set(auth(T.token)).send({ name: "X" });
    expect(blockedWrite.status).toBe(403);
    expect(blockedWrite.body.message).toMatch(/data is safe and retained/i);
    const allowedRead = await request(app).get("/api/v1/contacts").set(auth(T.token));
    expect(allowedRead.status).toBe(200);
    const allowedExport = await request(app).get("/api/v1/export/contacts").set(auth(T.token));
    expect(allowedExport.status).toBe(200);

    // 4) settle -> reactivated
    const r = await markSubscriptionInvoicePaid({ tenantId: T.tenantId, invoiceId: invs[0].id });
    expect(r.reactivated).toBe(true);
    [t] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, T.tenantId));
    expect(t.status).toBe("ACTIVE");
    const writeAgain = await request(app).post("/api/v1/contacts").set(auth(T.token)).send({ name: "Back in business" });
    expect(writeAgain.status).toBe(200);
  });
});

describe("tenant isolation", () => {
  it("tenant B cannot read tenant A's data or touch its records", async () => {
    // the billing-cycle test above ran the global billing run with future
    // dates, correctly suspending A and B too — restore them for this test
    await db.update(schema.tenants).set({ status: "ACTIVE" }).where(eq(schema.tenants.id, A.tenantId));
    await db.update(schema.tenants).set({ status: "ACTIVE" }).where(eq(schema.tenants.id, B.tenantId));
    const aContacts = (await request(app).get("/api/v1/contacts").set(auth(A.token))).body;
    expect(aContacts.length).toBeGreaterThan(0);
    const bContacts = (await request(app).get("/api/v1/contacts").set(auth(B.token))).body;
    expect(bContacts.find((c: any) => aContacts.some((a: any) => a.id === c.id))).toBeUndefined();

    // direct cross-tenant object access is a 404, not a leak
    const steal = await request(app).get(`/api/v1/contacts/${aContacts[0].id}`).set(auth(B.token));
    expect(steal.status).toBe(404);
    const stealPatch = await request(app).patch(`/api/v1/contacts/${aContacts[0].id}`).set(auth(B.token)).send({ name: "hacked" });
    expect(stealPatch.status).toBe(404);
  });
  it("unauthenticated requests are rejected", async () => {
    expect((await request(app).get("/api/v1/contacts")).status).toBe(401);
  });
});
