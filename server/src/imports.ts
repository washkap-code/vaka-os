import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { audit, badRequest, conflict, db, fromCents, mulRate, schema, toCents } from "./lib.js";
import { postJournal, systemAccount } from "./accounting.js";
import { recordStockMovement } from "./inventory.js";

const MAX_CSV_BYTES = 1_000_000;
const MAX_ROWS = 5_000;
const MAX_COLUMNS = 50;
const MAX_MONEY_CENTS = 99_999_999_999_999n;

type ContactImportData = {
  type: "INDIVIDUAL" | "COMPANY";
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxNumber: string | null;
  tags: string[];
  isCustomer: boolean;
  isVendor: boolean;
};

type ProductImportData = {
  sku: string;
  name: string;
  description: string | null;
  unitOfMeasure: string;
  costPrice: string;
  salePrice: string;
  currency: "USD" | "ZWG";
  taxRate: string;
  reorderLevel: number;
  trackStock: boolean;
  isActive: boolean;
};

type OpeningStockImportData = {
  sku: string;
  warehouse: string;
  quantity: string;
  unitCost: string;
  productId: string;
  warehouseId: string;
};

const headerAliases: Record<string, keyof ContactImportData> = {
  type: "type",
  contact_type: "type",
  name: "name",
  company: "name",
  company_name: "name",
  email: "email",
  email_address: "email",
  phone: "phone",
  telephone: "phone",
  mobile: "phone",
  address: "address",
  physical_address: "address",
  tax_number: "taxNumber",
  tax_id: "taxNumber",
  tags: "tags",
  is_customer: "isCustomer",
  customer: "isCustomer",
  is_vendor: "isVendor",
  supplier: "isVendor",
};

const productHeaderAliases: Record<string, keyof ProductImportData> = {
  sku: "sku",
  product_code: "sku",
  item_code: "sku",
  name: "name",
  product_name: "name",
  item_name: "name",
  description: "description",
  unit: "unitOfMeasure",
  unit_of_measure: "unitOfMeasure",
  uom: "unitOfMeasure",
  cost: "costPrice",
  cost_price: "costPrice",
  purchase_price: "costPrice",
  price: "salePrice",
  sale_price: "salePrice",
  selling_price: "salePrice",
  currency: "currency",
  tax_rate: "taxRate",
  vat_rate: "taxRate",
  reorder_level: "reorderLevel",
  minimum_stock: "reorderLevel",
  track_stock: "trackStock",
  is_active: "isActive",
  active: "isActive",
};

const openingStockHeaderAliases: Record<string, "sku" | "warehouse" | "quantity" | "unitCost"> = {
  sku: "sku",
  product_code: "sku",
  item_code: "sku",
  warehouse: "warehouse",
  warehouse_name: "warehouse",
  location: "warehouse",
  quantity: "quantity",
  quantity_on_hand: "quantity",
  opening_quantity: "quantity",
  unit_cost: "unitCost",
  cost: "unitCost",
  cost_price: "unitCost",
};

function safeText(value: string, field: string, max: number): string | null {
  const clean = value.trim();
  if (!clean) return null;
  if (clean.length > max) throw new Error(`${field} exceeds ${max} characters`);
  if (/^[=@]/.test(clean)) throw new Error(`${field} begins with an unsafe spreadsheet formula character`);
  return clean;
}

function parseBoolean(value: string, defaultValue: boolean): boolean {
  const clean = value.trim().toLowerCase();
  if (!clean) return defaultValue;
  if (["true", "yes", "y", "1"].includes(clean)) return true;
  if (["false", "no", "n", "0"].includes(clean)) return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

function parseMoney(value: string, field: string): string {
  const clean = value.trim() || "0";
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(clean)) {
    throw new Error(`${field} must be a non-negative amount with no more than 2 decimal places`);
  }
  return Number(clean).toFixed(2);
}

function parseRate(value: string): string {
  const clean = value.trim() || "15";
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(clean) || Number(clean) > 100) {
    throw new Error("Tax rate must be between 0 and 100 with no more than 2 decimal places");
  }
  return Number(clean).toFixed(2);
}

function parseQuantity(value: string): string {
  const clean = value.trim();
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(clean) || Number(clean) <= 0) {
    throw new Error("Quantity must be greater than zero with no more than 3 decimal places");
  }
  return Number(clean).toFixed(3);
}

function parseCsv(csvText: string): string[][] {
  if (Buffer.byteLength(csvText, "utf8") > MAX_CSV_BYTES) {
    throw badRequest("CSV file exceeds the 1 MB limit");
  }
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < csvText.length; index++) {
    const char = csvText[index];
    if (quoted) {
      if (char === '"' && csvText[index + 1] === '"') {
        value += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
      continue;
    }
    if (char === '"') {
      if (value.length) throw badRequest("Malformed CSV quote");
      quoted = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value.replace(/\r$/, ""));
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  if (quoted) throw badRequest("CSV contains an unclosed quoted value");
  row.push(value.replace(/\r$/, ""));
  if (row.some((cell) => cell.trim())) rows.push(row);
  if (rows.length < 2) throw badRequest("CSV must include a header and at least one data row");
  if (rows.length - 1 > MAX_ROWS) throw badRequest(`CSV exceeds the ${MAX_ROWS} row limit`);
  if (Math.max(...rows.map((entry) => entry.length)) > MAX_COLUMNS) {
    throw badRequest(`CSV exceeds the ${MAX_COLUMNS} column limit`);
  }
  return rows;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function parseContactRow(headers: Array<keyof ContactImportData | null>, cells: string[]): ContactImportData {
  const source = new Map<keyof ContactImportData, string>();
  headers.forEach((header, index) => {
    if (header) source.set(header, cells[index] ?? "");
  });
  const name = safeText(source.get("name") ?? "", "Name", 200);
  if (!name) throw new Error("Name is required");
  const email = safeText(source.get("email") ?? "", "Email", 320);
  if (email) z.string().email().parse(email);
  const typeValue = (source.get("type") ?? "COMPANY").trim().toUpperCase();
  if (!["INDIVIDUAL", "COMPANY"].includes(typeValue)) {
    throw new Error("Type must be INDIVIDUAL or COMPANY");
  }
  return {
    type: typeValue as ContactImportData["type"],
    name,
    email: email?.toLowerCase() ?? null,
    phone: safeText(source.get("phone") ?? "", "Phone", 100),
    address: safeText(source.get("address") ?? "", "Address", 500),
    taxNumber: safeText(source.get("taxNumber") ?? "", "Tax number", 100),
    tags: (source.get("tags") ?? "").split(";").map((tag) => tag.trim()).filter(Boolean).slice(0, 20),
    isCustomer: parseBoolean(source.get("isCustomer") ?? "", true),
    isVendor: parseBoolean(source.get("isVendor") ?? "", false),
  };
}

function parseProductRow(headers: Array<keyof ProductImportData | null>, cells: string[]): ProductImportData {
  const source = new Map<keyof ProductImportData, string>();
  headers.forEach((header, index) => {
    if (header) source.set(header, cells[index] ?? "");
  });
  const sku = safeText(source.get("sku") ?? "", "SKU", 100);
  if (!sku) throw new Error("SKU is required");
  const name = safeText(source.get("name") ?? "", "Name", 200);
  if (!name) throw new Error("Name is required");
  const currency = (source.get("currency") ?? "USD").trim().toUpperCase();
  if (!["USD", "ZWG"].includes(currency)) throw new Error("Currency must be USD or ZWG");
  const reorder = (source.get("reorderLevel") ?? "0").trim() || "0";
  if (!/^\d{1,9}$/.test(reorder)) throw new Error("Reorder level must be a non-negative whole number");
  return {
    sku,
    name,
    description: safeText(source.get("description") ?? "", "Description", 1_000),
    unitOfMeasure: safeText(source.get("unitOfMeasure") ?? "", "Unit of measure", 50) ?? "unit",
    costPrice: parseMoney(source.get("costPrice") ?? "", "Cost price"),
    salePrice: parseMoney(source.get("salePrice") ?? "", "Sale price"),
    currency: currency as ProductImportData["currency"],
    taxRate: parseRate(source.get("taxRate") ?? ""),
    reorderLevel: Number(reorder),
    trackStock: parseBoolean(source.get("trackStock") ?? "", true),
    isActive: parseBoolean(source.get("isActive") ?? "", true),
  };
}

function parseOpeningStockRow(
  headers: Array<"sku" | "warehouse" | "quantity" | "unitCost" | null>,
  cells: string[],
  products: Map<string, { id: string; currency: "USD" | "ZWG"; trackStock: boolean }>,
  warehouses: Map<string, string>,
  baseCurrency: "USD" | "ZWG",
): OpeningStockImportData {
  const source = new Map<"sku" | "warehouse" | "quantity" | "unitCost", string>();
  headers.forEach((header, index) => {
    if (header) source.set(header, cells[index] ?? "");
  });
  const sku = safeText(source.get("sku") ?? "", "SKU", 100);
  if (!sku) throw new Error("SKU is required");
  const warehouse = safeText(source.get("warehouse") ?? "", "Warehouse", 200);
  if (!warehouse) throw new Error("Warehouse is required");
  const product = products.get(sku.toLowerCase());
  if (!product) throw new Error("Product SKU was not found in this workspace");
  if (!product.trackStock) throw new Error("Opening stock cannot be added to a non-stock service");
  if (product.currency !== baseCurrency) {
    throw new Error(`Product currency must match workspace base currency ${baseCurrency}`);
  }
  const warehouseId = warehouses.get(warehouse.toLowerCase());
  if (!warehouseId) throw new Error("Warehouse was not found in this workspace");
  const unitCost = parseMoney(source.get("unitCost") ?? "", "Unit cost");
  if (toCents(unitCost) <= 0n) throw new Error("Unit cost must be greater than zero");
  const quantity = parseQuantity(source.get("quantity") ?? "");
  if (mulRate(toCents(unitCost), quantity) > MAX_MONEY_CENTS) {
    throw new Error("Opening stock row value exceeds the supported financial limit");
  }
  return {
    sku,
    warehouse,
    quantity,
    unitCost,
    productId: product.id,
    warehouseId,
  };
}

export async function previewContactImport(opts: {
  tenantId: string;
  actorUserId: string;
  csvText: string;
}) {
  const csvRows = parseCsv(opts.csvText.replace(/^\uFEFF/, ""));
  const rawHeaders = csvRows[0].map(normalizeHeader);
  const headers = rawHeaders.map((header) => headerAliases[header] ?? null);
  if (!headers.includes("name")) throw badRequest("CSV must include a name or company_name column");
  const existing = await db.select({
    name: schema.contacts.name,
    email: schema.contacts.email,
  }).from(schema.contacts).where(eq(schema.contacts.tenantId, opts.tenantId));
  const duplicateKeys = new Set(existing.flatMap((contact) => [
    `name:${contact.name.trim().toLowerCase()}`,
    ...(contact.email ? [`email:${contact.email.trim().toLowerCase()}`] : []),
  ]));

  const staged = csvRows.slice(1).map((cells, index) => {
    try {
      const data = parseContactRow(headers, cells);
      const keys = [
        `name:${data.name.toLowerCase()}`,
        ...(data.email ? [`email:${data.email}`] : []),
      ];
      const duplicate = keys.some((key) => duplicateKeys.has(key));
      keys.forEach((key) => duplicateKeys.add(key));
      return {
        rowNumber: index + 2,
        data,
        status: duplicate ? "DUPLICATE" : "VALID",
        error: duplicate ? "Possible duplicate name or email" : null,
      };
    } catch (error: unknown) {
      return {
        rowNumber: index + 2,
        data: { source: cells },
        status: "INVALID",
        error: error instanceof Error ? error.message : "Invalid row",
      };
    }
  });
  const summary = {
    totalRows: staged.length,
    validRows: staged.filter((row) => row.status === "VALID").length,
    invalidRows: staged.filter((row) => row.status === "INVALID").length,
    duplicateRows: staged.filter((row) => row.status === "DUPLICATE").length,
  };

  return db.transaction(async (tx) => {
    const [batch] = await tx.insert(schema.importBatches).values({
      tenantId: opts.tenantId,
      entityType: "contacts",
      status: "PREVIEW",
      ...summary,
      createdBy: opts.actorUserId,
    }).returning();
    await tx.insert(schema.importRows).values(staged.map((row) => ({
      batchId: batch.id,
      ...row,
    })));
    await audit(tx, opts.tenantId, opts.actorUserId,
      "contacts.import_previewed", "import_batch", batch.id, summary);
    return { batch, rows: staged.slice(0, 100) };
  });
}

export async function commitContactImport(opts: {
  tenantId: string;
  actorUserId: string;
  batchId: string;
}) {
  return db.transaction(async (tx) => {
    const [claimed] = await tx.update(schema.importBatches).set({ status: "PROCESSING" }).where(and(
      eq(schema.importBatches.id, opts.batchId),
      eq(schema.importBatches.tenantId, opts.tenantId),
      eq(schema.importBatches.entityType, "contacts"),
      eq(schema.importBatches.status, "PREVIEW"),
    )).returning();
    if (!claimed) throw conflict("Import batch is unavailable or already processed");

    const rows = await tx.select().from(schema.importRows).where(and(
      eq(schema.importRows.batchId, claimed.id),
      eq(schema.importRows.status, "VALID"),
    )).orderBy(schema.importRows.rowNumber);
    const values = rows.map((row) => ({
      ...(row.data as ContactImportData),
      tenantId: opts.tenantId,
      ownerUserId: opts.actorUserId,
    }));
    const created = values.length
      ? await tx.insert(schema.contacts).values(values).returning({ id: schema.contacts.id })
      : [];
    for (let index = 0; index < rows.length; index++) {
      await tx.update(schema.importRows).set({
        status: "IMPORTED",
        createdRecordId: created[index].id,
      }).where(eq(schema.importRows.id, rows[index].id));
    }
    const [completed] = await tx.update(schema.importBatches).set({
      status: "COMPLETED",
      completedAt: new Date(),
    }).where(eq(schema.importBatches.id, claimed.id)).returning();
    await audit(tx, opts.tenantId, opts.actorUserId,
      "contacts.import_completed", "import_batch", claimed.id, {
        importedRows: created.length,
        skippedRows: claimed.invalidRows + claimed.duplicateRows,
      });
    return { batch: completed, importedRows: created.length };
  });
}

export async function previewProductImport(opts: {
  tenantId: string;
  actorUserId: string;
  csvText: string;
}) {
  const csvRows = parseCsv(opts.csvText.replace(/^\uFEFF/, ""));
  const rawHeaders = csvRows[0].map(normalizeHeader);
  const headers = rawHeaders.map((header) => productHeaderAliases[header] ?? null);
  if (!headers.includes("sku") || !headers.includes("name")) {
    throw badRequest("CSV must include sku and name columns");
  }
  const existing = await db.select({ sku: schema.products.sku })
    .from(schema.products).where(eq(schema.products.tenantId, opts.tenantId));
  const duplicateSkus = new Set(existing.map((product) => product.sku.trim().toLowerCase()));
  const staged = csvRows.slice(1).map((cells, index) => {
    try {
      const data = parseProductRow(headers, cells);
      const key = data.sku.toLowerCase();
      const duplicate = duplicateSkus.has(key);
      duplicateSkus.add(key);
      return {
        rowNumber: index + 2,
        data,
        status: duplicate ? "DUPLICATE" : "VALID",
        error: duplicate ? "Possible duplicate SKU" : null,
      };
    } catch (error: unknown) {
      return {
        rowNumber: index + 2,
        data: { source: cells },
        status: "INVALID",
        error: error instanceof Error ? error.message : "Invalid row",
      };
    }
  });
  const summary = {
    totalRows: staged.length,
    validRows: staged.filter((row) => row.status === "VALID").length,
    invalidRows: staged.filter((row) => row.status === "INVALID").length,
    duplicateRows: staged.filter((row) => row.status === "DUPLICATE").length,
  };
  return db.transaction(async (tx) => {
    const [batch] = await tx.insert(schema.importBatches).values({
      tenantId: opts.tenantId,
      entityType: "products",
      status: "PREVIEW",
      ...summary,
      createdBy: opts.actorUserId,
    }).returning();
    await tx.insert(schema.importRows).values(staged.map((row) => ({
      batchId: batch.id,
      ...row,
    })));
    await audit(tx, opts.tenantId, opts.actorUserId,
      "products.import_previewed", "import_batch", batch.id, summary);
    return { batch, rows: staged.slice(0, 100) };
  });
}

export async function commitProductImport(opts: {
  tenantId: string;
  actorUserId: string;
  batchId: string;
}) {
  return db.transaction(async (tx) => {
    const [claimed] = await tx.update(schema.importBatches).set({ status: "PROCESSING" }).where(and(
      eq(schema.importBatches.id, opts.batchId),
      eq(schema.importBatches.tenantId, opts.tenantId),
      eq(schema.importBatches.entityType, "products"),
      eq(schema.importBatches.status, "PREVIEW"),
    )).returning();
    if (!claimed) throw conflict("Import batch is unavailable or already processed");
    const rows = await tx.select().from(schema.importRows).where(and(
      eq(schema.importRows.batchId, claimed.id),
      eq(schema.importRows.status, "VALID"),
    )).orderBy(schema.importRows.rowNumber);
    const values = rows.map((row) => ({
      ...(row.data as ProductImportData),
      tenantId: opts.tenantId,
    }));
    const created = values.length
      ? await tx.insert(schema.products).values(values).returning({ id: schema.products.id })
      : [];
    for (let index = 0; index < rows.length; index++) {
      await tx.update(schema.importRows).set({
        status: "IMPORTED",
        createdRecordId: created[index].id,
      }).where(eq(schema.importRows.id, rows[index].id));
    }
    const [completed] = await tx.update(schema.importBatches).set({
      status: "COMPLETED",
      completedAt: new Date(),
    }).where(eq(schema.importBatches.id, claimed.id)).returning();
    await audit(tx, opts.tenantId, opts.actorUserId,
      "products.import_completed", "import_batch", claimed.id, {
        importedRows: created.length,
        skippedRows: claimed.invalidRows + claimed.duplicateRows,
      });
    return { batch: completed, importedRows: created.length };
  });
}

export async function previewOpeningStockImport(opts: {
  tenantId: string;
  actorUserId: string;
  csvText: string;
}) {
  const csvRows = parseCsv(opts.csvText.replace(/^\uFEFF/, ""));
  const headers = csvRows[0].map(normalizeHeader)
    .map((header) => openingStockHeaderAliases[header] ?? null);
  if (!headers.includes("sku") || !headers.includes("warehouse")
    || !headers.includes("quantity") || !headers.includes("unitCost")) {
    throw badRequest("CSV must include sku, warehouse, quantity and unit_cost columns");
  }
  const [tenant] = await db.select({ baseCurrency: schema.tenants.baseCurrency })
    .from(schema.tenants).where(eq(schema.tenants.id, opts.tenantId));
  if (!tenant) throw badRequest("Workspace was not found");
  const productRows = await db.select({
    id: schema.products.id,
    sku: schema.products.sku,
    currency: schema.products.currency,
    trackStock: schema.products.trackStock,
  }).from(schema.products).where(eq(schema.products.tenantId, opts.tenantId));
  const warehouseRows = await db.select({
    id: schema.warehouses.id,
    name: schema.warehouses.name,
  }).from(schema.warehouses).where(eq(schema.warehouses.tenantId, opts.tenantId));
  const existingMovements = await db.select({
    productId: schema.stockMovements.productId,
    warehouseId: schema.stockMovements.warehouseId,
  }).from(schema.stockMovements).where(eq(schema.stockMovements.tenantId, opts.tenantId));
  const products = new Map(productRows.map((product) => [
    product.sku.trim().toLowerCase(),
    { id: product.id, currency: product.currency, trackStock: product.trackStock },
  ]));
  const warehouses = new Map(warehouseRows.map((warehouse) => [
    warehouse.name.trim().toLowerCase(), warehouse.id,
  ]));
  const usedPairs = new Set(existingMovements.map((movement) =>
    `${movement.productId}:${movement.warehouseId}`));
  const costsByProduct = new Map<string, string>();
  const staged = csvRows.slice(1).map((cells, index) => {
    try {
      const data = parseOpeningStockRow(
        headers, cells, products, warehouses, tenant.baseCurrency,
      );
      const pair = `${data.productId}:${data.warehouseId}`;
      const previousCost = costsByProduct.get(data.productId);
      const duplicate = usedPairs.has(pair);
      const inconsistentCost = previousCost !== undefined && previousCost !== data.unitCost;
      usedPairs.add(pair);
      if (!previousCost) costsByProduct.set(data.productId, data.unitCost);
      return {
        rowNumber: index + 2,
        data,
        status: duplicate || inconsistentCost ? "DUPLICATE" : "VALID",
        error: duplicate
          ? "Stock already exists for this product and warehouse"
          : inconsistentCost
            ? "Use the same unit cost for a product across all warehouses"
            : null,
      };
    } catch (error: unknown) {
      return {
        rowNumber: index + 2,
        data: { source: cells },
        status: "INVALID",
        error: error instanceof Error ? error.message : "Invalid row",
      };
    }
  });
  const summary = {
    totalRows: staged.length,
    validRows: staged.filter((row) => row.status === "VALID").length,
    invalidRows: staged.filter((row) => row.status === "INVALID").length,
    duplicateRows: staged.filter((row) => row.status === "DUPLICATE").length,
  };
  return db.transaction(async (tx) => {
    const [batch] = await tx.insert(schema.importBatches).values({
      tenantId: opts.tenantId,
      entityType: "opening_stock",
      status: "PREVIEW",
      ...summary,
      createdBy: opts.actorUserId,
    }).returning();
    await tx.insert(schema.importRows).values(staged.map((row) => ({
      batchId: batch.id,
      ...row,
    })));
    await audit(tx, opts.tenantId, opts.actorUserId,
      "stock.opening_import_previewed", "import_batch", batch.id, summary);
    return {
      batch,
      rows: staged.slice(0, 100),
      baseCurrency: tenant.baseCurrency,
    };
  });
}

export async function commitOpeningStockImport(opts: {
  tenantId: string;
  actorUserId: string;
  batchId: string;
}) {
  return db.transaction(async (tx) => {
    const [claimed] = await tx.update(schema.importBatches).set({ status: "PROCESSING" }).where(and(
      eq(schema.importBatches.id, opts.batchId),
      eq(schema.importBatches.tenantId, opts.tenantId),
      eq(schema.importBatches.entityType, "opening_stock"),
      eq(schema.importBatches.status, "PREVIEW"),
    )).returning();
    if (!claimed) throw conflict("Import batch is unavailable or already processed");
    const rows = await tx.select().from(schema.importRows).where(and(
      eq(schema.importRows.batchId, claimed.id),
      eq(schema.importRows.status, "VALID"),
    )).orderBy(schema.importRows.rowNumber);
    const [tenant] = await tx.select({ baseCurrency: schema.tenants.baseCurrency })
      .from(schema.tenants).where(eq(schema.tenants.id, opts.tenantId));
    if (!tenant) throw badRequest("Workspace was not found");
    let totalValue = 0n;
    const costsByProduct = new Map<string, string>();
    for (const row of rows) {
      const data = row.data as OpeningStockImportData;
      const [product] = await tx.select().from(schema.products).where(and(
        eq(schema.products.id, data.productId),
        eq(schema.products.tenantId, opts.tenantId),
      ));
      const [warehouse] = await tx.select().from(schema.warehouses).where(and(
        eq(schema.warehouses.id, data.warehouseId),
        eq(schema.warehouses.tenantId, opts.tenantId),
      ));
      if (!product || !warehouse || !product.trackStock) {
        throw conflict("A staged product or warehouse is no longer available");
      }
      if (product.currency !== tenant.baseCurrency) {
        throw conflict("Product currency no longer matches the workspace base currency");
      }
      const movement = await recordStockMovement(tx, {
        tenantId: opts.tenantId,
        productId: product.id,
        warehouseId: warehouse.id,
        quantityDelta: data.quantity,
        unitCost: data.unitCost,
        reason: "OPENING",
        sourceType: "import_batch",
        sourceId: claimed.id,
        note: "Opening stock CSV import",
        createdBy: opts.actorUserId,
        requireZeroCurrent: true,
        requireNoHistory: true,
      });
      totalValue += mulRate(toCents(data.unitCost), data.quantity);
      if (totalValue > MAX_MONEY_CENTS) {
        throw badRequest("Opening stock total exceeds the supported financial limit");
      }
      costsByProduct.set(product.id, data.unitCost);
      await tx.update(schema.importRows).set({
        status: "IMPORTED",
        createdRecordId: movement.movementId,
      }).where(eq(schema.importRows.id, row.id));
    }
    if (totalValue <= 0n) throw badRequest("Opening stock import has no positive value");
    for (const [productId, costPrice] of costsByProduct) {
      await tx.update(schema.products).set({ costPrice }).where(and(
        eq(schema.products.id, productId),
        eq(schema.products.tenantId, opts.tenantId),
      ));
    }
    const inventory = await systemAccount(tx, opts.tenantId, "INVENTORY");
    const opening = await systemAccount(tx, opts.tenantId, "OPENING_EQUITY");
    const journalEntryId = await postJournal(tx, {
      tenantId: opts.tenantId,
      date: new Date(),
      memo: `Opening stock import — ${rows.length} rows`,
      sourceType: "opening_stock_import",
      sourceId: claimed.id,
      createdBy: opts.actorUserId,
      lines: [
        { accountId: inventory.id, debit: fromCents(totalValue) },
        { accountId: opening.id, credit: fromCents(totalValue) },
      ],
    });
    const [completed] = await tx.update(schema.importBatches).set({
      status: "COMPLETED",
      completedAt: new Date(),
    }).where(eq(schema.importBatches.id, claimed.id)).returning();
    await audit(tx, opts.tenantId, opts.actorUserId,
      "stock.opening_import_completed", "import_batch", claimed.id, {
        importedRows: rows.length,
        skippedRows: claimed.invalidRows + claimed.duplicateRows,
        value: fromCents(totalValue),
        currency: tenant.baseCurrency,
        journalEntryId,
      });
    return {
      batch: completed,
      importedRows: rows.length,
      totalValue: fromCents(totalValue),
      currency: tenant.baseCurrency,
      journalEntryId,
    };
  });
}

export async function listImportBatches(tenantId: string) {
  return db.select().from(schema.importBatches)
    .where(eq(schema.importBatches.tenantId, tenantId))
    .orderBy(desc(schema.importBatches.createdAt))
    .limit(50);
}
