// ============================================================================
// INVENTORY CORE — append-only stock ledger.
// recordStockMovement() is the ONLY way stock changes anywhere in the platform.
// It (1) appends to stock_movements, (2) atomically updates the cached
// stock_levels row with a lock, (3) refuses to take tracked stock negative.
// Financially-significant movements (PO receipts, adjustments, sales) post to
// the GL via the journal engine in the SAME transaction — Inventory and
// Accounting can never disagree.
// ============================================================================
import { and, asc, eq, sql } from "drizzle-orm";
import {
  DB, schema, badRequest, conflict, toCents, fromCents, mulRate, audit, nextDocNumber,
  assertIdempotencyFingerprint, payloadFingerprint, requireIdempotencyKey,
} from "./lib.js";
import { postJournal, systemAccount } from "./accounting.js";

const QUANTITY_SCALE = 1_000n;
const MAX_VALUATION_CENTS = 99_999_999_999_999n;

type LockedStockLevel = { quantity_on_hand: string };
type LockedValuationLayer = {
  id: string;
  quantity_on_hand: string;
  total_cost_cents: string;
  version: string;
};

export function quantityToUnits(value: string): bigint {
  const exact = value.trim();
  if (!/^[+-]?\d+(?:\.\d{1,3})?$/.test(exact)) {
    throw badRequest("Stock quantity must use no more than 3 decimal places");
  }
  const negative = exact.startsWith("-");
  const unsigned = exact.replace(/^[+-]/, "");
  const [whole, fraction = ""] = unsigned.split(".");
  const units = BigInt(whole) * QUANTITY_SCALE + BigInt(fraction.padEnd(3, "0"));
  return negative ? -units : units;
}

export function unitsToQuantity(units: bigint): string {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  return `${negative ? "-" : ""}${absolute / QUANTITY_SCALE}.${(absolute % QUANTITY_SCALE).toString().padStart(3, "0")}`;
}

function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) throw badRequest("Valuation inputs must be non-negative");
  return (numerator + denominator / 2n) / denominator;
}

function unitCostFromAllocation(costCents: bigint, quantityUnits: bigint): string {
  if (quantityUnits <= 0n || costCents === 0n) return "0.00";
  return fromCents(roundHalfUp(costCents * QUANTITY_SCALE, quantityUnits));
}

async function lockStockLevel(tx: DB, productId: string, warehouseId: string): Promise<bigint> {
  await tx.execute(sql`
    INSERT INTO stock_levels (product_id, warehouse_id, quantity_on_hand)
    VALUES (${productId}, ${warehouseId}, 0)
    ON CONFLICT (product_id, warehouse_id) DO NOTHING
  `);
  const result = await tx.execute(sql`
    SELECT quantity_on_hand FROM stock_levels
    WHERE product_id = ${productId} AND warehouse_id = ${warehouseId}
    FOR UPDATE
  `) as unknown as { rows: LockedStockLevel[] };
  const row = result.rows[0];
  if (!row) throw conflict("Stock level could not be locked");
  return quantityToUnits(row.quantity_on_hand);
}

function replayMovementCost(
  quantityBefore: bigint,
  costBefore: bigint,
  delta: bigint,
  unitCost: string | null,
): bigint {
  if (delta > 0n) {
    if (unitCost === null) throw conflict("Historical stock receipt is missing base-cost evidence");
    return mulRate(toCents(unitCost), unitsToQuantity(delta));
  }
  const issueQuantity = -delta;
  if (quantityBefore <= 0n || issueQuantity > quantityBefore) {
    throw conflict("Historical stock movements would create negative inventory");
  }
  return issueQuantity === quantityBefore
    ? costBefore
    : roundHalfUp(costBefore * issueQuantity, quantityBefore);
}

/**
 * Builds a missing cache only from append-only canonical history. This is used
 * for safe rolling deployment and is never an automatic journal correction.
 */
export async function rebuildValuationLayerFromHistory(
  tx: DB,
  opts: { tenantId: string; productId: string; warehouseId: string },
) {
  const movements = await tx.select().from(schema.stockMovements).where(and(
    eq(schema.stockMovements.tenantId, opts.tenantId),
    eq(schema.stockMovements.productId, opts.productId),
    eq(schema.stockMovements.warehouseId, opts.warehouseId),
  )).orderBy(asc(schema.stockMovements.createdAt), asc(schema.stockMovements.id));
  const existingEvidence = await tx.select().from(schema.stockMovementValuations).where(and(
    eq(schema.stockMovementValuations.tenantId, opts.tenantId),
    eq(schema.stockMovementValuations.productId, opts.productId),
    eq(schema.stockMovementValuations.warehouseId, opts.warehouseId),
  ));
  const evidenceByMovement = new Map(existingEvidence.map((row) => [row.stockMovementId, row]));
  let quantity = 0n;
  let cost = 0n;
  for (const movement of movements) {
    const delta = quantityToUnits(movement.quantityDelta);
    const quantityAfter = quantity + delta;
    if (quantityAfter < 0n) throw conflict("Historical stock movements would create negative inventory");
    const storedEvidence = evidenceByMovement.get(movement.id);
    const movementCost = storedEvidence?.movementCostCents
      ?? replayMovementCost(quantity, cost, delta, movement.unitCost);
    const costAfter = delta > 0n ? cost + movementCost : cost - movementCost;
    if (costAfter < 0n || costAfter > MAX_VALUATION_CENTS || (quantityAfter === 0n && costAfter !== 0n)) {
      throw conflict("Historical stock valuation is inconsistent");
    }
    if (storedEvidence) {
      const matches = quantityToUnits(storedEvidence.quantityBefore) === quantity
        && quantityToUnits(storedEvidence.quantityAfter) === quantityAfter
        && storedEvidence.costBeforeCents === cost
        && storedEvidence.costAfterCents === costAfter;
      if (!matches) throw conflict("Immutable stock valuation evidence is inconsistent");
    } else {
      await tx.insert(schema.stockMovementValuations).values({
        tenantId: opts.tenantId,
        stockMovementId: movement.id,
        productId: opts.productId,
        warehouseId: opts.warehouseId,
        quantityBefore: unitsToQuantity(quantity),
        quantityAfter: unitsToQuantity(quantityAfter),
        costBeforeCents: cost,
        movementCostCents: movementCost,
        costAfterCents: costAfter,
      });
    }
    quantity = quantityAfter;
    cost = costAfter;
  }
  const [layer] = await tx.insert(schema.inventoryValuationLayers).values({
    tenantId: opts.tenantId,
    productId: opts.productId,
    warehouseId: opts.warehouseId,
    quantityOnHand: unitsToQuantity(quantity),
    totalCostCents: cost,
  }).onConflictDoNothing().returning();
  return layer ?? (await tx.select().from(schema.inventoryValuationLayers).where(and(
    eq(schema.inventoryValuationLayers.tenantId, opts.tenantId),
    eq(schema.inventoryValuationLayers.productId, opts.productId),
    eq(schema.inventoryValuationLayers.warehouseId, opts.warehouseId),
  )))[0];
}

async function lockValuationLayer(
  tx: DB,
  opts: { tenantId: string; productId: string; warehouseId: string },
): Promise<LockedValuationLayer> {
  const selectForUpdate = () => tx.execute(sql`
    SELECT id, quantity_on_hand, total_cost_cents, version
    FROM inventory_valuation_layers
    WHERE tenant_id = ${opts.tenantId}
      AND product_id = ${opts.productId}
      AND warehouse_id = ${opts.warehouseId}
    FOR UPDATE
  `) as unknown as { rows: LockedValuationLayer[] };
  let result = await selectForUpdate();
  if (!result.rows[0]) {
    await rebuildValuationLayerFromHistory(tx, opts);
    result = await selectForUpdate();
  }
  const layer = result.rows[0];
  if (!layer) throw conflict("Inventory valuation layer could not be locked");
  return layer;
}

export async function recordStockMovement(
  tx: DB,
  opts: {
    tenantId: string; productId: string; warehouseId: string;
    quantityDelta: string;         // "+5" in, "-3" out (decimal string)
    unitCost?: string;             // cost snapshot for COGS/valuation
    totalCostBaseCents?: bigint;    // authoritative receipt/restock total
    reason: "SALE" | "PURCHASE" | "ADJUSTMENT" | "TRANSFER_IN" | "TRANSFER_OUT" | "OPENING";
    sourceType?: string; sourceId?: string; idempotencyKey?: string; idempotencyFingerprint?: string; note?: string; createdBy?: string | null;
    allowNegative?: boolean;       // default false — protects against overselling
    requireZeroCurrent?: boolean;  // opening balances must not be layered onto existing stock
    requireNoHistory?: boolean;    // opening balances are invalid after any prior movement
  },
) {
  const deltaUnits = quantityToUnits(opts.quantityDelta);
  if (deltaUnits === 0n) throw badRequest("quantityDelta must be a non-zero number");
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

  // Every caller takes stock first, then valuation, establishing one lock order.
  const currentUnits = await lockStockLevel(tx, opts.productId, opts.warehouseId);
  const layer = await lockValuationLayer(tx, opts);
  const layerQuantity = quantityToUnits(layer.quantity_on_hand);
  const layerCost = BigInt(layer.total_cost_cents);
  if (currentUnits !== layerQuantity) {
    throw conflict("Inventory valuation layer is out of sync with the stock balance");
  }

  if (opts.idempotencyKey) {
    const [existingMovement] = await tx.select().from(schema.stockMovements).where(and(
      eq(schema.stockMovements.tenantId, opts.tenantId),
      eq(schema.stockMovements.idempotencyKey, opts.idempotencyKey),
    ));
    if (existingMovement) {
      if (opts.idempotencyFingerprint) {
        assertIdempotencyFingerprint(existingMovement.idempotencyFingerprint, opts.idempotencyFingerprint, "stock movement");
      }
      const sameMovement = existingMovement.productId === opts.productId
        && existingMovement.warehouseId === opts.warehouseId
        && quantityToUnits(existingMovement.quantityDelta) === deltaUnits
        && existingMovement.reason === opts.reason;
      if (!sameMovement) throw conflict("Idempotency key was already used with different stock movement details");
      const [valuation] = await tx.select().from(schema.stockMovementValuations).where(and(
        eq(schema.stockMovementValuations.tenantId, opts.tenantId),
        eq(schema.stockMovementValuations.stockMovementId, existingMovement.id),
      ));
      if (!valuation) throw conflict("Stock movement is missing immutable valuation evidence");
      return {
        movementId: existingMovement.id,
        quantityOnHand: Number(unitsToQuantity(currentUnits)),
        valuation: {
          id: valuation.id,
          movementCostCents: valuation.movementCostCents.toString(),
          averageUnitCost: unitCostFromAllocation(valuation.movementCostCents, deltaUnits < 0n ? -deltaUnits : deltaUnits),
        },
      };
    }
  }

  if (opts.requireZeroCurrent && currentUnits !== 0n) {
    throw conflict("Opening stock can only be recorded when current stock is zero");
  }
  if (opts.requireNoHistory) {
    const history = await tx.execute(sql`
      SELECT 1 FROM stock_movements
      WHERE product_id = ${opts.productId} AND warehouse_id = ${opts.warehouseId}
      LIMIT 1
    `) as unknown as { rows: Array<{ "?column?": number }> };
    if (history.rows.length) {
      throw conflict("Opening stock cannot be recorded after stock movement history exists");
    }
  }
  const nextUnits = currentUnits + deltaUnits;
  if (nextUnits < 0n && !opts.allowNegative) {
    throw conflict(`Insufficient stock: on hand ${unitsToQuantity(currentUnits)}, requested ${unitsToQuantity(-deltaUnits)}`);
  }
  if (nextUnits < 0n) throw conflict("Inventory valuation cannot be negative");

  let movementCostCents: bigint;
  let costAfter: bigint;
  let unitCostSnapshot: string;
  if (deltaUnits > 0n) {
    if (opts.totalCostBaseCents === undefined && opts.unitCost === undefined) {
      throw badRequest("A base-currency cost is required for stock received");
    }
    movementCostCents = opts.totalCostBaseCents
      ?? mulRate(toCents(opts.unitCost ?? "0"), unitsToQuantity(deltaUnits));
    if (movementCostCents < 0n) throw badRequest("Stock receipt cost must be non-negative");
    unitCostSnapshot = opts.unitCost ?? unitCostFromAllocation(movementCostCents, deltaUnits);
    costAfter = layerCost + movementCostCents;
  } else {
    const issueUnits = -deltaUnits;
    if (currentUnits <= 0n || issueUnits > currentUnits) {
      throw conflict(`Insufficient stock: on hand ${unitsToQuantity(currentUnits)}, requested ${unitsToQuantity(issueUnits)}`);
    }
    movementCostCents = issueUnits === currentUnits
      ? layerCost
      : roundHalfUp(layerCost * issueUnits, currentUnits);
    unitCostSnapshot = unitCostFromAllocation(movementCostCents, issueUnits);
    costAfter = layerCost - movementCostCents;
  }
  if (costAfter < 0n || costAfter > MAX_VALUATION_CENTS || (nextUnits === 0n && costAfter !== 0n)) {
    throw conflict("Inventory valuation exceeds the supported range or is inconsistent");
  }

  await tx.execute(sql`
    UPDATE stock_levels SET quantity_on_hand = ${unitsToQuantity(nextUnits)}
    WHERE product_id = ${opts.productId} AND warehouse_id = ${opts.warehouseId}
  `);
  const [movement] = await tx.insert(schema.stockMovements).values({
    tenantId: opts.tenantId, productId: opts.productId, warehouseId: opts.warehouseId,
    quantityDelta: unitsToQuantity(deltaUnits), unitCost: unitCostSnapshot,
    reason: opts.reason, sourceType: opts.sourceType ?? null, sourceId: opts.sourceId ?? null,
    idempotencyKey: opts.idempotencyKey ?? null,
    idempotencyFingerprint: opts.idempotencyFingerprint ?? null,
    note: opts.note ?? null, createdBy: opts.createdBy ?? null,
  }).returning({ id: schema.stockMovements.id });
  const [valuation] = await tx.insert(schema.stockMovementValuations).values({
    tenantId: opts.tenantId,
    stockMovementId: movement.id,
    productId: opts.productId,
    warehouseId: opts.warehouseId,
    quantityBefore: unitsToQuantity(currentUnits),
    quantityAfter: unitsToQuantity(nextUnits),
    costBeforeCents: layerCost,
    movementCostCents,
    costAfterCents: costAfter,
  }).returning({ id: schema.stockMovementValuations.id });
  await tx.update(schema.inventoryValuationLayers).set({
    quantityOnHand: unitsToQuantity(nextUnits),
    totalCostCents: costAfter,
    version: BigInt(layer.version) + 1n,
    updatedAt: new Date(),
  }).where(and(
    eq(schema.inventoryValuationLayers.id, layer.id),
    eq(schema.inventoryValuationLayers.tenantId, opts.tenantId),
  ));
  return {
    movementId: movement.id,
    quantityOnHand: Number(unitsToQuantity(nextUnits)),
    valuation: {
      id: valuation.id,
      movementCostCents: movementCostCents.toString(),
      averageUnitCost: unitCostFromAllocation(movementCostCents, deltaUnits < 0n ? -deltaUnits : deltaUnits),
    },
  };
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
  const value = fromCents(BigInt(movement.valuation.movementCostCents));
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

  // GL sync uses the same immutable weighted-average allocation as stock.
  const valueCents = BigInt(res.valuation.movementCostCents);
  let journalEntryId: string | null = null;
  if (valueCents > 0n) {
    const inventory = await systemAccount(tx, opts.tenantId, "INVENTORY");
    const [expense] = await tx.select().from(schema.accounts).where(and(
      eq(schema.accounts.tenantId, opts.tenantId), eq(schema.accounts.code, "6900")));
    const value = fromCents(valueCents);
    const down = Number(opts.quantityDelta) < 0;
    journalEntryId = await postJournal(tx, {
      tenantId: opts.tenantId, date: new Date(),
      memo: `Stock adjustment — ${product.name}: ${opts.note}`,
      sourceType: "stock_adjustment", sourceId: res.movementId, createdBy: opts.createdBy,
      lines: down
        ? [{ accountId: expense.id, debit: value }, { accountId: inventory.id, credit: value }]
        : [{ accountId: inventory.id, debit: value }, { accountId: expense.id, credit: value }],
    });
  }
  await audit(tx, opts.tenantId, opts.createdBy ?? null, "stock.adjusted", "product", opts.productId,
    {
      delta: opts.quantityDelta,
      note: opts.note,
      movementId: res.movementId,
      valuationId: res.valuation.id,
      movementCostCents: res.valuation.movementCostCents,
      journalEntryId,
    });
  return { ...res, journalEntryId };
}
