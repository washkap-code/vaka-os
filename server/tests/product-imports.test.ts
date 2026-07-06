import { describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { db, schema } from "../src/lib.js";

const app = createApp();
const uniq = Date.now().toString(36);

async function signup(label: string) {
  const response = await request(app).post("/api/v1/auth/signup").send({
    companyName: `Product Import ${label}`,
    subdomain: `productimport${uniq}${label}`,
    baseCurrency: "USD",
    ownerEmail: `product-import-${uniq}-${label}@test.zw`,
    ownerPassword: "Import-Password-123!",
    ownerName: "Import Owner",
    planName: "Growth",
  });
  expect(response.status).toBe(200);
  return response.body;
}

describe("product CSV imports", () => {
  it("previews, validates, deduplicates and commits products without changing stock", async () => {
    const tenant = await signup("a");
    const auth = { Authorization: `Bearer ${tenant.token}` };
    const csvText = [
      "sku,name,description,unit,cost_price,sale_price,currency,tax_rate,reorder_level,track_stock,is_active",
      "BREAD-001,Brown Bread,700g loaf,each,0.80,1.20,USD,15,10,yes,yes",
      "BREAD-001,Duplicate Bread,,each,0.80,1.20,USD,15,10,yes,yes",
      "BAD-PRICE,Bad Price,,each,free,1.00,USD,15,0,yes,yes",
      "CONSULT-01,Business Consultation,Hourly service,hour,0,75.00,USD,0,0,no,yes",
    ].join("\n");
    const preview = await request(app).post("/api/v1/imports/products/preview")
      .set(auth).send({ csvText });
    expect(preview.status).toBe(200);
    expect(preview.body.batch).toMatchObject({
      totalRows: 4,
      validRows: 2,
      duplicateRows: 1,
      invalidRows: 1,
      status: "PREVIEW",
    });

    const other = await signup("b");
    const crossTenant = await request(app)
      .post(`/api/v1/imports/products/${preview.body.batch.id}/commit`)
      .set({ Authorization: `Bearer ${other.token}` }).send({});
    expect(crossTenant.status).toBe(409);

    const committed = await request(app)
      .post(`/api/v1/imports/products/${preview.body.batch.id}/commit`)
      .set(auth).send({});
    expect(committed.status).toBe(200);
    expect(committed.body.importedRows).toBe(2);

    const products = await db.select().from(schema.products)
      .where(eq(schema.products.tenantId, tenant.tenant.id));
    expect(products.map((product) => product.sku).sort()).toEqual(["BREAD-001", "CONSULT-01"]);
    expect(products.find((product) => product.sku === "CONSULT-01")?.trackStock).toBe(false);
    const stock = await db.select().from(schema.stockMovements)
      .where(eq(schema.stockMovements.tenantId, tenant.tenant.id));
    expect(stock).toHaveLength(0);

    const retry = await request(app)
      .post(`/api/v1/imports/products/${preview.body.batch.id}/commit`)
      .set(auth).send({});
    expect(retry.status).toBe(409);
  });
});
