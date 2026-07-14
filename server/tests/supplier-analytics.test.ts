import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { postJournal } from "../src/accounting.js";
import { login } from "../src/auth.js";
import { db, schema } from "../src/lib.js";
import { postGoodsReceipt } from "../src/procurement.js";
import {
  createProduct, createPurchaseOrder, defaultWarehouse, signupFinanceTenant, systemAccountId, type TestTenant,
} from "./finance/helpers.js";

const app = createApp();
const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const today = () => new Date().toISOString().slice(0, 10);

async function customRoleUser(tenant: TestTenant, permissions: string[], label: string) {
  const [role] = await db.insert(schema.roles).values({
    tenantId: tenant.tenantId, name: `Supplier analytics ${label} ${runId}`, permissions, isSystem: false,
  }).returning();
  const [tenantRow] = await db.select({ subdomain: schema.tenants.subdomain })
    .from(schema.tenants).where(eq(schema.tenants.id, tenant.tenantId));
  const email = `supplier-analytics-${runId}-${label}@test.vaka`;
  const password = "Supplier-Analytics-Test-123!";
  await db.insert(schema.users).values({
    tenantId: tenant.tenantId, email, fullName: `Supplier analytics ${label}`,
    passwordHash: await bcrypt.hash(password, 4), roleId: role.id,
    mustChangePassword: false, status: "active",
  });
  const session = await login(email, password, tenantRow.subdomain);
  return { Authorization: `Bearer ${session.token}` };
}

function reportPath(extra = "") {
  const date = today();
  return `/api/v1/reports/supplier-performance?from=${date}&to=${date}&asAt=${date}${extra}`;
}

describe("P4-004 supplier performance and spend analytics", () => {
  it("reports exact FX spend, on-time delivery, current match blocks and reconciled GRNI/AP exposure", async () => {
    const tenant = await signupFinanceTenant(`supplier-analytics-${runId}`);
    const warehouse = await defaultWarehouse(tenant);
    const product = await createProduct(tenant, `supplier-analytics-${runId}`, {
      costPrice: "100.00", salePrice: "150.00", trackStock: true,
    });
    const po = await createPurchaseOrder(tenant, product.id, warehouse.id, "10", "100.00");
    const expectedDate = new Date(`${today()}T00:00:00.000Z`);
    await db.update(schema.purchaseOrders).set({
      currency: "ZWG", rateToBase: "0.5", expectedDate,
    }).where(and(eq(schema.purchaseOrders.id, po.id), eq(schema.purchaseOrders.tenantId, tenant.tenantId)));
    await postGoodsReceipt({
      tenantId: tenant.tenantId, actorUserId: tenant.userId, purchaseOrderId: po.id,
      idempotencyKey: `supplier-analytics-receipt-${runId}`,
      input: {
        receivedAt: new Date(`${today()}T12:00:00.000Z`),
        lines: [{ purchaseOrderLineItemId: po.lines[0].id, quantity: "10" }],
      },
    });

    const postedDraft = await request(app).post("/api/v1/supplier-bills").set(tenant.auth).send({
      purchaseOrderId: po.id,
      supplierInvoiceNumber: `AN-POSTED-${runId}`,
      billDate: today(), taxDate: today(), dueDate: today(), rateToBase: "0.5",
      lines: [{
        purchaseOrderLineItemId: po.lines[0].id, quantity: "4",
        unitPrice: "100.00", taxTreatment: "exempt",
      }],
    });
    expect(postedDraft.status).toBe(200);
    const posted = await request(app).post(`/api/v1/supplier-bills/${postedDraft.body.id}/post`)
      .set(tenant.auth).set("Idempotency-Key", `supplier-analytics-post-${runId}`).send({ confirmed: true });
    expect(posted.status).toBe(200);

    const blockedDraft = await request(app).post("/api/v1/supplier-bills").set(tenant.auth).send({
      purchaseOrderId: po.id,
      supplierInvoiceNumber: `AN-BLOCKED-${runId}`,
      billDate: today(), taxDate: today(), dueDate: today(), rateToBase: "0.55",
      lines: [{
        purchaseOrderLineItemId: po.lines[0].id, quantity: "7",
        unitPrice: "110.00", taxTreatment: "exempt",
      }],
    });
    expect(blockedDraft.status).toBe(200);

    const report = await request(app).get(reportPath()).set(tenant.auth);
    expect(report.status).toBe(200);
    expect(report.headers["cache-control"]).toContain("private, no-store");
    expect(report.body).toMatchObject({
      reportType: "supplier-performance-and-spend-analytics",
      baseCurrency: "USD",
      summary: {
        supplierCount: 1, baseSpend: "200.00", onTimeOrders: 1,
        eligibleDeliveryOrders: 1, onTimeRateBasisPoints: 10000,
        openGrniBase: "300.00", sourceScheduledApBase: "200.00", currentBlockedDrafts: 1,
      },
      spend: {
        baseGrossTiesToApSource: true,
        rows: [{
          supplierId: po.vendorContactId, currency: "ZWG", postedBillCount: 1,
          originalNet: "400.00", originalTax: "0.00", originalGross: "400.00",
          baseNet: "200.00", baseTax: "0.00", baseGross: "200.00", baseSourceDifference: "0.00",
        }],
      },
      delivery: {
        rows: [{
          supplierId: po.vendorContactId, completedOrders: 1, eligibleOrders: 1,
          onTimeOrders: 1, lateOrders: 0, missingExpectedDate: 0, onTimeRateBasisPoints: 10000,
        }],
      },
      priceVariance: {
        postedPolicy: "STRICT_EXACT_MATCH", postedBaseVariance: "0.00",
        rows: [{
          billId: blockedDraft.body.id, currency: "ZWG", quantity: "7.000",
          approvedUnitPrice: "100.00", billUnitPrice: "110.00", variancePerUnit: "10.00",
          originalVariance: "70.00", baseVarianceAtPoRate: "35.00", rateToBase: "0.500000",
        }],
      },
      matchExceptions: {
        basis: "CURRENT_DRAFT_REEVALUATION", historicalAttemptCoverage: "NOT_RECORDED_ROLLED_BACK_ATTEMPTS",
        draftsEvaluated: 1, blockedDrafts: 1,
      },
      exposure: {
        grni: {
          selectedScheduleBase: "300.00", tenantScheduleBase: "300.00",
          tenantControlBase: "300.00", tenantUnallocatedBase: "0.00", tenantTies: true,
          rows: [{
            supplierId: po.vendorContactId, currency: "ZWG", receivedQuantity: "10",
            billedQuantity: "4", receivedOriginal: "1000.00", billedOriginal: "400.00",
            openOriginal: "600.00", receivedBase: "500.00", billedBase: "200.00", openBase: "300.00",
          }],
        },
        accountsPayable: {
          completeOpenItemSubledger: false, selectedScheduleBase: "200.00", tenantScheduleBase: "200.00",
          tenantControlBase: "200.00", tenantUnallocatedBase: "0.00", tenantTies: true,
          rows: [{
            supplierId: po.vendorContactId, currency: "ZWG", postedBillCount: 1,
            originalGross: "400.00", baseGross: "200.00",
          }],
        },
      },
    });
    expect(report.body.matchExceptions.reasonCounts).toEqual(expect.arrayContaining([
      { code: "PRICE_MISMATCH", count: 1 },
      { code: "QUANTITY_EXCEEDS_RECEIVED", count: 1 },
      { code: "QUANTITY_EXCEEDS_ORDERED", count: 1 },
    ]));
  });

  it("enforces read permissions, validates periods and isolates supplier filters without writes", async () => {
    const first = await signupFinanceTenant(`supplier-analytics-controls-a-${runId}`);
    const second = await signupFinanceTenant(`supplier-analytics-controls-b-${runId}`);
    const warehouse = await defaultWarehouse(first);
    const product = await createProduct(first, `supplier-analytics-controls-${runId}`, { trackStock: true });
    const po = await createPurchaseOrder(first, product.id, warehouse.id, "1", "10.00");
    const reader = await customRoleUser(first, ["procurement.read"], "reader");
    const denied = await customRoleUser(first, ["crm.read"], "denied");
    const [apAccountId, openingEquityId] = await Promise.all([
      systemAccountId(first.tenantId, "AP"), systemAccountId(first.tenantId, "OPENING_EQUITY"),
    ]);
    await postJournal(db, {
      tenantId: first.tenantId, date: new Date(`${today()}T12:00:00.000Z`),
      memo: "Supplier analytics unallocated AP control fixture", sourceType: "manual",
      sourceId: `supplier-analytics-unallocated-${runId}`, createdBy: first.userId,
      lines: [{ accountId: openingEquityId, debit: "5.00" }, { accountId: apAccountId, credit: "5.00" }],
    });
    const auditsBefore = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.tenantId, first.tenantId));
    const journalsBefore = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.tenantId, first.tenantId));

    const allowed = await request(app).get(reportPath()).set(reader);
    expect(allowed.status).toBe(200);
    expect(allowed.body).toMatchObject({ summary: { baseSpend: "0.00", currentBlockedDrafts: 0 } });
    expect(allowed.body.spend.rows).toEqual([]);
    expect(allowed.body.exposure.accountsPayable).toMatchObject({
      selectedScheduleBase: "0.00", tenantScheduleBase: "0.00", tenantControlBase: "5.00",
      tenantUnallocatedBase: "5.00", tenantTies: false,
    });
    expect((await request(app).get(reportPath()).set(denied)).status).toBe(403);
    expect((await request(app).get(reportPath(`&supplierId=${po.vendorContactId}`)).set(reader)).status).toBe(200);
    expect((await request(app).get(reportPath(`&supplierId=${po.vendorContactId}`)).set(second.auth)).status).toBe(404);

    const reversed = await request(app).get(
      "/api/v1/reports/supplier-performance?from=2026-07-14&to=2026-07-13&asAt=2026-07-14",
    ).set(reader);
    expect(reversed.status).toBe(400);
    const tooLong = await request(app).get(
      "/api/v1/reports/supplier-performance?from=2025-01-01&to=2026-01-02&asAt=2026-01-02",
    ).set(reader);
    expect(tooLong.status).toBe(400);
    expect(await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.tenantId, first.tenantId))).toHaveLength(auditsBefore.length);
    expect(await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.tenantId, first.tenantId))).toHaveLength(journalsBefore.length);
  });
});
