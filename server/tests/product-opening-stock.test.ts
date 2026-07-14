import { and, eq } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { db, schema, toCents } from "../src/lib.js";
import { defaultWarehouse, signupFinanceTenant } from "./finance/helpers.js";

const app = createApp();

describe("product setup with opening stock", () => {
  it("creates the product, movement, balanced journal and audit atomically", async () => {
    const tenant = await signupFinanceTenant("product-opening-atomic");
    const warehouse = await defaultWarehouse(tenant);

    const response = await request(app).post("/api/v1/products").set(tenant.auth).send({
      sku: `OPEN-${Date.now()}`,
      name: "Opening Stock Product",
      costPrice: "2.50",
      salePrice: "4.00",
      currency: "USD",
      taxTreatment: "standard",
      reorderLevel: 3,
      trackStock: true,
      openingStock: { warehouseId: warehouse.id, quantity: "12.500", unitCost: "2.50" },
    });

    expect(response.status).toBe(200);
    const [movement] = await db.select().from(schema.stockMovements).where(and(
      eq(schema.stockMovements.tenantId, tenant.tenantId),
      eq(schema.stockMovements.productId, response.body.id),
      eq(schema.stockMovements.reason, "OPENING"),
    ));
    expect(movement).toMatchObject({
      warehouseId: warehouse.id,
      quantityDelta: "12.500",
      unitCost: "2.50",
      sourceType: "product_setup",
      sourceId: response.body.id,
    });
    const [level] = await db.select().from(schema.stockLevels).where(and(
      eq(schema.stockLevels.productId, response.body.id),
      eq(schema.stockLevels.warehouseId, warehouse.id),
    ));
    expect(Number(level.quantityOnHand)).toBe(12.5);
    const [journal] = await db.select().from(schema.journalEntries).where(and(
      eq(schema.journalEntries.tenantId, tenant.tenantId),
      eq(schema.journalEntries.sourceType, "stock_adjustment"),
      eq(schema.journalEntries.sourceId, movement.id),
    ));
    const lines = await db.select().from(schema.journalLines)
      .where(eq(schema.journalLines.journalEntryId, journal.id));
    expect(lines).toHaveLength(2);
    expect(lines.reduce((sum, line) => sum + toCents(line.debit), 0n))
      .toBe(lines.reduce((sum, line) => sum + toCents(line.credit), 0n));
    const [openingAudit] = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, tenant.tenantId),
      eq(schema.auditLogs.action, "stock.opening_recorded"),
      eq(schema.auditLogs.entityId, movement.id),
    ));
    expect(openingAudit.metadata).toMatchObject({
      productId: response.body.id,
      warehouseId: warehouse.id,
      quantity: "12.500",
      unitCost: "2.50",
      inventoryValue: "31.25",
      journalEntryId: journal.id,
    });
  });

  it("rolls back product creation when the opening warehouse belongs to another tenant", async () => {
    const tenant = await signupFinanceTenant("product-opening-owner");
    const otherTenant = await signupFinanceTenant("product-opening-other");
    const foreignWarehouse = await defaultWarehouse(otherTenant);
    const sku = `ROLLBACK-${Date.now()}`;

    const response = await request(app).post("/api/v1/products").set(tenant.auth).send({
      sku,
      name: "Must Roll Back",
      costPrice: "1.00",
      salePrice: "2.00",
      currency: "USD",
      taxTreatment: "standard",
      trackStock: true,
      openingStock: { warehouseId: foreignWarehouse.id, quantity: "1", unitCost: "1.00" },
    });

    expect(response.status).toBe(400);
    expect(await db.select().from(schema.products).where(and(
      eq(schema.products.tenantId, tenant.tenantId),
      eq(schema.products.sku, sku),
    ))).toHaveLength(0);
  });

  it("rejects opening quantity for a service item before creating the product", async () => {
    const tenant = await signupFinanceTenant("product-opening-service");
    const warehouse = await defaultWarehouse(tenant);
    const sku = `SERVICE-${Date.now()}`;
    const response = await request(app).post("/api/v1/products").set(tenant.auth).send({
      sku,
      name: "Service Item",
      costPrice: "10.00",
      salePrice: "20.00",
      currency: "USD",
      taxTreatment: "standard",
      trackStock: false,
      openingStock: { warehouseId: warehouse.id, quantity: "1", unitCost: "10.00" },
    });
    expect(response.status).toBe(400);
    expect(await db.select().from(schema.products).where(and(
      eq(schema.products.tenantId, tenant.tenantId),
      eq(schema.products.sku, sku),
    ))).toHaveLength(0);
  });
});
