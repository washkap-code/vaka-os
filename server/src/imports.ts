import { and, desc, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { z } from "zod";
import { audit, badRequest, conflict, db, fromCents, mulRate, schema, toCents } from "./lib.js";
import { postJournal, systemAccount } from "./accounting.js";
import { recordStockMovement } from "./inventory.js";
import { DOMAIN_EVENTS, runWithPostCommitEvents } from "./platform/events/index.js";
import type { TaxTreatment } from "./platform/localisation/types.js";
import { assertCompatibleTaxRate, resolveTax, taxRateString, todayIsoDate } from "./tax.js";

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
  taxTreatment: TaxTreatment;
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

type BankTransactionImportData = {
  bankAccountId: string;
  date: string;
  description: string;
  amount: string;
  reference: string | null;
  sourceKey: string;
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
  tax_treatment: "taxTreatment",
  vat_treatment: "taxTreatment",
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

type BankHeader = "date" | "description" | "amount" | "debit" | "credit" | "reference";
const bankHeaderAliases: Record<string, BankHeader> = {
  date: "date",
  posted_date: "date",
  posting_date: "date",
  transaction_date: "date",
  value_date: "date",
  description: "description",
  narrative: "description",
  details: "description",
  transaction_description: "description",
  transaction_details: "description",
  narration: "description",
  remarks: "description",
  amount: "amount",
  debit: "debit",
  withdrawal: "debit",
  debit_amount: "debit",
  debits: "debit",
  dr: "debit",
  credit: "credit",
  deposit: "credit",
  credit_amount: "credit",
  credits: "credit",
  cr: "credit",
  reference: "reference",
  transaction_reference: "reference",
  reference_no: "reference",
  reference_number: "reference",
  transaction_id: "reference",
  document_number: "reference",
  cheque_number: "reference",
  cheque_no: "reference",
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

function parseQuantity(value: string): string {
  const clean = value.trim();
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(clean) || Number(clean) <= 0) {
    throw new Error("Quantity must be greater than zero with no more than 3 decimal places");
  }
  return Number(clean).toFixed(3);
}

function parseSignedMoney(value: string, field: string, allowBlank = false): string | null {
  const clean = value.trim().replace(/,/g, "");
  if (!clean && allowBlank) return null;
  if (!/^-?\d{1,12}(\.\d{1,2})?$/.test(clean)) {
    throw new Error(`${field} must be a signed amount with no more than 2 decimal places`);
  }
  const cents = toCents(clean);
  if (cents === 0n) throw new Error(`${field} cannot be zero`);
  if (cents > MAX_MONEY_CENTS || cents < -MAX_MONEY_CENTS) {
    throw new Error(`${field} exceeds the supported financial limit`);
  }
  return fromCents(cents);
}

function parseStatementColumnAmount(value: string, field: string): string | null {
  const clean = value.trim().replace(/,/g, "");
  if (!clean) return null;
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(clean) || toCents(clean) === 0n) {
    throw new Error(`${field} must be a positive amount with no more than 2 decimal places`);
  }
  if (toCents(clean) > MAX_MONEY_CENTS) {
    throw new Error(`${field} exceeds the supported financial limit`);
  }
  return fromCents(toCents(clean));
}

function parseStatementDate(value: string): string {
  const clean = value.trim();
  let year: number;
  let month: number;
  let day: number;
  let match = /^(\d{4})[-/](\d{2})[-/](\d{2})$/.exec(clean);
  if (match) {
    [, year, month, day] = match.map(Number);
  } else {
    match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(clean);
    if (!match) throw new Error("Date must use YYYY-MM-DD, YYYY/MM/DD, or DD/MM/YYYY");
    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3]);
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("Date is invalid");
  }
  return date.toISOString();
}

function parseBankTransactionRow(
  headers: Array<BankHeader | null>,
  cells: string[],
  bankAccountId: string,
): BankTransactionImportData {
  const source = new Map<BankHeader, string>();
  headers.forEach((header, index) => {
    if (header) source.set(header, cells[index] ?? "");
  });
  const date = parseStatementDate(source.get("date") ?? "");
  const description = safeText(source.get("description") ?? "", "Description", 500);
  if (!description) throw new Error("Description is required");
  let amount: string;
  if (source.has("amount")) {
    amount = parseSignedMoney(source.get("amount") ?? "", "Amount")!;
  } else {
    const debit = parseStatementColumnAmount(source.get("debit") ?? "", "Debit");
    const credit = parseStatementColumnAmount(source.get("credit") ?? "", "Credit");
    if (debit && credit) throw new Error("A row cannot contain both debit and credit");
    if (!debit && !credit) throw new Error("A row must contain a debit or credit amount");
    amount = debit ? fromCents(-toCents(debit)) : credit!;
  }
  const reference = safeText(source.get("reference") ?? "", "Reference", 200);
  const sourceKey = createHash("sha256").update([
    bankAccountId,
    date,
    amount,
    description.trim().toLowerCase(),
    reference?.trim().toLowerCase() ?? "",
  ].join("|")).digest("hex");
  return { bankAccountId, date, description, amount, reference, sourceKey };
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

function parseProductRow(
  headers: Array<keyof ProductImportData | null>,
  cells: string[],
  countryCode: string,
  taxDate: string,
): ProductImportData {
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
  const rawTreatment = (source.get("taxTreatment") ?? "standard").trim().toLowerCase();
  if (!(["standard", "zero-rated", "exempt"] as const).includes(rawTreatment as TaxTreatment)) {
    throw new Error("Tax treatment must be standard, zero-rated, or exempt");
  }
  const taxTreatment = rawTreatment as TaxTreatment;
  const resolution = resolveTax(countryCode, taxTreatment, taxDate);
  const suppliedRate = (source.get("taxRate") ?? "").trim() || undefined;
  assertCompatibleTaxRate(suppliedRate, resolution);
  return {
    sku,
    name,
    description: safeText(source.get("description") ?? "", "Description", 1_000),
    unitOfMeasure: safeText(source.get("unitOfMeasure") ?? "", "Unit of measure", 50) ?? "unit",
    costPrice: parseMoney(source.get("costPrice") ?? "", "Cost price"),
    salePrice: parseMoney(source.get("salePrice") ?? "", "Sale price"),
    currency: currency as ProductImportData["currency"],
    taxTreatment,
    taxRate: taxRateString(resolution),
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
  return runWithPostCommitEvents((queue) => db.transaction(async (tx) => {
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
    for (const contact of created) {
      queue({ id: `${DOMAIN_EVENTS.CUSTOMER_CHANGED}:${contact.id}:imported`, type: DOMAIN_EVENTS.CUSTOMER_CHANGED,
        tenantId: opts.tenantId, actorUserId: opts.actorUserId,
        payload: { customerId: contact.id, change: "imported" } });
    }
    return { batch: completed, importedRows: created.length };
  }));
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
  const [tenant] = await db.select({ countryCode: schema.tenants.countryCode })
    .from(schema.tenants).where(eq(schema.tenants.id, opts.tenantId));
  if (!tenant) throw badRequest("Workspace was not found");
  const taxDate = todayIsoDate();
  const existing = await db.select({ sku: schema.products.sku })
    .from(schema.products).where(eq(schema.products.tenantId, opts.tenantId));
  const duplicateSkus = new Set(existing.map((product) => product.sku.trim().toLowerCase()));
  const staged = csvRows.slice(1).map((cells, index) => {
    try {
      const data = parseProductRow(headers, cells, tenant.countryCode, taxDate);
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
  return runWithPostCommitEvents((queue) => db.transaction(async (tx) => {
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
    for (const product of created) {
      queue({ id: `${DOMAIN_EVENTS.PRODUCT_CHANGED}:${product.id}:imported`, type: DOMAIN_EVENTS.PRODUCT_CHANGED,
        tenantId: opts.tenantId, actorUserId: opts.actorUserId,
        payload: { productId: product.id, change: "imported" } });
    }
    return { batch: completed, importedRows: created.length };
  }));
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
  return runWithPostCommitEvents((queue) => db.transaction(async (tx) => {
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
      queue({
        id: `${DOMAIN_EVENTS.STOCK_MOVED}:${movement.movementId}`,
        type: DOMAIN_EVENTS.STOCK_MOVED,
        tenantId: opts.tenantId,
        actorUserId: opts.actorUserId,
        payload: {
          movementId: movement.movementId,
          productId: product.id,
          warehouseId: warehouse.id,
          quantityDelta: data.quantity,
          kind: "OPENING",
        },
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
  }));
}

export async function previewBankStatementImport(opts: {
  tenantId: string;
  actorUserId: string;
  bankAccountId: string;
  csvText: string;
}) {
  const [account] = await db.select().from(schema.bankAccounts).where(and(
    eq(schema.bankAccounts.id, opts.bankAccountId),
    eq(schema.bankAccounts.tenantId, opts.tenantId),
  ));
  if (!account) throw badRequest("Bank account was not found");
  const csvRows = parseCsv(opts.csvText.replace(/^\uFEFF/, ""));
  const headers = csvRows[0].map(normalizeHeader)
    .map((header) => bankHeaderAliases[header] ?? null);
  if (!headers.includes("date") || !headers.includes("description")
    || (!headers.includes("amount") && !headers.includes("debit") && !headers.includes("credit"))) {
    throw badRequest("CSV must include date, description, and amount or debit/credit columns");
  }
  const existing = await db.select({ sourceKey: schema.bankTransactions.sourceKey })
    .from(schema.bankTransactions)
    .where(eq(schema.bankTransactions.bankAccountId, account.id));
  const sourceKeys = new Set(existing.flatMap((row) => row.sourceKey ? [row.sourceKey] : []));
  const fingerprintOccurrences = new Map<string, number>();
  const staged = csvRows.slice(1).map((cells, index) => {
    try {
      const data = parseBankTransactionRow(headers, cells, account.id);
      const fingerprint = data.sourceKey;
      const occurrence = (fingerprintOccurrences.get(fingerprint) ?? 0) + 1;
      fingerprintOccurrences.set(fingerprint, occurrence);
      data.sourceKey = createHash("sha256").update(`${fingerprint}|occurrence:${occurrence}`).digest("hex");
      const duplicate = sourceKeys.has(data.sourceKey);
      sourceKeys.add(data.sourceKey);
      return {
        rowNumber: index + 2,
        data,
        status: duplicate ? "DUPLICATE" : "VALID",
        error: duplicate ? "Possible duplicate bank transaction" : null,
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
      entityType: "bank_transactions",
      status: "PREVIEW",
      ...summary,
      createdBy: opts.actorUserId,
    }).returning();
    await tx.insert(schema.importRows).values(staged.map((row) => ({
      batchId: batch.id,
      ...row,
    })));
    await audit(tx, opts.tenantId, opts.actorUserId,
      "bank_statement.import_previewed", "import_batch", batch.id, {
        ...summary, bankAccountId: account.id,
      });
    return { batch, rows: staged.slice(0, 100), account };
  });
}

export async function commitBankStatementImport(opts: {
  tenantId: string;
  actorUserId: string;
  batchId: string;
}) {
  return db.transaction(async (tx) => {
    const [claimed] = await tx.update(schema.importBatches).set({ status: "PROCESSING" }).where(and(
      eq(schema.importBatches.id, opts.batchId),
      eq(schema.importBatches.tenantId, opts.tenantId),
      eq(schema.importBatches.entityType, "bank_transactions"),
      eq(schema.importBatches.status, "PREVIEW"),
    )).returning();
    if (!claimed) throw conflict("Import batch is unavailable or already processed");
    const rows = await tx.select().from(schema.importRows).where(and(
      eq(schema.importRows.batchId, claimed.id),
      eq(schema.importRows.status, "VALID"),
    )).orderBy(schema.importRows.rowNumber);
    if (!rows.length) throw badRequest("Bank statement import has no valid rows");
    const accountId = (rows[0].data as BankTransactionImportData).bankAccountId;
    const [account] = await tx.select().from(schema.bankAccounts).where(and(
      eq(schema.bankAccounts.id, accountId),
      eq(schema.bankAccounts.tenantId, opts.tenantId),
    ));
    if (!account) throw conflict("The staged bank account is no longer available");
    const created = await tx.insert(schema.bankTransactions).values(rows.map((row) => {
      const data = row.data as BankTransactionImportData;
      if (data.bankAccountId !== account.id) throw conflict("Import batch contains inconsistent bank accounts");
      return {
        bankAccountId: account.id,
        date: new Date(data.date),
        description: data.description,
        amount: data.amount,
        reference: data.reference,
        sourceKey: data.sourceKey,
        importedBatchId: claimed.id,
      };
    })).onConflictDoNothing({
      target: [schema.bankTransactions.bankAccountId, schema.bankTransactions.sourceKey],
    }).returning({ id: schema.bankTransactions.id, sourceKey: schema.bankTransactions.sourceKey });
    const createdByKey = new Map(created.map((row) => [row.sourceKey, row.id]));
    for (const row of rows) {
      const data = row.data as BankTransactionImportData;
      const createdId = createdByKey.get(data.sourceKey);
      await tx.update(schema.importRows).set({
        status: createdId ? "IMPORTED" : "DUPLICATE",
        createdRecordId: createdId ?? null,
        error: createdId ? null : "Duplicate detected during approval",
      }).where(eq(schema.importRows.id, row.id));
    }
    const [completed] = await tx.update(schema.importBatches).set({
      status: "COMPLETED",
      completedAt: new Date(),
    }).where(eq(schema.importBatches.id, claimed.id)).returning();
    await audit(tx, opts.tenantId, opts.actorUserId,
      "bank_statement.import_completed", "import_batch", claimed.id, {
        bankAccountId: account.id,
        importedRows: created.length,
        skippedRows: claimed.totalRows - created.length,
        postedToLedger: false,
      });
    return { batch: completed, importedRows: created.length, accountCurrency: account.currency };
  });
}

export async function listImportBatches(tenantId: string) {
  return db.select().from(schema.importBatches)
    .where(eq(schema.importBatches.tenantId, tenantId))
    .orderBy(desc(schema.importBatches.createdAt))
    .limit(50);
}
