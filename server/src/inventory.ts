// ============================================================================
// INVENTORY CORE — append-only stock ledger.
// recordStockMovement() is the ONLY way stock changes anywhere in the platform.
// It (1) appends to stock_movements, (2) atomically updates the cached
// stock_levels row with a lock, (3) refuses to take tracked stock negative.
// Financially-significant movements (PO receipts, adjustments, sales) post to
// the GL via the journal engine in the SAME transaction — Inventory and
// Accounting can never disagree.
// ============================================================================
import { and, eq, sql } from "drizzle-orm";
import {
  DB, schema, badRequest, conflict, toCents, fromCents, mulRate, audit, nextDocNumber,
  assertIdempotencyFingerprint, payloadFingerprint, requireIdempotencyKey,
} from "./lib.js";
import { postJournal, systemAccount } from "./accounting.js";

export async function recordStockMovement(
  tx: DB,
  opts: {
    tenantId: string; productId: string; warehouseId: string;
    quantityDelta: string;         // "+5" in, "-3" out (decimal string)
    unitCost?: string;             // cost snapshot for COGS/valuation
    reason: "SALE" | "PURCHASE" | "ADJUSTMENT" | "TRANSFER_IN" | "TRANSFER_OUT" | "OPENING";
    sourceType?: string; sourceId?: string; idempotencyKey?: string; idempotencyFingerprint?: string; note?: string; createdBy?: string | null;
    allowNegative?: boolean;       // default false — protects against overselling
    requireZeroCurrent?: boolean;  // opening balances must not be layered onto existing stock
    requireNoHistory?: boolean;    // opening balances are invalid after any prior movement
  },
) {
  const delta = Number(opts.quantityDelta);
  if (!isFinite(delta) || delta === 0) throw badRequest("quantityDelta must be a non-zero number");
  if (opts.idempotencyKey) {
    const [existingMovement] = await tx.select().from(schema.stockMovements).where(and(
      eq(schema.stockMovements.tenantId, opts.tenantId),
      eq(schema.stockMovements.idempotencyKey, opts.idempotencyKey),
    ));
    if (existingMovement) {
      if (opts.idempotencyFingerprint) {
        assertIdempotencyFingerprint(existingMovement.idempotencyFingerprint, opts.idempotencyFingerprint, "stock adjustment");
      }
      const [level] = await tx.select().from(schema.stockLevels).where(and(
        eq(schema.stockLevels.productId, existingMovement.productId),
        eq(schema.stockLevels.warehouseId, existingMovement.warehouseId),
      ));
      return { movementId: existingMovement.id, quantityOnHand: Number(level?.quantityOnHand ?? 0) };
    }
  }
  const [product] = await tx.select({
    id: schema.products.id,
    trackStock: schema.products.trackStock,
  }).from(schema.products).where(and(
    eq(schema.products.id, opts.productId),
    eq(schema.products.tenantId, opts.tenantId),
  ));
  const [warehouse] = await tx.select({ id: schema.warehouses.id })
    .from(schema.warehouses).where(and(
      eq(schema.warehouses.id, opts.warehouseId),
      eq(schema.warehouses.tenantId, opts.tenantId),
    ));
  if (!product || !warehouse) throw badRequest("Product or warehouse not found");
  if (!product.trackStock) throw badRequest("Stock movements cannot be recorded for a non-stock service");

  // Upsert + lock the cached level row, then apply delta atomically.
  await tx.execute(sql`
    INSERT INTO stock_levels (product_id, warehouse_id, quantity_on_hand)
    VALUES (${opts.productId}, ${opts.warehouseId}, 0)
    ON CONFLICT (product_id, warehouse_id) DO NOTHING
  `);
  const locked = await tx.execute(sql`
    SELECT quantity_on_hand FROM stock_levels
    WHERE product_id = ${opts.productId} AND warehouse_id = ${opts.warehouseId}
    FOR UPDATE
  `);
  const current = Number((locked as any).rows[0].quantity_on_hand);
  if (opts.requireZeroCurrent && current !== 0) {
    throw conflict("Opening stock can only be recorded when current stock is zero");
  }
  if (opts.requireNoHistory) {
    const history = await tx.execute(sql`
      SELECT 1 FROM stock_movements
      WHERE product_id = ${opts.productId} AND warehouse_id = ${opts.warehouseId}
      LIMIT 1
    `);
    if ((history as any).rows.length) {
      throw conflict("Opening stock cannot be recorded after stock movement history exists");
    }
  }
  const next = current + delta;
  if (next < 0 && !opts.allowNegative) {
    throw conflict(`Insufficient stock: on hand ${current}, requested ${Math.abs(delta)}`);
  }
  await tx.execute(sql`
    UPDATE stock_levels SET quantity_on_hand = ${next}
    WHERE product_id = ${opts.productId} AND warehouse_id = ${opts.warehouseId}
  `);
  const [movement] = await tx.insert(schema.stockMovements).values({
    tenantId: opts.tenantId, productId: opts.productId, warehouseId: opts.warehouseId,
    quantityDelta: opts.quantityDelta, unitCost: opts.unitCost ?? null,
    reason: opts.reason, sourceType: opts.sourceType ?? null, sourceId: opts.sourceId ?? null,
    idempotencyKey: opts.idempotencyKey ?? null,
    idempotencyFingerprint: opts.idempotencyFingerprint ?? null,
    note: opts.note ?? null, createdBy: opts.createdBy ?? null,
  }).returning({ id: schema.stockMovements.id });
  return { movementId: movement.id, quantityOnHand: next };
}

export async function recordOpeningStock(
  tx: DB,
  opts: {
    tenantId: string; productId: string; warehouseId: string;
    quantity: string; unitCost: string; createdBy: string;
    sourceType?: string; sourceId?: string;
  },
) {
  const movement = await recordStockMovement(tx, {
    tenantId: opts.tenantId,
    productId: opts.productId,
    warehouseId: opts.warehouseId,
    quantityDelta: opts.quantity,
    unitCost: opts.unitCost,
    reason: "OPENING",
    sourceType: opts.sourceType ?? "manual",
    sourceId: opts.sourceId,
    createdBy: opts.createdBy,
    requireZeroCurrent: true,
    requireNoHistory: true,
  });
  const value = fromCents(mulRate(toCents(opts.unitCost), Number(opts.quantity).toFixed(6)));
  const inventory = await systemAccount(tx, opts.tenantId, "INVENTORY");
  const opening = await systemAccount(tx, opts.tenantId, "OPENING_EQUITY");
  const journalEntryId = await postJournal(tx, {
    tenantId: opts.tenantId,
    date: new Date(),
    memo: "Opening stock balance",
    sourceType: "stock_adjustment",
    sourceId: movement.movementId,
    createdBy: opts.createdBy,
    lines: [
      { accountId: inventory.id, debit: value },
      { accountId: opening.id, credit: value },
    ],
  });
  await audit(tx, opts.tenantId, opts.createdBy, "stock.opening_recorded", "stock_movement", movement.movementId, {
    productId: opts.productId,
    warehouseId: opts.warehouseId,
    quantity: opts.quantity,
    unitCost: opts.unitCost,
    inventoryValue: value,
    journalEntryId,
  });
  return { ...movement, journalEntryId, inventoryValue: value };
}

/**
 * Manual stock adjustment (count correction, damage, shrinkage) with GL sync:
 * write-down => Dr General Expenses / Cr Inventory; write-up => reverse.
 */
export async function adjustStock(
  tx: DB,
  opts: {
    tenantId: string; productId: string; warehouseId: string;
    quantityDelta: string; note: string; idempotencyKey: string; createdBy?: string | null;
  },
) {
  const idempotencyKey = requireIdempotencyKey(opts.idempotencyKey);
  const fingerprint = payloadFingerprint({
    action: "stock_adjustment",
    productId: opts.productId,
    warehouseId: opts.warehouseId,
    quantityDelta: opts.quantityDelta,
    note: opts.note,
  });
  const [existingMovement] = await tx.select().from(schema.stockMovements).where(and(
    eq(schema.stockMovements.tenantId, opts.tenantId),
    eq(schema.stockMovements.idempotencyKey, idempotencyKey),
  ));
  if (existingMovement) {
    assertIdempotencyFingerprint(existingMovement.idempotencyFingerprint, fingerprint, "stock adjustment");
    const [level] = await tx.select().from(schema.stockLevels).where(and(
      eq(schema.stockLevels.productId, existingMovement.productId),
      eq(schema.stockLevels.warehouseId, existingMovement.warehouseId),
    ));
    return { movementId: existingMovement.id, quantityOnHand: Number(level?.quantityOnHand ?? 0) };
  }

  const [product] = await tx.select().from(schema.products).where(and(
    eq(schema.products.id, opts.productId), eq(schema.products.tenantId, opts.tenantId)));
  if (!product) throw badRequest("Product not found");
  if (!opts.note?.trim()) throw badRequest("A reason/note is mandatory for stock adjustments");

  const res = await recordStockMovement(tx, {
    ...opts, unitCost: product.costPrice, reason: "ADJUSTMENT",
    sourceType: "manual", idempotencyKey, idempotencyFingerprint: fingerprint, allowNegative: false,
  });

  // GL sync at cost, if the product carries a cost
  const valueCents = mulRate(toCents(product.costPrice), Math.abs(Number(opts.quantityDelta)).toFixed(6));
  if (valueCents > 0n) {
    const inventory = await systemAccount(tx, opts.tenantId, "INVENTORY");
    const [expense] = await tx.select().from(schema.accounts).where(and(
      eq(schema.accounts.tenantId, opts.tenantId), eq(schema.accounts.code, "6900")));
    const value = fromCents(valueCents);
    const down = Number(opts.quantityDelta) < 0;
    await postJournal(tx, {
      tenantId: opts.tenantId, date: new Date(),
      memo: `Stock adjustment — ${product.name}: ${opts.note}`,
      sourceType: "stock_adjustment", sourceId: res.movementId, createdBy: opts.createdBy,
      lines: down
        ? [{ accountId: expense.id, debit: value }, { accountId: inventory.id, credit: value }]
        : [{ accountId: inventory.id, debit: value }, { accountId: expense.id, credit: value }],
    });
  }
  await audit(tx, opts.tenantId, opts.createdBy ?? null, "stock.adjusted", "product", opts.productId,
    { delta: opts.quantityDelta, note: opts.note });
  return res;
}

/**
 * Receive a purchase order: stock in per line + GL posting
 * Dr Inventory (goods value) / Dr VAT Input / Cr Accounts Payable — one entry,
 * one transaction, so stock and ledger always agree.
 */
export async function receivePurchaseOrder(
  tx: DB,
  opts: {
    tenantId: string; purchaseOrderId: string; createdBy?: string | null;
    onMovement?: (movement: { movementId: string; productId: string; warehouseId: string; quantityDelta: string; kind: string }) => void;
  },
) {
  const [po] = await tx.select().from(schema.purchaseOrders).where(and(
    eq(schema.purchaseOrders.id, opts.purchaseOrderId),
    eq(schema.purchaseOrders.tenantId, opts.tenantId)));
  if (!po) throw badRequest("Purchase order not found");
  if (po.status === "RECEIVED") throw conflict("Purchase order already received");
  if (po.status === "CANCELLED") throw conflict("Purchase order is cancelled");

  const lines = await tx.select().from(schema.purchaseOrderLineItems)
    .where(eq(schema.purchaseOrderLineItems.purchaseOrderId, po.id));
  if (!lines.length) throw badRequest("Purchase order has no line items");

  let goodsBase = 0n;
  for (const line of lines) {
    const movement = await recordStockMovement(tx, {
      tenantId: opts.tenantId, productId: line.productId, warehouseId: line.warehouseId,
      quantityDelta: line.quantity, unitCost: line.unitCost,
      reason: "PURCHASE", sourceType: "purchase_order", sourceId: po.id,
      createdBy: opts.createdBy,
    });
    opts.onMovement?.({
      movementId: movement.movementId, productId: line.productId,
      warehouseId: line.warehouseId, quantityDelta: line.quantity, kind: "PURCHASE",
    });
    // update product cost snapshot to latest purchase cost (simple costing; FIFO layer is a Phase 2 enhancement)
    await tx.update(schema.products).set({ costPrice: line.unitCost })
      .where(eq(schema.products.id, line.productId));
    goodsBase += mulRate(toCents(line.lineTotal), po.rateToBase);
  }

  const inventory = await systemAccount(tx, opts.tenantId, "INVENTORY");
  const ap = await systemAccount(tx, opts.tenantId, "AP");
  await postJournal(tx, {
    tenantId: opts.tenantId, date: new Date(),
    memo: `Goods received — PO ${po.number ?? po.id.slice(0, 8)}`,
    sourceType: "po_receipt", sourceId: po.id, createdBy: opts.createdBy,
    lines: [
      { accountId: inventory.id, debit: fromCents(goodsBase), originalAmount: fromCents(goodsBase), originalCurrency: po.currency, exchangeRate: po.rateToBase },
      { accountId: ap.id, credit: fromCents(goodsBase) },
    ],
  });

  await tx.update(schema.purchaseOrders)
    .set({ status: "RECEIVED", receivedAt: new Date() })
    .where(eq(schema.purchaseOrders.id, po.id));
  await audit(tx, opts.tenantId, opts.createdBy ?? null, "po.received", "purchase_order", po.id);
  return { received: lines.length };
}
