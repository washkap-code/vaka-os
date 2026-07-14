import bcrypt from "bcryptjs";
import { and, eq, like } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { login } from "../../src/auth.js";
import { createDraftInvoice, issueInvoice, voidInvoice } from "../../src/invoicing.js";
import { rebuildValuationLayerFromHistory, recordStockMovement } from "../../src/inventory.js";
import { db, nextDocNumber, schema } from "../../src/lib.js";
import { inventoryValuationReconciliation } from "../../src/reports.js";
import { EVENT_BUS, platformKernel } from "../../src/platform-runtime.js";
import { DOMAIN_EVENTS } from "../../src/platform/events/registry.js";
import { postGoodsReceipt } from "../../src/procurement.js";
import {
  createContact,
  createProduct,
  createPurchaseOrder,
  defaultWarehouse,
  receiveTestPurchaseOrder,
  signupFinanceTenant,
  systemAccountId,
} from "./helpers.js";

const app = createApp();
const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

async function draftStockInvoice(opts: {
  tenant: Awaited<ReturnType<typeof signupFinanceTenant>>;
  productId: string;
  warehouseId: string;
  quantity: string;
  label: string;
}) {
  const customer = await createContact(opts.tenant, `Valuation customer ${opts.label}`);
  return createDraftInvoice({
    tenantId: opts.tenant.tenantId,
    contactId: customer.id,
    currency: "USD",
    createdBy: opts.tenant.userId,
    lines: [{
      productId: opts.productId,
      warehouseId: opts.warehouseId,
      description: `Valued stock ${opts.label}`,
      quantity: opts.quantity,
      unitPrice: "50.00",
      taxTreatment: "exempt",
    }],
  });
}

async function expectAppendOnlyRejection(operation: Promise<unknown>) {
  let rejection: unknown;
  try {
    await operation;
  } catch (error) {
    rejection = error;
  }

  expect(rejection).toBeInstanceOf(Error);
  const wrapped = rejection as Error & { cause?: unknown };
  const causeMessage = wrapped.cause instanceof Error ? wrapped.cause.message : "";
  expect(`${wrapped.message}\n${causeMessage}`).toMatch(/append-only/);
}

describe("P5-003 weighted-average inventory valuation", () => {
  it("values receipts at different costs, partial issues and COGS from immutable weighted-average evidence", async () => {
    const tenant = await signupFinanceTenant("wa-math");
    const warehouse = await defaultWarehouse(tenant);
    const product = await createProduct(tenant, "wa-math", { costPrice: "999.00", taxTreatment: "exempt", taxRate: "0" });
    const firstPo = await createPurchaseOrder(tenant, product.id, warehouse.id, "10", "10.00");
    const secondPo = await createPurchaseOrder(tenant, product.id, warehouse.id, "10", "20.00");
    await receiveTestPurchaseOrder(tenant, firstPo, `wa-first-${runId}`);
    await receiveTestPurchaseOrder(tenant, secondPo, `wa-second-${runId}`);

    const before = await db.select().from(schema.inventoryValuationLayers).where(and(
      eq(schema.inventoryValuationLayers.tenantId, tenant.tenantId),
      eq(schema.inventoryValuationLayers.productId, product.id),
      eq(schema.inventoryValuationLayers.warehouseId, warehouse.id),
    ));
    expect(before[0]).toMatchObject({ quantityOnHand: "20.000", totalCostCents: 30_000n });

    const receivedEvents: Array<Record<string, unknown>> = [];
    const subscription = platformKernel().container.get(EVENT_BUS)
      .subscribe<Record<string, unknown>>(DOMAIN_EVENTS.INVENTORY_VALUED, async (event) => {
        receivedEvents.push(event.payload);
      });
    const draft = await draftStockInvoice({ tenant, productId: product.id, warehouseId: warehouse.id, quantity: "5", label: "partial" });
    const issued = await issueInvoice({ tenantId: tenant.tenantId, invoiceId: draft.id, createdBy: tenant.userId });
    subscription.unsubscribe();

    const [saleMovement] = await db.select().from(schema.stockMovements).where(and(
      eq(schema.stockMovements.tenantId, tenant.tenantId),
      eq(schema.stockMovements.sourceType, "invoice"),
      eq(schema.stockMovements.sourceId, issued.id),
    ));
    const [valuation] = await db.select().from(schema.stockMovementValuations).where(
      eq(schema.stockMovementValuations.stockMovementId, saleMovement.id));
    expect(saleMovement.unitCost).toBe("15.00");
    expect(valuation).toMatchObject({
      quantityBefore: "20.000",
      quantityAfter: "15.000",
      costBeforeCents: 30_000n,
      movementCostCents: 7_500n,
      costAfterCents: 22_500n,
      valuationMethod: "WEIGHTED_AVERAGE",
    });
    await expectAppendOnlyRejection(db.update(schema.stockMovementValuations)
      .set({ movementCostCents: 1n })
      .where(eq(schema.stockMovementValuations.id, valuation.id)));
    await expectAppendOnlyRejection(db.delete(schema.stockMovementValuations)
      .where(eq(schema.stockMovementValuations.id, valuation.id)));

    const [layer] = await db.select().from(schema.inventoryValuationLayers).where(and(
      eq(schema.inventoryValuationLayers.tenantId, tenant.tenantId),
      eq(schema.inventoryValuationLayers.productId, product.id),
      eq(schema.inventoryValuationLayers.warehouseId, warehouse.id),
    ));
    expect(layer).toMatchObject({ quantityOnHand: "15.000", totalCostCents: 22_500n });

    const [cogsJournal] = await db.select().from(schema.journalEntries).where(and(
      eq(schema.journalEntries.tenantId, tenant.tenantId),
      eq(schema.journalEntries.sourceType, "invoice"),
      eq(schema.journalEntries.sourceId, issued.id),
      like(schema.journalEntries.memo, "COGS —%"),
    ));
    const cogsId = await systemAccountId(tenant.tenantId, "COGS");
    const inventoryId = await systemAccountId(tenant.tenantId, "INVENTORY");
    const journalLines = await db.select().from(schema.journalLines)
      .where(eq(schema.journalLines.journalEntryId, cogsJournal.id));
    expect(journalLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: cogsId, debit: "75.00", credit: "0.00" }),
      expect.objectContaining({ accountId: inventoryId, debit: "0.00", credit: "75.00" }),
    ]));
    expect(receivedEvents).toHaveLength(1);
    expect(Object.keys(receivedEvents[0]).sort()).toEqual(["journalEntryId", "movementId", "valuationId"]);
    expect(receivedEvents[0]).toEqual({
      movementId: saleMovement.id,
      valuationId: valuation.id,
      journalEntryId: cogsJournal.id,
    });

    const reconciliation = await inventoryValuationReconciliation(tenant.tenantId);
    expect(reconciliation).toMatchObject({
      status: "RECONCILED",
      inventoryGlBalance: "225.00",
      stockValuation: "225.00",
      difference: "0.00",
      isAudited: false,
      accountantSignOff: "REQUIRED_BEFORE_GA",
    });
    expect(reconciliation.items).toContainEqual(expect.objectContaining({
      productId: product.id,
      warehouseId: warehouse.id,
      stockQuantity: "15.000",
      valuedQuantity: "15.000",
      weightedAverageUnitCost: "15.000000",
      totalValue: "225.00",
      status: "ALIGNED",
    }));
  });

  it("uses the receipt journal base total for FX and consumes every residual cent on a full issue", async () => {
    const tenant = await signupFinanceTenant("wa-fx");
    const warehouse = await defaultWarehouse(tenant);
    const product = await createProduct(tenant, "wa-fx", { costPrice: "777.00", taxTreatment: "exempt", taxRate: "0" });
    const vendor = await createContact(tenant, "FX supplier", { isVendor: true, isCustomer: false });
    const purchaseOrder = await db.transaction(async (tx) => {
      const number = await nextDocNumber(tx, tenant.tenantId, "purchase_order", "PO");
      const [po] = await tx.insert(schema.purchaseOrders).values({
        tenantId: tenant.tenantId,
        vendorContactId: vendor.id,
        number,
        status: "ORDERED",
        currency: "ZWG",
        rateToBase: "0.333333",
        total: "30.00",
        createdBy: tenant.userId,
        approvedBy: tenant.userId,
        approvedAt: new Date(),
        approvalReason: "FX valuation test",
      }).returning();
      const [line] = await tx.insert(schema.purchaseOrderLineItems).values({
        purchaseOrderId: po.id,
        productId: product.id,
        warehouseId: warehouse.id,
        quantity: "3",
        unitCost: "10.00",
        lineTotal: "30.00",
      }).returning();
      return { ...po, lines: [line] };
    });
    await postGoodsReceipt({
      tenantId: tenant.tenantId,
      actorUserId: tenant.userId,
      purchaseOrderId: purchaseOrder.id,
      idempotencyKey: `wa-fx-receipt-${runId}`,
      input: { lines: [{ purchaseOrderLineItemId: purchaseOrder.lines[0].id, quantity: "3" }] },
    });
    const [receiptLayer] = await db.select().from(schema.inventoryValuationLayers).where(and(
      eq(schema.inventoryValuationLayers.tenantId, tenant.tenantId),
      eq(schema.inventoryValuationLayers.productId, product.id),
      eq(schema.inventoryValuationLayers.warehouseId, warehouse.id),
    ));
    // A rounded $3.33 unit snapshot would total $9.99; authoritative line FX is $10.00.
    expect(receiptLayer).toMatchObject({ quantityOnHand: "3.000", totalCostCents: 1_000n });

    const draft = await draftStockInvoice({ tenant, productId: product.id, warehouseId: warehouse.id, quantity: "3", label: "fx-full" });
    await issueInvoice({ tenantId: tenant.tenantId, invoiceId: draft.id, createdBy: tenant.userId });
    const [after] = await db.select().from(schema.inventoryValuationLayers).where(eq(schema.inventoryValuationLayers.id, receiptLayer.id));
    expect(after).toMatchObject({ quantityOnHand: "0.000", totalCostCents: 0n });
    const reconciliation = await inventoryValuationReconciliation(tenant.tenantId);
    expect(reconciliation).toMatchObject({ status: "RECONCILED", inventoryGlBalance: "0.00", stockValuation: "0.00", difference: "0.00" });
  });

  it("rounds deterministically, replays idempotently and never leaves cost at zero quantity", async () => {
    const tenant = await signupFinanceTenant("wa-rounding");
    const warehouse = await defaultWarehouse(tenant);
    const product = await createProduct(tenant, "wa-rounding", { costPrice: "0.00" });
    await db.transaction(async (tx) => {
      await recordStockMovement(tx, {
        tenantId: tenant.tenantId,
        productId: product.id,
        warehouseId: warehouse.id,
        quantityDelta: "3",
        unitCost: "0.00",
        totalCostBaseCents: 1n,
        reason: "OPENING",
        sourceType: "rounding_test",
        idempotencyKey: `rounding-in-${runId}`,
        idempotencyFingerprint: "rounding-in",
        createdBy: tenant.userId,
      });
    });
    const issue = (key: string, quantity: string) => db.transaction((tx) => recordStockMovement(tx, {
      tenantId: tenant.tenantId,
      productId: product.id,
      warehouseId: warehouse.id,
      quantityDelta: `-${quantity}`,
      reason: "ADJUSTMENT" as const,
      sourceType: "rounding_test",
      idempotencyKey: key,
      idempotencyFingerprint: key,
      createdBy: tenant.userId,
    }));
    const first = await issue(`rounding-out-1-${runId}`, "1");
    const replay = await issue(`rounding-out-1-${runId}`, "1");
    const second = await issue(`rounding-out-2-${runId}`, "1");
    const final = await issue(`rounding-out-3-${runId}`, "1");
    expect(replay.movementId).toBe(first.movementId);
    expect([first, second, final].map((row) => row.valuation.movementCostCents)).toEqual(["0", "1", "0"]);
    const [layer] = await db.select().from(schema.inventoryValuationLayers).where(and(
      eq(schema.inventoryValuationLayers.tenantId, tenant.tenantId),
      eq(schema.inventoryValuationLayers.productId, product.id),
      eq(schema.inventoryValuationLayers.warehouseId, warehouse.id),
    ));
    expect(layer).toMatchObject({ quantityOnHand: "0.000", totalCostCents: 0n });
    const evidence = await db.select().from(schema.stockMovementValuations).where(and(
      eq(schema.stockMovementValuations.tenantId, tenant.tenantId),
      eq(schema.stockMovementValuations.productId, product.id),
    ));
    expect(evidence).toHaveLength(4);
  });

  it("rebuilds a missing layer chronologically from legacy append-only movement history", async () => {
    const tenant = await signupFinanceTenant("wa-backfill");
    const warehouse = await defaultWarehouse(tenant);
    const product = await createProduct(tenant, "wa-backfill");
    await db.insert(schema.stockLevels).values({
      productId: product.id,
      warehouseId: warehouse.id,
      quantityOnHand: "15.000",
    });
    const baseTime = Date.now() - 10_000;
    const movements = await db.insert(schema.stockMovements).values([
      {
        tenantId: tenant.tenantId, productId: product.id, warehouseId: warehouse.id,
        quantityDelta: "10.000", unitCost: "10.00", reason: "PURCHASE",
        sourceType: "legacy_fixture", createdBy: tenant.userId, createdAt: new Date(baseTime),
      },
      {
        tenantId: tenant.tenantId, productId: product.id, warehouseId: warehouse.id,
        quantityDelta: "10.000", unitCost: "20.00", reason: "PURCHASE",
        sourceType: "legacy_fixture", createdBy: tenant.userId, createdAt: new Date(baseTime + 1_000),
      },
      {
        tenantId: tenant.tenantId, productId: product.id, warehouseId: warehouse.id,
        quantityDelta: "-5.000", unitCost: "999.00", reason: "SALE",
        sourceType: "legacy_fixture", createdBy: tenant.userId, createdAt: new Date(baseTime + 2_000),
      },
    ]).returning();
    const layer = await db.transaction((tx) => rebuildValuationLayerFromHistory(tx, {
      tenantId: tenant.tenantId,
      productId: product.id,
      warehouseId: warehouse.id,
    }));
    expect(layer).toMatchObject({ quantityOnHand: "15.000", totalCostCents: 22_500n });
    const evidence = await db.select().from(schema.stockMovementValuations).where(and(
      eq(schema.stockMovementValuations.tenantId, tenant.tenantId),
      eq(schema.stockMovementValuations.productId, product.id),
    ));
    expect(evidence).toHaveLength(3);
    const byMovement = new Map(evidence.map((row) => [row.stockMovementId, row]));
    expect(byMovement.get(movements[2].id)).toMatchObject({
      movementCostCents: 7_500n,
      costAfterCents: 22_500n,
      quantityAfter: "15.000",
    });
  });

  it("refuses oversell and rolls back valuation, journal, number, audit and events when posting fails", async () => {
    const tenant = await signupFinanceTenant("wa-rollback");
    const warehouse = await defaultWarehouse(tenant);
    const product = await createProduct(tenant, "wa-rollback", { taxTreatment: "exempt", taxRate: "0" });
    const po = await createPurchaseOrder(tenant, product.id, warehouse.id, "2", "5.00");
    await receiveTestPurchaseOrder(tenant, po, `wa-rollback-receipt-${runId}`);
    const [beforeLayer] = await db.select().from(schema.inventoryValuationLayers).where(and(
      eq(schema.inventoryValuationLayers.tenantId, tenant.tenantId),
      eq(schema.inventoryValuationLayers.productId, product.id),
      eq(schema.inventoryValuationLayers.warehouseId, warehouse.id),
    ));
    const oversell = await draftStockInvoice({ tenant, productId: product.id, warehouseId: warehouse.id, quantity: "3", label: "oversell" });
    await expect(issueInvoice({ tenantId: tenant.tenantId, invoiceId: oversell.id, createdBy: tenant.userId }))
      .rejects.toThrow(/Insufficient stock/);
    expect((await db.select().from(schema.invoices).where(eq(schema.invoices.id, oversell.id)))[0]).toMatchObject({ status: "DRAFT", number: null });
    expect((await db.select().from(schema.inventoryValuationLayers).where(eq(schema.inventoryValuationLayers.id, beforeLayer.id)))[0])
      .toMatchObject({ quantityOnHand: "2.000", totalCostCents: 1_000n, version: beforeLayer.version });

    const postingFailure = await draftStockInvoice({ tenant, productId: product.id, warehouseId: warehouse.id, quantity: "1", label: "journal-failure" });
    const inventoryAccountId = await systemAccountId(tenant.tenantId, "INVENTORY");
    await db.update(schema.accounts).set({ isActive: false }).where(eq(schema.accounts.id, inventoryAccountId));
    const emitted: unknown[] = [];
    const subscription = platformKernel().container.get(EVENT_BUS)
      .subscribe(DOMAIN_EVENTS.INVENTORY_VALUED, async (event) => { emitted.push(event.payload); });
    await expect(issueInvoice({ tenantId: tenant.tenantId, invoiceId: postingFailure.id, createdBy: tenant.userId }))
      .rejects.toThrow(/Journal line account is invalid/);
    subscription.unsubscribe();
    await db.update(schema.accounts).set({ isActive: true }).where(eq(schema.accounts.id, inventoryAccountId));

    expect(emitted).toHaveLength(0);
    expect((await db.select().from(schema.invoices).where(eq(schema.invoices.id, postingFailure.id)))[0])
      .toMatchObject({ status: "DRAFT", number: null });
    expect((await db.select().from(schema.inventoryValuationLayers).where(eq(schema.inventoryValuationLayers.id, beforeLayer.id)))[0])
      .toMatchObject({ quantityOnHand: "2.000", totalCostCents: 1_000n, version: beforeLayer.version });
    const failedMovements = await db.select().from(schema.stockMovements).where(and(
      eq(schema.stockMovements.tenantId, tenant.tenantId),
      eq(schema.stockMovements.sourceType, "invoice"),
      eq(schema.stockMovements.sourceId, postingFailure.id),
    ));
    expect(failedMovements).toHaveLength(0);
    const issueAudits = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, tenant.tenantId),
      eq(schema.auditLogs.action, "inventory.issue_valued"),
      eq(schema.auditLogs.entityId, postingFailure.id),
    ));
    expect(issueAudits).toHaveLength(0);
  });

  it("serializes simultaneous issues and restores the original allocation on void", async () => {
    const tenant = await signupFinanceTenant("wa-concurrency");
    const warehouse = await defaultWarehouse(tenant);
    const product = await createProduct(tenant, "wa-concurrency", { taxTreatment: "exempt", taxRate: "0" });
    const po = await createPurchaseOrder(tenant, product.id, warehouse.id, "5", "8.00");
    await receiveTestPurchaseOrder(tenant, po, `wa-concurrency-receipt-${runId}`);
    const first = await draftStockInvoice({ tenant, productId: product.id, warehouseId: warehouse.id, quantity: "3", label: "concurrent-a" });
    const second = await draftStockInvoice({ tenant, productId: product.id, warehouseId: warehouse.id, quantity: "3", label: "concurrent-b" });
    const results = await Promise.allSettled([
      issueInvoice({ tenantId: tenant.tenantId, invoiceId: first.id, createdBy: tenant.userId }),
      issueInvoice({ tenantId: tenant.tenantId, invoiceId: second.id, createdBy: tenant.userId }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const successful = results.find((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof issueInvoice>>> => result.status === "fulfilled")!;
    const [afterIssue] = await db.select().from(schema.inventoryValuationLayers).where(and(
      eq(schema.inventoryValuationLayers.tenantId, tenant.tenantId),
      eq(schema.inventoryValuationLayers.productId, product.id),
      eq(schema.inventoryValuationLayers.warehouseId, warehouse.id),
    ));
    expect(afterIssue).toMatchObject({ quantityOnHand: "2.000", totalCostCents: 1_600n });

    await voidInvoice({ tenantId: tenant.tenantId, invoiceId: successful.value.id, reason: "Concurrency test reversal", createdBy: tenant.userId });
    const [afterVoid] = await db.select().from(schema.inventoryValuationLayers).where(eq(schema.inventoryValuationLayers.id, afterIssue.id));
    expect(afterVoid).toMatchObject({ quantityOnHand: "5.000", totalCostCents: 4_000n });
    expect(await inventoryValuationReconciliation(tenant.tenantId)).toMatchObject({
      status: "RECONCILED", inventoryGlBalance: "40.00", stockValuation: "40.00", difference: "0.00",
    });
  });

  it("keeps reconciliation tenant-scoped and denies users without reports.read", async () => {
    const tenantA = await signupFinanceTenant("wa-report-a");
    const tenantB = await signupFinanceTenant("wa-report-b");
    const warehouse = await defaultWarehouse(tenantA);
    const product = await createProduct(tenantA, "wa-report-a");
    const po = await createPurchaseOrder(tenantA, product.id, warehouse.id, "1", "12.00");
    await receiveTestPurchaseOrder(tenantA, po, `wa-report-receipt-${runId}`);

    const ownerA = await request(app).get("/api/v1/reports/inventory-valuation").set(tenantA.auth);
    const ownerB = await request(app).get("/api/v1/reports/inventory-valuation").set(tenantB.auth);
    expect(ownerA.status).toBe(200);
    expect(ownerA.body.items).toContainEqual(expect.objectContaining({ productId: product.id }));
    expect(ownerB.status).toBe(200);
    expect(ownerB.body.items).not.toContainEqual(expect.objectContaining({ productId: product.id }));

    const [role] = await db.select().from(schema.roles).where(and(
      eq(schema.roles.tenantId, tenantA.tenantId),
      eq(schema.roles.name, "Stock Controller"),
    ));
    const email = `wa-no-report-${runId}@test.zw`;
    const password = "Valuation-Test-123!";
    await db.insert(schema.users).values({
      tenantId: tenantA.tenantId,
      email,
      fullName: "Stock controller without reports",
      passwordHash: await bcrypt.hash(password, 4),
      roleId: role.id,
      mustChangePassword: false,
      status: "active",
    });
    const tenantRecord = (await db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantA.tenantId)))[0];
    const session = await login(email, password, tenantRecord.subdomain);
    const denied = await request(app).get("/api/v1/reports/inventory-valuation")
      .set({ Authorization: `Bearer ${session.token}` });
    expect(denied.status).toBe(403);
  });
});
