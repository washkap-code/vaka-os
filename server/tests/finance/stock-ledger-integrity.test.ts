import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "../../src/lib.js";
import { createDraftInvoice, issueInvoice, voidInvoice } from "../../src/invoicing.js";
import { adjustStock } from "../../src/inventory.js";
import {
  createContact, createProduct, createPurchaseOrder, defaultWarehouse,
  receiveTestPurchaseOrder, stockLevelQuantity, stockQuantityFromMovements, signupFinanceTenant,
} from "./helpers.js";

describe("finance kernel - stock ledger integrity", () => {
  it("keeps stock level equal to movement sum across receipt, adjustment, sale, and void correction", async () => {
    const tenant = await signupFinanceTenant("stock-integrity");
    const warehouse = await defaultWarehouse(tenant);
    const product = await createProduct(tenant, "stock-integrity", { costPrice: "5.00", salePrice: "9.00" });
    const po = await createPurchaseOrder(tenant, product.id, warehouse.id, "10", "5.00");
    await receiveTestPurchaseOrder(tenant, po, "goods-receipt-stock-integrity-1");

    await db.transaction((tx) => adjustStock(tx, {
      tenantId: tenant.tenantId,
      productId: product.id,
      warehouseId: warehouse.id,
      quantityDelta: "-2",
      note: "Count correction",
      idempotencyKey: "stock-integrity-adjust-1",
      createdBy: tenant.userId,
    }));

    const customer = await createContact(tenant, "Stock Customer");
    const draft = await createDraftInvoice({
      tenantId: tenant.tenantId,
      contactId: customer.id,
      currency: "USD",
      createdBy: tenant.userId,
      lines: [{
        productId: product.id,
        warehouseId: warehouse.id,
        description: "Stock sale",
        quantity: "3",
        unitPrice: "9.00",
        taxRate: "15",
      }],
    });
    const issued = await issueInvoice({ tenantId: tenant.tenantId, invoiceId: draft.id, createdBy: tenant.userId });

    expect(await stockLevelQuantity(product.id, warehouse.id)).toBe(await stockQuantityFromMovements(product.id, warehouse.id));
    expect(await stockLevelQuantity(product.id, warehouse.id)).toBe("5.000");

    await voidInvoice({ tenantId: tenant.tenantId, invoiceId: issued.id, reason: "Mission 2 reversal evidence", createdBy: tenant.userId });
    expect(await stockLevelQuantity(product.id, warehouse.id)).toBe(await stockQuantityFromMovements(product.id, warehouse.id));
    expect(await stockLevelQuantity(product.id, warehouse.id)).toBe("8.000");

    const movements = await db.select().from(schema.stockMovements).where(eq(schema.stockMovements.productId, product.id));
    expect(movements.map((movement) => movement.reason)).toEqual(expect.arrayContaining(["PURCHASE", "ADJUSTMENT", "SALE"]));
    expect(movements.some((movement) => movement.sourceType === "invoice_void")).toBe(true);
  });

  it("rejects direct stock movement updates/deletes while allowing offsetting corrections", async () => {
    const tenant = await signupFinanceTenant("stock-mutable");
    const warehouse = await defaultWarehouse(tenant);
    const product = await createProduct(tenant, "stock-mutable");
    const po = await createPurchaseOrder(tenant, product.id, warehouse.id, "2", "10.00");
    await receiveTestPurchaseOrder(tenant, po, "goods-receipt-stock-mutable-1");
    const [movement] = await db.select().from(schema.stockMovements).where(eq(schema.stockMovements.productId, product.id));
    expect(movement).toBeTruthy();

    await expect(db.transaction((tx) =>
      tx.update(schema.stockMovements)
        .set({ quantityDelta: "99.000" })
        .where(eq(schema.stockMovements.id, movement.id))
        .returning())).rejects.toThrow(/Failed query/);

    await expect(db.transaction((tx) =>
      tx.delete(schema.stockMovements).where(eq(schema.stockMovements.id, movement.id))))
      .rejects.toThrow(/Failed query/);

    const [after] = await db.select().from(schema.stockMovements).where(eq(schema.stockMovements.id, movement.id));
    expect(after.quantityDelta).toBe(movement.quantityDelta);

    const correction = await db.transaction((tx) => adjustStock(tx, {
      tenantId: tenant.tenantId,
      productId: product.id,
      warehouseId: warehouse.id,
      quantityDelta: "-1",
      note: "Offsetting correction remains allowed",
      idempotencyKey: "stock-mutable-correction-1",
      createdBy: tenant.userId,
    }));
    expect(correction.movementId).toEqual(expect.any(String));
  });
});
