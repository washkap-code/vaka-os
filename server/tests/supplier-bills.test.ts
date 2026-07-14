import bcrypt from "bcryptjs";
import { and, eq, inArray } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { login } from "../src/auth.js";
import { db, schema } from "../src/lib.js";
import { postGoodsReceipt } from "../src/procurement.js";
import { DOMAIN_EVENTS } from "../src/platform/events/registry.js";
import { EVENT_BUS, platformKernel } from "../src/platform-runtime.js";
import { getStatutoryReportPack } from "../src/statutory-report-pack.js";
import {
  createContact, createProduct, createPurchaseOrder, defaultWarehouse, expectJournalBalanced,
  signupFinanceTenant, systemAccountId, type TestTenant,
} from "./finance/helpers.js";

const app = createApp();
const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const today = () => new Date().toISOString().slice(0, 10);

async function roleUser(tenant: TestTenant, roleName: string, label: string) {
  const [tenantRecord] = await db.select({ subdomain: schema.tenants.subdomain })
    .from(schema.tenants).where(eq(schema.tenants.id, tenant.tenantId));
  const [role] = await db.select().from(schema.roles).where(and(
    eq(schema.roles.tenantId, tenant.tenantId), eq(schema.roles.name, roleName),
  ));
  expect(role, `Missing ${roleName} role`).toBeTruthy();
  const email = `supplier-bill-${runId}-${label}@test.vaka`;
  const password = "Supplier-Bill-Test-123!";
  const [user] = await db.insert(schema.users).values({
    tenantId: tenant.tenantId, email, fullName: `${roleName} ${label}`,
    passwordHash: await bcrypt.hash(password, 4), roleId: role.id,
    mustChangePassword: false, status: "active",
  }).returning();
  const session = await login(email, password, tenantRecord.subdomain);
  return { id: user.id, auth: { Authorization: `Bearer ${session.token}` } };
}

async function customRoleUser(tenant: TestTenant, permissions: string[], label: string) {
  const [role] = await db.insert(schema.roles).values({
    tenantId: tenant.tenantId, name: `Bill ${label} ${runId}`, permissions, isSystem: false,
  }).returning();
  const [tenantRecord] = await db.select({ subdomain: schema.tenants.subdomain })
    .from(schema.tenants).where(eq(schema.tenants.id, tenant.tenantId));
  const email = `supplier-bill-custom-${runId}-${label}@test.vaka`;
  const password = "Supplier-Bill-Test-123!";
  await db.insert(schema.users).values({
    tenantId: tenant.tenantId, email, fullName: `Bill ${label}`,
    passwordHash: await bcrypt.hash(password, 4), roleId: role.id,
    mustChangePassword: false, status: "active",
  });
  const session = await login(email, password, tenantRecord.subdomain);
  return { Authorization: `Bearer ${session.token}` };
}

async function fixture(label: string, quantity = "10", unitCost = "5.00") {
  const tenant = await signupFinanceTenant(`supplier-bill-${label}`);
  const warehouse = await defaultWarehouse(tenant);
  const product = await createProduct(tenant, `supplier-bill-${label}`, {
    costPrice: unitCost, salePrice: "10.00", trackStock: true,
  });
  const po = await createPurchaseOrder(tenant, product.id, warehouse.id, quantity, unitCost);
  return { tenant, warehouse, product, po };
}

async function receive(
  tenant: TestTenant,
  po: Awaited<ReturnType<typeof createPurchaseOrder>>,
  quantity: string,
  key: string,
) {
  return postGoodsReceipt({
    tenantId: tenant.tenantId, actorUserId: tenant.userId, purchaseOrderId: po.id,
    idempotencyKey: key,
    input: { lines: [{ purchaseOrderLineItemId: po.lines[0].id, quantity }] },
  });
}

function billBody(
  po: Awaited<ReturnType<typeof createPurchaseOrder>>,
  reference: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    purchaseOrderId: po.id,
    supplierInvoiceNumber: reference,
    billDate: today(), taxDate: today(), dueDate: today(), rateToBase: "1",
    lines: [{
      purchaseOrderLineItemId: po.lines[0].id,
      quantity: po.lines[0].quantity,
      unitPrice: po.lines[0].unitCost,
      taxTreatment: "standard",
    }],
    ...overrides,
  };
}

describe("P4-003 supplier bills and enforced three-way match", () => {
  it("posts one matched FX bill through the journal service with tax snapshots, AP evidence and idempotent replay", async () => {
    const { tenant, po } = await fixture("matched-fx", "10", "100.00");
    await db.update(schema.purchaseOrders).set({ currency: "ZWG", rateToBase: "0.5" })
      .where(and(eq(schema.purchaseOrders.id, po.id), eq(schema.purchaseOrders.tenantId, tenant.tenantId)));
    await receive(tenant, po, "6", `matched-fx-receipt-${runId}`);

    const created = await request(app).post("/api/v1/supplier-bills").set(tenant.auth).send(billBody(po, "SUP-FX-001", {
      rateToBase: "0.55",
      lines: [{ purchaseOrderLineItemId: po.lines[0].id, quantity: "3", unitPrice: "100.00", taxTreatment: "standard" }],
    }));
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({
      status: "DRAFT", number: null, currency: "ZWG", subtotal: "300.00", taxTotal: "45.00", total: "345.00",
      lines: [{ taxRate: "15.0000", taxRateEffectiveFrom: "2020-01-01" }],
    });

    const updated = await request(app).put(`/api/v1/supplier-bills/${created.body.id}`).set(tenant.auth).send({
      supplierInvoiceNumber: "SUP-FX-001", billDate: today(), taxDate: today(), dueDate: today(), rateToBase: "0.6",
      lines: [{ purchaseOrderLineItemId: po.lines[0].id, quantity: "4", unitPrice: "100.00", taxTreatment: "standard" }],
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ subtotal: "400.00", taxTotal: "60.00", total: "460.00", matchStatus: "PENDING" });

    const match = await request(app).get(`/api/v1/supplier-bills/${created.body.id}/match`).set(tenant.auth);
    expect(match.status).toBe(200);
    expect(match.body).toMatchObject({
      status: "MATCHED", reasons: [],
      lines: [{ orderedQuantity: "10.000", receivedQuantity: "6", previouslyBilledQuantity: "0", currentBillQuantity: "4.000", approvedUnitPrice: "100.00", billUnitPrice: "100.00" }],
    });

    const missingConfirmation = await request(app).post(`/api/v1/supplier-bills/${created.body.id}/post`)
      .set(tenant.auth).set("Idempotency-Key", `matched-fx-missing-confirmation-${runId}`).send({});
    expect(missingConfirmation.status).toBe(400);

    const bus = platformKernel().container.get(EVENT_BUS);
    const events: Array<{ supplierBillId: string; number: string }> = [];
    const subscription = bus.subscribe<{ supplierBillId: string; number: string }>(DOMAIN_EVENTS.SUPPLIER_BILL_POSTED, (event) => {
      events.push({ supplierBillId: event.payload.supplierBillId, number: event.payload.number });
    });
    const key = `matched-fx-post-${runId}`;
    const posted = await request(app).post(`/api/v1/supplier-bills/${created.body.id}/post`)
      .set(tenant.auth).set("Idempotency-Key", key).send({ confirmed: true });
    subscription.unsubscribe();
    expect(posted.status).toBe(200);
    expect(posted.body).toMatchObject({
      replayed: false, bill: { status: "POSTED", matchStatus: "MATCHED", total: "460.00" }, match: { status: "MATCHED" },
    });
    expect(posted.body.bill.number).toMatch(/^BILL-\d{5}$/);
    expect(events).toEqual([{ supplierBillId: created.body.id, number: posted.body.bill.number }]);

    const journalId = posted.body.journalEntryId as string;
    await expectJournalBalanced(journalId);
    const [grniId, vatId, apId, fxId] = await Promise.all([
      systemAccountId(tenant.tenantId, "GRNI"), systemAccountId(tenant.tenantId, "VAT_INPUT"),
      systemAccountId(tenant.tenantId, "AP"), systemAccountId(tenant.tenantId, "FX_GAIN_LOSS"),
    ]);
    const lines = await db.select().from(schema.journalLines).where(eq(schema.journalLines.journalEntryId, journalId));
    expect(lines.map((line) => ({ accountId: line.accountId, debit: line.debit, credit: line.credit }))).toEqual(expect.arrayContaining([
      { accountId: grniId, debit: "200.00", credit: "0.00" },
      { accountId: vatId, debit: "36.00", credit: "0.00" },
      { accountId: fxId, debit: "40.00", credit: "0.00" },
      { accountId: apId, debit: "0.00", credit: "276.00" },
    ]));
    const [journal] = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, journalId));
    expect(journal).toMatchObject({ sourceType: "supplier_bill", sourceId: created.body.id });

    const report = await getStatutoryReportPack({
      tenantId: tenant.tenantId, period: { from: today(), to: today(), asAt: today() },
    });
    expect(report.agedPayables).toMatchObject({
      basis: "SUPPLIER_BILL_DUE_DATE", controlBalance: "276.00", scheduledBalance: "276.00", unallocatedBalance: "0.00",
      items: [{ sourceId: created.body.id, number: posted.body.bill.number, balance: "276.00" }],
    });

    const replay = await request(app).post(`/api/v1/supplier-bills/${created.body.id}/post`)
      .set(tenant.auth).set("Idempotency-Key", key).send({ confirmed: true });
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ replayed: true, bill: { id: created.body.id, number: posted.body.bill.number } });
    expect(await db.select().from(schema.journalEntries).where(and(
      eq(schema.journalEntries.tenantId, tenant.tenantId), eq(schema.journalEntries.sourceType, "supplier_bill"),
    ))).toHaveLength(1);
    expect((await request(app).put(`/api/v1/supplier-bills/${created.body.id}`).set(tenant.auth).send({
      supplierInvoiceNumber: "IMMUTABLE", billDate: today(), taxDate: today(), dueDate: today(), rateToBase: "1",
      lines: [{ purchaseOrderLineItemId: po.lines[0].id, quantity: "1", unitPrice: "100.00", taxTreatment: "standard" }],
    })).status).toBe(409);
  });

  it("returns every stable mismatch without journal, number, state, audit or event side effects", async () => {
    const { tenant, product, warehouse, po } = await fixture("blocked", "5", "5.00");
    const created = await request(app).post("/api/v1/supplier-bills").set(tenant.auth).send(billBody(po, "BLOCK-001", {
      lines: [{ purchaseOrderLineItemId: po.lines[0].id, quantity: "6", unitPrice: "6.00", taxTreatment: "exempt" }],
    }));
    expect(created.status).toBe(200);
    const baseMatch = await request(app).get(`/api/v1/supplier-bills/${created.body.id}/match`).set(tenant.auth);
    expect(baseMatch.status).toBe(200);
    expect(baseMatch.body.status).toBe("BLOCKED");
    expect(baseMatch.body.reasons.map((reason: { code: string }) => reason.code)).toEqual(expect.arrayContaining([
      "PRICE_MISMATCH", "QUANTITY_EXCEEDS_RECEIVED", "QUANTITY_EXCEEDS_ORDERED", "NO_RECEIPT_EVIDENCE",
    ]));

    const otherSupplier = await createContact(tenant, "Corrupt-match supplier", { isVendor: true, isCustomer: false });
    const otherPo = await createPurchaseOrder(tenant, product.id, warehouse.id, "1", "5.00");
    await db.update(schema.supplierBills).set({ vendorContactId: otherSupplier.id, currency: "ZWG" })
      .where(and(eq(schema.supplierBills.id, created.body.id), eq(schema.supplierBills.tenantId, tenant.tenantId)));
    await db.update(schema.supplierBillLineItems).set({ purchaseOrderLineItemId: otherPo.lines[0].id })
      .where(and(eq(schema.supplierBillLineItems.supplierBillId, created.body.id), eq(schema.supplierBillLineItems.tenantId, tenant.tenantId)));
    const corruptMatch = await request(app).get(`/api/v1/supplier-bills/${created.body.id}/match`).set(tenant.auth);
    expect(corruptMatch.body.reasons.map((reason: { code: string }) => reason.code)).toEqual(expect.arrayContaining([
      "SUPPLIER_MISMATCH", "CURRENCY_MISMATCH", "LINE_NOT_ON_PO", "NO_RECEIPT_EVIDENCE",
    ]));

    const journalsBefore = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.tenantId, tenant.tenantId));
    const auditsBefore = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.tenantId, tenant.tenantId));
    const sequenceBefore = await db.select().from(schema.numberSequences).where(and(
      eq(schema.numberSequences.tenantId, tenant.tenantId), eq(schema.numberSequences.key, "supplier_bill"),
    ));
    const events: string[] = [];
    const subscription = platformKernel().container.get(EVENT_BUS).subscribe(DOMAIN_EVENTS.SUPPLIER_BILL_POSTED, () => { events.push("unexpected"); });
    const blocked = await request(app).post(`/api/v1/supplier-bills/${created.body.id}/post`)
      .set(tenant.auth).set("Idempotency-Key", `blocked-post-${runId}`).send({ confirmed: true });
    subscription.unsubscribe();
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toMatch(/SUPPLIER_MISMATCH|CURRENCY_MISMATCH|LINE_NOT_ON_PO/);
    const [unchanged] = await db.select().from(schema.supplierBills).where(eq(schema.supplierBills.id, created.body.id));
    expect(unchanged).toMatchObject({ status: "DRAFT", number: null, matchStatus: "PENDING", matchEvidence: null });
    expect(await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.tenantId, tenant.tenantId))).toHaveLength(journalsBefore.length);
    expect(await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.tenantId, tenant.tenantId))).toHaveLength(auditsBefore.length);
    expect(await db.select().from(schema.numberSequences).where(and(
      eq(schema.numberSequences.tenantId, tenant.tenantId), eq(schema.numberSequences.key, "supplier_bill"),
    ))).toEqual(sequenceBefore);
    expect(events).toEqual([]);
  });

  it("enforces duplicate invoice, effective tax date, tenant scope and independently assignable posting permission", async () => {
    const first = await fixture("controls-first", "2", "10.00");
    const secondPo = await createPurchaseOrder(first.tenant, first.product.id, first.warehouse.id, "2", "10.00");
    await db.update(schema.purchaseOrders).set({ vendorContactId: first.po.vendorContactId })
      .where(and(eq(schema.purchaseOrders.id, secondPo.id), eq(schema.purchaseOrders.tenantId, first.tenant.tenantId)));
    const other = await fixture("controls-other", "2", "10.00");
    const approver = await roleUser(first.tenant, "Procurement Approver", "permission-approver");
    const accountant = await roleUser(first.tenant, "Accountant", "permission-accountant");
    const accountingReader = await customRoleUser(first.tenant, ["accounting.read"], "accounting-reader");

    const deniedCreate = await request(app).post("/api/v1/supplier-bills").set(approver.auth).send(billBody(first.po, "DENIED-001"));
    expect(deniedCreate.status).toBe(403);
    const created = await request(app).post("/api/v1/supplier-bills").set(accountant.auth).send(billBody(first.po, "DUP-001", {
      lines: [{ purchaseOrderLineItemId: first.po.lines[0].id, quantity: "1", unitPrice: "10.00", taxTreatment: "standard" }],
    }));
    expect(created.status).toBe(200);
    expect((await request(app).get(`/api/v1/supplier-bills/${created.body.id}`).set(accountingReader)).status).toBe(200);
    expect((await request(app).post(`/api/v1/supplier-bills/${created.body.id}/post`).set(approver.auth)
      .set("Idempotency-Key", `denied-post-${runId}`).send({ confirmed: true })).status).toBe(403);

    const duplicate = await request(app).post("/api/v1/supplier-bills").set(accountant.auth).send(billBody(secondPo, "dup-001", {
      lines: [{ purchaseOrderLineItemId: secondPo.lines[0].id, quantity: "1", unitPrice: "10.00", taxTreatment: "standard" }],
    }));
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.message).toContain("DUPLICATE_SUPPLIER_INVOICE");

    const unsupportedTaxDate = await request(app).post("/api/v1/supplier-bills").set(accountant.auth).send(billBody(secondPo, "TAX-OLD-001", {
      taxDate: "2019-12-31",
      lines: [{ purchaseOrderLineItemId: secondPo.lines[0].id, quantity: "1", unitPrice: "10.00", taxTreatment: "standard" }],
    }));
    expect(unsupportedTaxDate.status).toBe(400);
    expect(unsupportedTaxDate.body.message).toMatch(/tax rate|effective/i);

    const crossTenantCreate = await request(app).post("/api/v1/supplier-bills").set(other.tenant.auth).send(billBody(first.po, "CROSS-001"));
    expect(crossTenantCreate.status).toBe(404);
    expect((await request(app).get(`/api/v1/supplier-bills/${created.body.id}`).set(other.tenant.auth)).status).toBe(404);
    const otherList = await request(app).get("/api/v1/supplier-bills").set(other.tenant.auth);
    expect(otherList.status).toBe(200);
    expect(otherList.body).toEqual([]);
  });

  it("serializes concurrent partial bills and rounds line tax in integer cents", async () => {
    const concurrent = await fixture("concurrency", "10", "5.00");
    await receive(concurrent.tenant, concurrent.po, "10", `concurrency-receipt-${runId}`);
    const createPartial = (reference: string) => request(app).post("/api/v1/supplier-bills").set(concurrent.tenant.auth).send(billBody(concurrent.po, reference, {
      lines: [{ purchaseOrderLineItemId: concurrent.po.lines[0].id, quantity: "6", unitPrice: "5.00", taxTreatment: "exempt" }],
    }));
    const [first, second] = await Promise.all([createPartial("PART-A"), createPartial("PART-B")]);
    expect([first.status, second.status]).toEqual([200, 200]);
    const post = (id: string, key: string) => request(app).post(`/api/v1/supplier-bills/${id}/post`)
      .set(concurrent.tenant.auth).set("Idempotency-Key", key).send({ confirmed: true });
    const results = await Promise.all([
      post(first.body.id, `partial-post-a-${runId}`), post(second.body.id, `partial-post-b-${runId}`),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(results.find((result) => result.status === 409)?.body.message).toContain("QUANTITY_EXCEEDS_RECEIVED");
    const bills = await db.select().from(schema.supplierBills).where(eq(schema.supplierBills.tenantId, concurrent.tenant.tenantId));
    expect(bills.filter((bill) => bill.status === "POSTED")).toHaveLength(1);
    expect(bills.filter((bill) => bill.status === "DRAFT")).toHaveLength(1);
    expect(await db.select().from(schema.journalEntries).where(and(
      eq(schema.journalEntries.tenantId, concurrent.tenant.tenantId), eq(schema.journalEntries.sourceType, "supplier_bill"),
    ))).toHaveLength(1);
    const [sequence] = await db.select().from(schema.numberSequences).where(and(
      eq(schema.numberSequences.tenantId, concurrent.tenant.tenantId), eq(schema.numberSequences.key, "supplier_bill"),
    ));
    expect(sequence.nextVal).toBe(2);

    const rounding = await fixture("rounding", "3", "0.03");
    await receive(rounding.tenant, rounding.po, "3", `rounding-receipt-${runId}`);
    const roundedDraft = await request(app).post("/api/v1/supplier-bills").set(rounding.tenant.auth).send(billBody(rounding.po, "ROUND-001"));
    expect(roundedDraft.status).toBe(200);
    expect(roundedDraft.body).toMatchObject({ subtotal: "0.09", taxTotal: "0.01", total: "0.10" });
    const roundedPost = await request(app).post(`/api/v1/supplier-bills/${roundedDraft.body.id}/post`)
      .set(rounding.tenant.auth).set("Idempotency-Key", `rounding-post-${runId}`).send({ confirmed: true });
    expect(roundedPost.status).toBe(200);
    await expectJournalBalanced(roundedPost.body.journalEntryId);
    const [vatId, apId] = await Promise.all([
      systemAccountId(rounding.tenant.tenantId, "VAT_INPUT"), systemAccountId(rounding.tenant.tenantId, "AP"),
    ]);
    const roundedLines = await db.select().from(schema.journalLines)
      .where(eq(schema.journalLines.journalEntryId, roundedPost.body.journalEntryId));
    expect(roundedLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: vatId, debit: "0.01" }),
      expect.objectContaining({ accountId: apId, credit: "0.10" }),
    ]));

    const postedIds = bills.filter((bill) => bill.status === "POSTED").map((bill) => bill.id);
    const postedLines = await db.select().from(schema.supplierBillLineItems)
      .where(inArray(schema.supplierBillLineItems.supplierBillId, postedIds));
    expect(postedLines.reduce((sum, line) => sum + Number(line.quantity), 0)).toBe(6);
  });
});
