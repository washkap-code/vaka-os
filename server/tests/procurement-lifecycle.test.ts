import bcrypt from "bcryptjs";
import { and, eq, inArray } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { login } from "../src/auth.js";
import { db, schema } from "../src/lib.js";
import {
  createContact, createProduct, defaultWarehouse, expectJournalBalanced,
  signupFinanceTenant, stockLevelQuantity, systemAccountId, type TestTenant,
} from "./finance/helpers.js";

const app = createApp();
const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

async function createRoleUser(tenant: TestTenant, roleName: string, label: string) {
  const [tenantRecord] = await db.select({ subdomain: schema.tenants.subdomain })
    .from(schema.tenants).where(eq(schema.tenants.id, tenant.tenantId));
  const roles = await db.select().from(schema.roles).where(eq(schema.roles.tenantId, tenant.tenantId));
  const role = roles.find((candidate) => candidate.name === roleName);
  expect(role, `Missing ${roleName} role`).toBeTruthy();
  const email = `proc-${runId}-${label}@test.vaka`;
  const password = "Procurement-Test-123!";
  const [user] = await db.insert(schema.users).values({
    tenantId: tenant.tenantId,
    email,
    fullName: `${roleName} ${label}`,
    passwordHash: await bcrypt.hash(password, 4),
    roleId: role!.id,
    mustChangePassword: false,
    status: "active",
  }).returning();
  const session = await login(email, password, tenantRecord.subdomain);
  return { id: user.id, auth: { Authorization: `Bearer ${session.token}` } };
}

async function procurementFixture(label: string) {
  const tenant = await signupFinanceTenant(label);
  const warehouse = await defaultWarehouse(tenant);
  const product = await createProduct(tenant, label, { costPrice: "1.00", salePrice: "2.00", trackStock: true });
  const supplier = await createContact(tenant, `Supplier ${label}`, {
    isVendor: true,
    isCustomer: false,
  });
  const otherSupplier = await createContact(tenant, `Other Supplier ${label}`, {
    isVendor: true,
    isCustomer: false,
  });
  return { tenant, warehouse, product, supplier, otherSupplier };
}

async function createAndApproveDirectPo(opts: {
  fixture: Awaited<ReturnType<typeof procurementFixture>>;
  approverAuth: { Authorization: string };
  quantity?: string;
  label: string;
}) {
  const { tenant, warehouse, product, supplier } = opts.fixture;
  const draft = await request(app).post("/api/v1/purchase-orders").set(tenant.auth).send({
    vendorContactId: supplier.id,
    currency: "USD",
    rateToBase: "1",
    lines: [{ productId: product.id, warehouseId: warehouse.id, quantity: opts.quantity ?? "10", unitCost: "5.00" }],
  });
  expect(draft.status).toBe(200);
  expect(draft.body).toMatchObject({ status: "DRAFT", number: null });
  const approved = await request(app).post(`/api/v1/purchase-orders/${draft.body.id}/approve`)
    .set(opts.approverAuth).send({ reason: `Approved ${opts.label}` });
  expect(approved.status).toBe(200);
  expect(approved.body.number).toMatch(/^PO-\d{5}$/);
  return draft.body as { id: string; lines: Array<{ id: string; quantity: string }> };
}

describe("P4-002 controlled procurement lifecycle", () => {
  it("moves an approved requisition through RFQ, independently approved PO and partial/final GRNI receipts", async () => {
    const fixture = await procurementFixture("controlled-lifecycle");
    const { tenant, warehouse, product, supplier, otherSupplier } = fixture;
    const approver = await createRoleUser(tenant, "Procurement Approver", "controlled-approver");

    const requisition = await request(app).post("/api/v1/purchase-requisitions").set(tenant.auth).send({
      purpose: "Replenish the Harare warehouse before the seasonal demand increase",
      currency: "ZWG",
      lines: [{ productId: product.id, warehouseId: warehouse.id, quantity: "10", estimatedUnitCost: "100.00" }],
    });
    expect(requisition.status).toBe(200);
    expect(requisition.body).toMatchObject({ status: "SUBMITTED", currency: "ZWG" });
    expect(requisition.body.number).toMatch(/^PR-\d{5}$/);

    const ownDecision = await request(app).post(`/api/v1/purchase-requisitions/${requisition.body.id}/decision`)
      .set(tenant.auth).send({ decision: "APPROVE", reason: "Attempted self approval" });
    expect(ownDecision.status).toBe(409);
    expect(ownDecision.body.message).toMatch(/cannot approve or reject their own/);

    const approvedRequisition = await request(app)
      .post(`/api/v1/purchase-requisitions/${requisition.body.id}/decision`)
      .set(approver.auth).send({ decision: "APPROVE", reason: "Stock need and estimate reviewed" });
    expect(approvedRequisition.status).toBe(200);
    expect(approvedRequisition.body.status).toBe("APPROVED");

    const rfq = await request(app).post("/api/v1/request-for-quotes").set(tenant.auth).send({
      purchaseRequisitionId: requisition.body.id,
      supplierContactIds: [supplier.id],
    });
    expect(rfq.status).toBe(200);
    expect(rfq.body.number).toMatch(/^RFQ-\d{5}$/);
    expect(rfq.body.lines).toHaveLength(1);

    const uninvitedAward = await request(app).post(`/api/v1/request-for-quotes/${rfq.body.id}/award`)
      .set(tenant.auth).send({
        supplierContactId: otherSupplier.id,
        currency: "ZWG",
        rateToBase: "0.025",
        lines: [{ requestForQuoteLineItemId: rfq.body.lines[0].id, unitCost: "100.00" }],
      });
    expect(uninvitedAward.status).toBe(409);
    expect(uninvitedAward.body.message).toMatch(/not invited/);

    const draftPo = await request(app).post(`/api/v1/request-for-quotes/${rfq.body.id}/award`)
      .set(tenant.auth).send({
        supplierContactId: supplier.id,
        currency: "ZWG",
        rateToBase: "0.025",
        lines: [{ requestForQuoteLineItemId: rfq.body.lines[0].id, unitCost: "100.00" }],
      });
    expect(draftPo.status).toBe(200);
    expect(draftPo.body).toMatchObject({ status: "DRAFT", number: null, requestForQuoteId: rfq.body.id });

    const ownPoApproval = await request(app).post(`/api/v1/purchase-orders/${draftPo.body.id}/approve`)
      .set(tenant.auth).send({ reason: "Attempted PO self approval" });
    expect(ownPoApproval.status).toBe(409);
    const approvedPo = await request(app).post(`/api/v1/purchase-orders/${draftPo.body.id}/approve`)
      .set(approver.auth).send({ reason: "Supplier quote and quantities reviewed" });
    expect(approvedPo.status).toBe(200);
    expect(approvedPo.body).toMatchObject({ status: "ORDERED", approvedBy: approver.id });
    expect(approvedPo.body.number).toMatch(/^PO-\d{5}$/);

    const journalsBeforeReceipt = await db.select().from(schema.journalEntries)
      .where(eq(schema.journalEntries.tenantId, tenant.tenantId));
    expect(journalsBeforeReceipt).toHaveLength(0);

    const partialBody = {
      deliveryNote: "DN-001",
      lines: [{ purchaseOrderLineItemId: draftPo.body.lines[0].id, quantity: "4" }],
    };
    const partial = await request(app).post(`/api/v1/purchase-orders/${draftPo.body.id}/receipts`)
      .set(tenant.auth).set("Idempotency-Key", "controlled-receipt-partial-1").send(partialBody);
    expect(partial.status).toBe(200);
    expect(partial.body).toMatchObject({ purchaseOrderStatus: "ORDERED", replayed: false });
    expect(partial.body.receipt.number).toMatch(/^GR-\d{5}$/);

    const replay = await request(app).post(`/api/v1/purchase-orders/${draftPo.body.id}/receipts`)
      .set(tenant.auth).set("Idempotency-Key", "controlled-receipt-partial-1").send(partialBody);
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ replayed: true, receipt: { id: partial.body.receipt.id } });

    const conflictingReplay = await request(app).post(`/api/v1/purchase-orders/${draftPo.body.id}/receipts`)
      .set(tenant.auth).set("Idempotency-Key", "controlled-receipt-partial-1")
      .send({ lines: [{ purchaseOrderLineItemId: draftPo.body.lines[0].id, quantity: "3" }] });
    expect(conflictingReplay.status).toBe(409);

    const finalReceipt = await request(app).post(`/api/v1/purchase-orders/${draftPo.body.id}/receipts`)
      .set(tenant.auth).set("Idempotency-Key", "controlled-receipt-final-1")
      .send({ deliveryNote: "DN-002", lines: [{ purchaseOrderLineItemId: draftPo.body.lines[0].id, quantity: "6" }] });
    expect(finalReceipt.status).toBe(200);
    expect(finalReceipt.body.purchaseOrderStatus).toBe("RECEIVED");
    expect(await stockLevelQuantity(product.id, warehouse.id)).toBe("10.000");

    const receipts = await db.select().from(schema.goodsReceipts).where(eq(schema.goodsReceipts.tenantId, tenant.tenantId));
    expect(receipts).toHaveLength(2);
    const movements = await db.select().from(schema.stockMovements).where(and(
      eq(schema.stockMovements.tenantId, tenant.tenantId),
      eq(schema.stockMovements.sourceType, "goods_receipt"),
    ));
    expect(movements).toHaveLength(2);
    expect(movements.map((movement) => movement.unitCost)).toEqual(["2.50", "2.50"]);
    const journals = await db.select().from(schema.journalEntries).where(and(
      eq(schema.journalEntries.tenantId, tenant.tenantId),
      eq(schema.journalEntries.sourceType, "goods_receipt"),
    ));
    expect(journals).toHaveLength(2);
    for (const journal of journals) await expectJournalBalanced(journal.id);

    const [inventoryId, grniId, apId] = await Promise.all([
      systemAccountId(tenant.tenantId, "INVENTORY"),
      systemAccountId(tenant.tenantId, "GRNI"),
      systemAccountId(tenant.tenantId, "AP"),
    ]);
    const journalLines = await db.select().from(schema.journalLines)
      .where(inArray(schema.journalLines.journalEntryId, journals.map((journal) => journal.id)));
    expect(journalLines.filter((line) => line.accountId === inventoryId).map((line) => line.debit)).toEqual(["10.00", "15.00"]);
    expect(journalLines.filter((line) => line.accountId === grniId).map((line) => line.credit)).toEqual(["10.00", "15.00"]);
    expect(journalLines.some((line) => line.accountId === apId)).toBe(false);
    expect(journalLines.filter((line) => line.accountId === inventoryId).map((line) => ({
      amount: line.originalAmount, currency: line.originalCurrency, rate: line.exchangeRate,
    }))).toEqual([
      { amount: "400.00", currency: "ZWG", rate: "0.025000" },
      { amount: "600.00", currency: "ZWG", rate: "0.025000" },
    ]);

    const audits = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.tenantId, tenant.tenantId));
    expect(audits.map((entry) => entry.action)).toEqual(expect.arrayContaining([
      "purchase_requisition.submitted", "purchase_requisition.approved", "request_for_quote.issued",
      "request_for_quote.awarded", "purchase_order.draft_created", "purchase_order.approved", "goods_receipt.posted",
    ]));
    const approvalNotifications = await db.select().from(schema.notifications).where(and(
      eq(schema.notifications.tenantId, tenant.tenantId),
      eq(schema.notifications.recipient, approver.id),
      eq(schema.notifications.template, "procurement.approval_requested.v1"),
    ));
    expect(approvalNotifications).toHaveLength(2);
  });

  it("serializes concurrent partial receipts so cumulative quantity cannot exceed the ordered amount", async () => {
    const fixture = await procurementFixture("receipt-concurrency");
    const approver = await createRoleUser(fixture.tenant, "Procurement Approver", "concurrency-approver");
    const po = await createAndApproveDirectPo({ fixture, approverAuth: approver.auth, label: "concurrency" });
    const receipt = (key: string) => request(app).post(`/api/v1/purchase-orders/${po.id}/receipts`)
      .set(fixture.tenant.auth).set("Idempotency-Key", key)
      .send({ lines: [{ purchaseOrderLineItemId: po.lines[0].id, quantity: "7" }] });

    const results = await Promise.all([receipt("concurrent-receipt-a"), receipt("concurrent-receipt-b")]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(results.find((result) => result.status === 409)?.body.message).toMatch(/exceeds the outstanding quantity/);
    expect(await stockLevelQuantity(fixture.product.id, fixture.warehouse.id)).toBe("7.000");
    expect(await db.select().from(schema.goodsReceipts)
      .where(eq(schema.goodsReceipts.tenantId, fixture.tenant.tenantId))).toHaveLength(1);
    expect(await db.select().from(schema.journalEntries).where(and(
      eq(schema.journalEntries.tenantId, fixture.tenant.tenantId),
      eq(schema.journalEntries.sourceType, "goods_receipt"),
    ))).toHaveLength(1);
  });

  it("enforces procurement roles and tenant scope before any receipt or journal side effect", async () => {
    const fixture = await procurementFixture("rbac-owner");
    const other = await procurementFixture("rbac-other");
    const officer = await createRoleUser(fixture.tenant, "Procurement Officer", "rbac-officer");
    const approver = await createRoleUser(fixture.tenant, "Procurement Approver", "rbac-approver");
    const otherApprover = await createRoleUser(other.tenant, "Procurement Approver", "rbac-other-approver");
    const otherOfficer = await createRoleUser(other.tenant, "Procurement Officer", "rbac-other-officer");

    const approverCannotRequest = await request(app).post("/api/v1/purchase-requisitions").set(approver.auth).send({
      purpose: "This role must not submit",
      currency: "USD",
      lines: [{ productId: fixture.product.id, warehouseId: fixture.warehouse.id, quantity: "2" }],
    });
    expect(approverCannotRequest.status).toBe(403);

    const requisition = await request(app).post("/api/v1/purchase-requisitions").set(officer.auth).send({
      purpose: "Valid officer requisition",
      currency: "USD",
      lines: [{ productId: fixture.product.id, warehouseId: fixture.warehouse.id, quantity: "2" }],
    });
    expect(requisition.status).toBe(200);
    expect((await request(app).post(`/api/v1/purchase-requisitions/${requisition.body.id}/decision`)
      .set(officer.auth).send({ decision: "APPROVE", reason: "Officer cannot approve" })).status).toBe(403);
    const crossTenantDecision = await request(app).post(`/api/v1/purchase-requisitions/${requisition.body.id}/decision`)
      .set(otherApprover.auth).send({ decision: "APPROVE", reason: "Cross-tenant attempt" });
    expect(crossTenantDecision.status).toBe(404);
    expect((await request(app).post(`/api/v1/purchase-requisitions/${requisition.body.id}/decision`)
      .set(approver.auth).send({ decision: "APPROVE", reason: "Correct independent approval" })).status).toBe(200);

    const po = await createAndApproveDirectPo({ fixture, approverAuth: approver.auth, label: "rbac" });
    const approverCannotReceive = await request(app).post(`/api/v1/purchase-orders/${po.id}/receipts`)
      .set(approver.auth).set("Idempotency-Key", "approver-cannot-receive")
      .send({ lines: [{ purchaseOrderLineItemId: po.lines[0].id, quantity: "1" }] });
    expect(approverCannotReceive.status).toBe(403);
    const crossTenantReceipt = await request(app).post(`/api/v1/purchase-orders/${po.id}/receipts`)
      .set(otherOfficer.auth).set("Idempotency-Key", "cross-tenant-receipt")
      .send({ lines: [{ purchaseOrderLineItemId: po.lines[0].id, quantity: "1" }] });
    expect(crossTenantReceipt.status).toBe(404);

    expect(await db.select().from(schema.goodsReceipts)
      .where(eq(schema.goodsReceipts.tenantId, fixture.tenant.tenantId))).toHaveLength(0);
    expect(await db.select().from(schema.journalEntries).where(and(
      eq(schema.journalEntries.tenantId, fixture.tenant.tenantId),
      eq(schema.journalEntries.sourceType, "goods_receipt"),
    ))).toHaveLength(0);
    expect(await stockLevelQuantity(fixture.product.id, fixture.warehouse.id)).toBe("0.000");
  });
});
