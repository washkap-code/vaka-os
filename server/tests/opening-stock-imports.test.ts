import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { db, schema } from "../src/lib.js";

const app = createApp();
const uniq = Date.now().toString(36);

async function signup(label: string) {
  const response = await request(app).post("/api/v1/auth/signup").send({
    companyName: `Opening Stock ${label}`,
    subdomain: `openingstock${uniq}${label}`,
    baseCurrency: "USD",
    ownerEmail: `opening-stock-${uniq}-${label}@test.zw`,
    ownerPassword: "Import-Password-123!",
    ownerName: "Inventory Owner",
    planName: "Growth",
  });
  expect(response.status).toBe(200);
  return response.body;
}

describe("opening stock CSV imports", () => {
  it("posts stock and a balanced opening journal atomically", async () => {
    const tenant = await signup("a");
    const auth = { Authorization: `Bearer ${tenant.token}` };
    const product = await request(app).post("/api/v1/products").set(auth).send({
      sku: "MAIZE-10KG",
      name: "Maize Meal 10kg",
      costPrice: "0",
      salePrice: "9.50",
      currency: "USD",
      trackStock: true,
    });
    const mainWarehouse = (await request(app).get("/api/v1/warehouses").set(auth)).body[0];
    const branchWarehouse = (await request(app).post("/api/v1/warehouses").set(auth)
      .send({ name: "Bulawayo Branch" })).body;
    const csvText = [
      "sku,warehouse,quantity,unit_cost",
      `MAIZE-10KG,${mainWarehouse.name},10,2.00`,
      "MAIZE-10KG,Bulawayo Branch,5,2.00",
      `MAIZE-10KG,${mainWarehouse.name},3,2.00`,
      "UNKNOWN,Main Warehouse,4,1.00",
    ].join("\n");
    const preview = await request(app).post("/api/v1/imports/opening-stock/preview")
      .set(auth).send({ csvText });
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({
      baseCurrency: "USD",
      batch: { totalRows: 4, validRows: 2, duplicateRows: 1, invalidRows: 1 },
    });

    const other = await signup("b");
    const otherWarehouse = (await request(app).get("/api/v1/warehouses")
      .set({ Authorization: `Bearer ${other.token}` })).body[0];
    const crossTenantWarehouse = await request(app).post("/api/v1/stock/opening")
      .set(auth).send({
        productId: product.body.id,
        warehouseId: otherWarehouse.id,
        quantity: "1",
        unitCost: "2.00",
      });
    expect(crossTenantWarehouse.status).toBe(400);

    const denied = await request(app)
      .post(`/api/v1/imports/opening-stock/${preview.body.batch.id}/commit`)
      .set({ Authorization: `Bearer ${other.token}` }).send({});
    expect(denied.status).toBe(409);

    const committed = await request(app)
      .post(`/api/v1/imports/opening-stock/${preview.body.batch.id}/commit`)
      .set(auth).send({});
    expect(committed.status).toBe(200);
    expect(committed.body).toMatchObject({ importedRows: 2, totalValue: "30.00" });

    const movements = await db.select().from(schema.stockMovements).where(and(
      eq(schema.stockMovements.tenantId, tenant.tenant.id),
      eq(schema.stockMovements.reason, "OPENING"),
    ));
    expect(movements).toHaveLength(2);
    const levels = await db.select().from(schema.stockLevels)
      .where(eq(schema.stockLevels.productId, product.body.id));
    expect(levels.map((level) => Number(level.quantityOnHand)).sort((a, b) => a - b))
      .toEqual([5, 10]);
    expect(await db.select().from(schema.journalLines).where(
      eq(schema.journalLines.journalEntryId, committed.body.journalEntryId),
    )).toHaveLength(2);
    const [updatedProduct] = await db.select().from(schema.products)
      .where(eq(schema.products.id, product.body.id));
    expect(updatedProduct.costPrice).toBe("2.00");

    const retry = await request(app)
      .post(`/api/v1/imports/opening-stock/${preview.body.batch.id}/commit`)
      .set(auth).send({});
    expect(retry.status).toBe(409);
    expect(branchWarehouse.id).toBeTruthy();
  });
});
