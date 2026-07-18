import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  audit, badRequest, conflict, db, notFound, schema, type DB,
} from "../../lib.js";
import { METADATA_REGISTRY, platformKernel } from "../../platform-runtime.js";
import type { MetadataRegistryContract } from "../../platform/metadata/interfaces.js";
import type { FieldDefinition } from "../../platform/metadata/types.js";
import { DOMAIN_EVENTS, runWithPostCommitEvents } from "../../platform/events/index.js";
import { autoAuditContactRoles, autoAuditMutation } from "../../universal-audit.js";
import { assertCompatibleTaxRate, resolveTax, taxRateString, todayIsoDate } from "../../tax.js";
import { decodeCsvInput, parseCsvDocument } from "./csv.js";
import { importableFields, suggestMappings } from "./mapping.js";
import type {
  CsvEncoding, DuplicatePolicy, MigrationMappingState, MigrationObjectType,
  MigrationRowIssue, MigrationRowStatus,
} from "./types.js";
import { metadataIssue } from "./types.js";

const WRITE_CHUNK_SIZE = 500;
const CONTACT_FIELDS = [
  "type", "name", "email", "phone", "address", "addressLine1", "addressLine2",
  "city", "region", "postalCode", "countryCode", "website", "industry",
  "registrationNumber", "notes", "taxNumber", "tags", "supplierCode",
  "supplierCurrency", "supplierPaymentTermsDays", "supplierLeadTimeDays",
] as const;
const PRODUCT_FIELDS = [
  "sku", "name", "description", "unitOfMeasure", "costPrice", "salePrice",
  "currency", "taxRate", "taxTreatment", "reorderLevel", "trackStock", "isActive",
] as const;

type JobRow = typeof schema.migrationJobs.$inferSelect;
type StagedRow = typeof schema.migrationRows.$inferSelect;
type ContactRow = typeof schema.contacts.$inferSelect;
type ProductRow = typeof schema.products.$inferSelect;
type CanonicalRow = ContactRow | ProductRow;

interface ValidationUpdate {
  id: string;
  status: MigrationRowStatus;
  errors: MigrationRowIssue[];
  mapped: Record<string, unknown>;
  matchedRecordId: string | null;
}

interface ImportedEvidence {
  rowId: string;
  recordId: string;
  operation: "created" | "updated";
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
}

function chunks<T>(values: readonly T[], size = WRITE_CHUNK_SIZE): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mappingState(job: JobRow): MigrationMappingState {
  const value = job.mappingJson;
  if (!isRecord(value) || !Array.isArray(value.headers) || !isRecord(value.columns)
    || typeof value.encoding !== "string" || typeof value.delimiter !== "string") {
    throw conflict("Migration job mapping state is unavailable");
  }
  const headers = value.headers.filter((header): header is string => typeof header === "string");
  if (headers.length !== value.headers.length) throw conflict("Migration job headers are invalid");
  const columns = Object.fromEntries(Object.entries(value.columns)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  return {
    headers,
    columns,
    encoding: value.encoding as MigrationMappingState["encoding"],
    delimiter: value.delimiter,
    ...(isRecord(value.lastFailure) ? { lastFailure: value.lastFailure as unknown as MigrationMappingState["lastFailure"] } : {}),
  };
}

function normaliseJson(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normaliseJson);
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().filter((key) => value[key] !== undefined)
      .map((key) => [key, normaliseJson(value[key])]));
  }
  return value;
}

function recordJson(row: CanonicalRow): Record<string, unknown> {
  return normaliseJson(row) as Record<string, unknown>;
}

function recordsEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(normaliseJson(left)) === JSON.stringify(normaliseJson(right));
}

async function requireJob(tenantId: string, jobId: string): Promise<JobRow> {
  const [job] = await db.select().from(schema.migrationJobs).where(and(
    eq(schema.migrationJobs.id, jobId),
    eq(schema.migrationJobs.tenantId, tenantId),
  ));
  if (!job) throw notFound("Migration job not found");
  return job;
}

async function lockedJob(tx: DB, tenantId: string, jobId: string): Promise<JobRow> {
  const [job] = await tx.select().from(schema.migrationJobs).where(and(
    eq(schema.migrationJobs.id, jobId),
    eq(schema.migrationJobs.tenantId, tenantId),
  )).for("update");
  if (!job) throw notFound("Migration job not found");
  return job;
}

async function updateMappedRows(tx: DB, updates: Array<{ id: string; mapped: Record<string, unknown> }>): Promise<void> {
  for (const batch of chunks(updates)) {
    const values = sql.join(batch.map((entry) => sql`(${entry.id}::uuid, ${JSON.stringify(entry.mapped)}::jsonb)`), sql`, `);
    await tx.execute(sql`
      UPDATE migration_rows target
         SET mapped_json = source.mapped_json,
             status = 'pending',
             errors_json = '[]'::jsonb,
             created_record_id = NULL,
             matched_record_id = NULL,
             import_operation = NULL,
             before_json = NULL,
             after_json = NULL
        FROM (VALUES ${values}) AS source(id, mapped_json)
       WHERE target.id = source.id
    `);
  }
}

async function updateValidationRows(tx: DB, updates: ValidationUpdate[]): Promise<void> {
  for (const batch of chunks(updates)) {
    const values = sql.join(batch.map((entry) => sql`(
      ${entry.id}::uuid,
      ${entry.status}::text,
      ${JSON.stringify(entry.errors)}::jsonb,
      ${JSON.stringify(entry.mapped)}::jsonb,
      ${entry.matchedRecordId}::uuid
    )`), sql`, `);
    await tx.execute(sql`
      UPDATE migration_rows target
         SET status = source.status,
             errors_json = source.errors_json,
             mapped_json = source.mapped_json,
             matched_record_id = source.matched_record_id,
             created_record_id = NULL,
             import_operation = NULL,
             before_json = NULL,
             after_json = NULL
        FROM (VALUES ${values}) AS source(id, status, errors_json, mapped_json, matched_record_id)
       WHERE target.id = source.id
    `);
  }
}

async function updateImportedEvidence(tx: DB, evidence: ImportedEvidence[]): Promise<void> {
  for (const batch of chunks(evidence)) {
    const values = sql.join(batch.map((entry) => sql`(
      ${entry.rowId}::uuid,
      ${entry.recordId}::uuid,
      ${entry.operation}::text,
      ${entry.before === null ? null : JSON.stringify(entry.before)}::jsonb,
      ${JSON.stringify(entry.after)}::jsonb
    )`), sql`, `);
    await tx.execute(sql`
      UPDATE migration_rows target
         SET status = 'imported',
             errors_json = '[]'::jsonb,
             created_record_id = source.record_id,
             import_operation = source.operation,
             before_json = source.before_json,
             after_json = source.after_json
        FROM (VALUES ${values}) AS source(row_id, record_id, operation, before_json, after_json)
       WHERE target.id = source.row_id
    `);
  }
}

export async function uploadJob(input: {
  tenantId: string;
  actorUserId: string;
  objectType: MigrationObjectType;
  sourceFilename: string;
  duplicatePolicy: DuplicatePolicy;
  csvText?: string;
  contentBase64?: string;
  encoding?: CsvEncoding;
}) {
  const decoded = decodeCsvInput(input);
  const parsed = parseCsvDocument(decoded.text);
  return db.transaction(async (tx) => {
    const state: MigrationMappingState = {
      headers: parsed.headers,
      columns: {},
      encoding: decoded.encoding,
      delimiter: parsed.delimiter,
    };
    const [job] = await tx.insert(schema.migrationJobs).values({
      tenantId: input.tenantId,
      objectType: input.objectType,
      sourceFilename: input.sourceFilename.trim(),
      duplicatePolicy: input.duplicatePolicy,
      totalRows: parsed.rows.length,
      mappingJson: state,
      createdBy: input.actorUserId,
    }).returning();
    for (const batch of chunks(parsed.rows, 1_000)) {
      await tx.insert(schema.migrationRows).values(batch.map((row) => ({
        jobId: job.id,
        rowNumber: row.rowNumber,
        rawJson: row.raw,
      })));
    }
    await audit(tx, input.tenantId, input.actorUserId, "migration_job.uploaded", "migration_job", job.id, {
      objectType: input.objectType,
      sourceFilename: input.sourceFilename.trim(),
      totalRows: parsed.rows.length,
      encoding: decoded.encoding,
      delimiter: parsed.delimiter === "\t" ? "tab" : parsed.delimiter,
      duplicatePolicy: input.duplicatePolicy,
    });
    return job;
  });
}

export async function listJobs(tenantId: string, options: { page: number; pageSize: number }) {
  const offset = (options.page - 1) * options.pageSize;
  const [jobs, totalRows] = await Promise.all([
    db.select().from(schema.migrationJobs).where(eq(schema.migrationJobs.tenantId, tenantId))
      .orderBy(desc(schema.migrationJobs.createdAt), desc(schema.migrationJobs.id))
      .limit(options.pageSize).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(schema.migrationJobs)
      .where(eq(schema.migrationJobs.tenantId, tenantId)),
  ]);
  const total = totalRows[0]?.count ?? 0;
  return { jobs, page: options.page, pageSize: options.pageSize, total, hasMore: offset + jobs.length < total };
}

export async function getJob(tenantId: string, jobId: string) {
  return requireJob(tenantId, jobId);
}

export async function getJobRows(
  tenantId: string,
  jobId: string,
  options: { page: number; pageSize: number; status?: MigrationRowStatus },
) {
  await requireJob(tenantId, jobId);
  const where = and(
    eq(schema.migrationRows.jobId, jobId),
    options.status ? eq(schema.migrationRows.status, options.status) : undefined,
  );
  const offset = (options.page - 1) * options.pageSize;
  const [rows, totalRows] = await Promise.all([
    db.select().from(schema.migrationRows).where(where)
      .orderBy(asc(schema.migrationRows.rowNumber)).limit(options.pageSize).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(schema.migrationRows).where(where),
  ]);
  const total = totalRows[0]?.count ?? 0;
  return { rows, page: options.page, pageSize: options.pageSize, total, hasMore: offset + rows.length < total };
}

export async function suggestJobMapping(tenantId: string, jobId: string) {
  const job = await requireJob(tenantId, jobId);
  const state = mappingState(job);
  const registry = platformKernel().container.get(METADATA_REGISTRY);
  return { objectType: job.objectType, suggestions: suggestMappings(registry, job.objectType, state.headers) };
}

export async function mapJob(input: {
  tenantId: string;
  actorUserId: string;
  jobId: string;
  mapping: Record<string, string>;
  duplicatePolicy?: DuplicatePolicy;
}) {
  return db.transaction(async (tx) => {
    const job = await lockedJob(tx, input.tenantId, input.jobId);
    if (!(["uploaded", "mapped", "validated", "failed"] as string[]).includes(job.status)) {
      throw conflict("Migration job can no longer be remapped");
    }
    const state = mappingState(job);
    const registry = platformKernel().container.get(METADATA_REGISTRY);
    const fields = new Map(importableFields(registry, job.objectType).map((field) => [field.name, field]));
    const columns: Record<string, string> = {};
    const targets = new Set<string>();
    for (const [column, rawTarget] of Object.entries(input.mapping)) {
      const target = rawTarget.trim();
      if (!state.headers.includes(column)) throw badRequest(`Unknown CSV column: ${column}`);
      if (!target) continue;
      if (!fields.has(target)) throw badRequest(`Field ${target} is not importable for ${job.objectType}`);
      if (targets.has(target)) throw badRequest(`Field ${target} is mapped more than once`);
      targets.add(target);
      columns[column] = target;
    }
    for (const required of job.objectType === "Product" ? ["sku", "name"] : ["name"]) {
      if (!targets.has(required)) throw badRequest(`Mapping must include required field ${required}`);
    }
    const rows = await tx.select({ id: schema.migrationRows.id, rawJson: schema.migrationRows.rawJson })
      .from(schema.migrationRows).where(eq(schema.migrationRows.jobId, job.id));
    await updateMappedRows(tx, rows.map((row) => ({
      id: row.id,
      mapped: Object.fromEntries(Object.entries(columns).map(([column, target]) => [target, row.rawJson[column] ?? ""])),
    })));
    const nextState: MigrationMappingState = { ...state, columns };
    const [updated] = await tx.update(schema.migrationJobs).set({
      status: "mapped",
      duplicatePolicy: input.duplicatePolicy ?? job.duplicatePolicy,
      mappingJson: nextState,
      validRows: 0,
      errorRows: 0,
      importedRows: 0,
      completedAt: null,
    }).where(eq(schema.migrationJobs.id, job.id)).returning();
    await audit(tx, input.tenantId, input.actorUserId, "migration_job.mapped", "migration_job", job.id, {
      objectType: job.objectType,
      mappedColumns: Object.keys(columns).length,
      duplicatePolicy: updated.duplicatePolicy,
    });
    return updated;
  });
}

function normaliseDecimal(value: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return value.trim();
  const integer = match[2].replace(/^0+(?=\d)/, "");
  return `${match[1]}${integer}${match[3] === undefined ? "" : `.${match[3]}`}`;
}

function coerce(field: FieldDefinition, value: unknown): unknown {
  if (typeof value !== "string") return value;
  const clean = value.trim();
  if (!clean) return undefined;
  switch (field.type) {
    case "string": return clean;
    case "uuid": return clean;
    case "decimal": return normaliseDecimal(clean);
    case "integer": return /^-?\d+$/.test(clean) ? Number(clean) : clean;
    case "boolean": {
      const normalized = clean.toLocaleLowerCase("en");
      if (["true", "yes", "y", "1"].includes(normalized)) return true;
      if (["false", "no", "n", "0"].includes(normalized)) return false;
      return clean;
    }
    case "date": return clean;
    case "datetime": return clean;
    case "string[]": return clean.split(";").map((item) => item.trim()).filter(Boolean);
  }
}

function mappedPayload(
  registry: MetadataRegistryContract,
  objectType: MigrationObjectType,
  value: unknown,
  tenant: { baseCurrency: "USD" | "ZWG"; countryCode: string },
): { payload: Record<string, unknown>; issues: MigrationRowIssue[] } {
  if (!isRecord(value)) return { payload: {}, issues: [{ code: "mapping", field: "$", message: "Mapped row is missing" }] };
  const fieldMap = new Map(registry.getFields(objectType).map((field) => [field.name, field]));
  const payload: Record<string, unknown> = {};
  for (const [name, raw] of Object.entries(value)) {
    const field = fieldMap.get(name);
    if (!field) continue;
    const converted = coerce(field, raw);
    if (converted !== undefined) payload[name] = converted;
  }
  if (objectType === "Customer" || objectType === "Supplier") {
    payload.type ??= "COMPANY";
    payload.tags ??= [];
    if (typeof payload.email === "string") payload.email = payload.email.toLocaleLowerCase("en");
    if (typeof payload.countryCode === "string") payload.countryCode = payload.countryCode.toLocaleUpperCase("en");
    if (typeof payload.supplierCurrency === "string") payload.supplierCurrency = payload.supplierCurrency.toLocaleUpperCase("en");
    payload.isCustomer = objectType === "Customer";
    payload.isVendor = objectType === "Supplier";
  } else {
    payload.unitOfMeasure ??= "unit";
    payload.costPrice ??= "0.00";
    payload.salePrice ??= "0.00";
    payload.currency ??= tenant.baseCurrency;
    payload.taxTreatment ??= "standard";
    payload.reorderLevel ??= 0;
    payload.trackStock ??= true;
    payload.isActive ??= true;
    if (typeof payload.currency === "string") payload.currency = payload.currency.toLocaleUpperCase("en");
    try {
      const treatment = payload.taxTreatment;
      if (treatment === "standard" || treatment === "zero-rated" || treatment === "exempt") {
        const resolution = resolveTax(tenant.countryCode, treatment, todayIsoDate());
        assertCompatibleTaxRate(typeof payload.taxRate === "string" ? payload.taxRate : undefined, resolution);
        payload.taxRate = taxRateString(resolution);
      }
    } catch (error) {
      return {
        payload,
        issues: [{ code: "validation", field: "taxRate", message: error instanceof Error ? error.message : "Tax rate is invalid" }],
      };
    }
  }
  const result = registry.validate(objectType, payload);
  return { payload, issues: result.errors.map(metadataIssue) };
}

function contactNaturalKeys(value: Record<string, unknown>): string[] {
  const keys: string[] = [];
  if (typeof value.email === "string" && value.email.trim()) keys.push(`email:${value.email.trim().toLocaleLowerCase("en")}`);
  if (typeof value.taxNumber === "string" && value.taxNumber.trim()) keys.push(`tax:${value.taxNumber.trim().toLocaleUpperCase("en")}`);
  return keys;
}

function productNaturalKeys(value: Record<string, unknown>): string[] {
  return typeof value.sku === "string" && value.sku.trim()
    ? [`sku:${value.sku.trim().toLocaleLowerCase("en")}`]
    : [];
}

function duplicateIssue(message: string, details?: Record<string, unknown>): MigrationRowIssue {
  return { code: "duplicate", field: "$", message, ...(details ? { details } : {}) };
}

export async function validateJob(input: { tenantId: string; actorUserId: string; jobId: string }) {
  return db.transaction(async (tx) => {
    const job = await lockedJob(tx, input.tenantId, input.jobId);
    if (!(["mapped", "validated", "failed"] as string[]).includes(job.status)) {
      throw conflict("Migration job must be mapped before validation");
    }
    const state = mappingState(job);
    if (!Object.keys(state.columns).length) throw conflict("Migration job has no field mapping");
    const [tenant] = await tx.select({
      baseCurrency: schema.tenants.baseCurrency,
      countryCode: schema.tenants.countryCode,
    }).from(schema.tenants).where(eq(schema.tenants.id, input.tenantId));
    if (!tenant) throw notFound("Workspace not found");
    const registry = platformKernel().container.get(METADATA_REGISTRY);
    const rows = await tx.select().from(schema.migrationRows)
      .where(eq(schema.migrationRows.jobId, job.id)).orderBy(asc(schema.migrationRows.rowNumber));

    const existingByKey = new Map<string, Set<string>>();
    if (job.objectType === "Product") {
      const existing = await tx.select({ id: schema.products.id, sku: schema.products.sku })
        .from(schema.products).where(eq(schema.products.tenantId, input.tenantId));
      for (const record of existing) existingByKey.set(`sku:${record.sku.trim().toLocaleLowerCase("en")}`, new Set([record.id]));
    } else {
      const existing = await tx.select({ id: schema.contacts.id, email: schema.contacts.email, taxNumber: schema.contacts.taxNumber })
        .from(schema.contacts).where(and(
          eq(schema.contacts.tenantId, input.tenantId),
          sql`${schema.contacts.deletedAt} IS NULL`,
        ));
      for (const record of existing) {
        for (const key of contactNaturalKeys(record)) {
          const ids = existingByKey.get(key) ?? new Set<string>();
          ids.add(record.id);
          existingByKey.set(key, ids);
        }
      }
    }

    const seenInFile = new Map<string, number>();
    const matchedInFile = new Map<string, number>();
    const updates: ValidationUpdate[] = [];
    for (const row of rows) {
      const normalized = mappedPayload(registry, job.objectType, row.mappedJson, tenant);
      const issues = [...normalized.issues];
      let status: MigrationRowStatus = issues.length ? "error" : "valid";
      let matchedRecordId: string | null = null;
      const keys = job.objectType === "Product"
        ? productNaturalKeys(normalized.payload)
        : contactNaturalKeys(normalized.payload);
      if (!issues.length) {
        const existingIds = new Set(keys.flatMap((key) => [...(existingByKey.get(key) ?? [])]));
        const earlierRows = keys.map((key) => seenInFile.get(key)).filter((value): value is number => value !== undefined);
        const ambiguous = existingIds.size > 1;
        if (ambiguous) {
          issues.push(duplicateIssue("Natural keys match more than one existing record"));
          status = "error";
        } else if (earlierRows.length && !(job.duplicatePolicy === "create-anyway" && job.objectType !== "Product")) {
          issues.push(duplicateIssue(`Natural key duplicates CSV row ${Math.min(...earlierRows)}`));
          status = job.duplicatePolicy === "skip" ? "skipped" : "error";
        } else if (existingIds.size === 1) {
          const existingId = [...existingIds][0];
          if (job.duplicatePolicy === "skip") {
            issues.push(duplicateIssue("Existing record matches this row", { recordId: existingId }));
            status = "skipped";
          } else if (job.duplicatePolicy === "update-existing") {
            if (matchedInFile.has(existingId)) {
              issues.push(duplicateIssue(`Existing record is already targeted by CSV row ${matchedInFile.get(existingId)}`));
              status = "error";
            } else {
              matchedRecordId = existingId;
              matchedInFile.set(existingId, row.rowNumber);
            }
          } else if (job.objectType === "Product") {
            issues.push(duplicateIssue("Product SKU is database-unique and cannot use create-anyway"));
            status = "error";
          }
        }
      }
      for (const key of keys) if (!seenInFile.has(key)) seenInFile.set(key, row.rowNumber);
      updates.push({ id: row.id, status, errors: issues, mapped: normalized.payload, matchedRecordId });
    }
    await updateValidationRows(tx, updates);
    const validRows = updates.filter((row) => row.status === "valid").length;
    const errorRows = updates.filter((row) => row.status === "error").length;
    const skippedRows = updates.filter((row) => row.status === "skipped").length;
    const [updated] = await tx.update(schema.migrationJobs).set({
      status: "validated",
      validRows,
      errorRows,
      importedRows: 0,
      mappingJson: { ...state, lastFailure: undefined },
      completedAt: null,
    }).where(eq(schema.migrationJobs.id, job.id)).returning();
    await audit(tx, input.tenantId, input.actorUserId, "migration_job.validated", "migration_job", job.id, {
      objectType: job.objectType,
      totalRows: job.totalRows,
      validRows,
      errorRows,
      skippedRows,
      duplicatePolicy: job.duplicatePolicy,
    });
    return { job: updated, validRows, errorRows, skippedRows };
  });
}

function contactValues(
  payload: Record<string, unknown>, tenantId: string, actorUserId: string, objectType: MigrationObjectType, id = randomUUID(),
): typeof schema.contacts.$inferInsert {
  const values: Record<string, unknown> = { id, tenantId, ownerUserId: actorUserId };
  for (const field of CONTACT_FIELDS) if (payload[field] !== undefined) values[field] = payload[field];
  values.isCustomer = objectType === "Customer";
  values.isVendor = objectType === "Supplier";
  return values as typeof schema.contacts.$inferInsert;
}

function productValues(
  payload: Record<string, unknown>, tenantId: string, id = randomUUID(),
): typeof schema.products.$inferInsert {
  const values: Record<string, unknown> = { id, tenantId };
  for (const field of PRODUCT_FIELDS) if (payload[field] !== undefined) values[field] = payload[field];
  return values as typeof schema.products.$inferInsert;
}

function contactPatch(payload: Record<string, unknown>, mappedFields: Set<string>, objectType: MigrationObjectType) {
  const values: Record<string, unknown> = {};
  for (const field of CONTACT_FIELDS) if (mappedFields.has(field) && payload[field] !== undefined) values[field] = payload[field];
  values[objectType === "Customer" ? "isCustomer" : "isVendor"] = true;
  return values as Partial<typeof schema.contacts.$inferInsert>;
}

function productPatch(payload: Record<string, unknown>, mappedFields: Set<string>) {
  const values: Record<string, unknown> = {};
  for (const field of PRODUCT_FIELDS) if (mappedFields.has(field) && payload[field] !== undefined) values[field] = payload[field];
  if (mappedFields.has("taxTreatment")) values.taxRate = payload.taxRate;
  return values as Partial<typeof schema.products.$inferInsert>;
}

async function currentCanonical(tx: DB, tenantId: string, objectType: MigrationObjectType, recordId: string): Promise<CanonicalRow | null> {
  if (objectType === "Product") {
    const [record] = await tx.select().from(schema.products).where(and(
      eq(schema.products.id, recordId), eq(schema.products.tenantId, tenantId),
    ));
    return record ?? null;
  }
  const [record] = await tx.select().from(schema.contacts).where(and(
    eq(schema.contacts.id, recordId), eq(schema.contacts.tenantId, tenantId),
  ));
  return record ?? null;
}

async function writeRuntimeSkipped(tx: DB, values: Array<{ id: string; issue: MigrationRowIssue }>): Promise<void> {
  for (const batch of chunks(values)) {
    const tuples = sql.join(batch.map((entry) => sql`(${entry.id}::uuid, ${JSON.stringify([entry.issue])}::jsonb)`), sql`, `);
    await tx.execute(sql`
      UPDATE migration_rows target
         SET status = 'skipped', errors_json = source.errors_json
        FROM (VALUES ${tuples}) AS source(id, errors_json)
       WHERE target.id = source.id
    `);
  }
}

export async function importJob(input: {
  tenantId: string;
  actorUserId: string;
  jobId: string;
  ip?: string | null;
}) {
  try {
    return await runWithPostCommitEvents((queue) => db.transaction(async (tx) => {
      const job = await lockedJob(tx, input.tenantId, input.jobId);
      if (!(["validated", "failed"] as string[]).includes(job.status)) {
        throw conflict("Migration job must be validated before import");
      }
      if (!job.validRows) throw badRequest("Migration job has no valid rows to import");
      const state = mappingState(job);
      const mappedFields = new Set(Object.values(state.columns));
      await tx.update(schema.migrationJobs).set({ status: "importing" })
        .where(eq(schema.migrationJobs.id, job.id));
      const rows = await tx.select().from(schema.migrationRows).where(and(
        eq(schema.migrationRows.jobId, job.id), eq(schema.migrationRows.status, "valid"),
      )).orderBy(asc(schema.migrationRows.rowNumber));
      const evidence: ImportedEvidence[] = [];
      const runtimeSkipped: Array<{ id: string; issue: MigrationRowIssue }> = [];

      for (const row of rows.filter((value) => value.matchedRecordId)) {
        const current = await currentCanonical(tx, input.tenantId, job.objectType, row.matchedRecordId!);
        if (!current) throw conflict(`Matched record for CSV row ${row.rowNumber} is no longer available`);
        const before = recordJson(current);
        let updated: CanonicalRow;
        if (job.objectType === "Product") {
          const [result] = await tx.update(schema.products)
            .set(productPatch(row.mappedJson!, mappedFields))
            .where(and(eq(schema.products.id, current.id), eq(schema.products.tenantId, input.tenantId)))
            .returning();
          updated = result;
          await autoAuditMutation(tx, {
            tenantId: input.tenantId, actorId: input.actorUserId, actorType: "user",
            action: "product.updated", objectType: "Product", objectId: result.id,
            before: current, after: result, ip: input.ip,
          });
        } else {
          const [result] = await tx.update(schema.contacts)
            .set(contactPatch(row.mappedJson!, mappedFields, job.objectType))
            .where(and(eq(schema.contacts.id, current.id), eq(schema.contacts.tenantId, input.tenantId)))
            .returning();
          updated = result;
          await autoAuditContactRoles(tx, {
            tenantId: input.tenantId, actorId: input.actorUserId, action: "updated",
            objectId: result.id, before: current, after: result, ip: input.ip,
          });
        }
        evidence.push({ rowId: row.id, recordId: updated.id, operation: "updated", before, after: recordJson(updated) });
      }

      const createRows = rows.filter((value) => !value.matchedRecordId);
      if (job.objectType === "Product") {
        const existing = await tx.select({ id: schema.products.id, sku: schema.products.sku })
          .from(schema.products).where(eq(schema.products.tenantId, input.tenantId));
        const bySku = new Map(existing.map((record) => [record.sku.trim().toLocaleLowerCase("en"), record.id]));
        const inserts: Array<{ row: StagedRow; value: typeof schema.products.$inferInsert }> = [];
        for (const row of createRows) {
          const sku = String(row.mappedJson!.sku).trim().toLocaleLowerCase("en");
          const duplicateId = bySku.get(sku);
          if (duplicateId) {
            if (job.duplicatePolicy === "update-existing") {
              throw conflict(`Product duplicate changed after validation at CSV row ${row.rowNumber}; validate again`);
            }
            runtimeSkipped.push({ id: row.id, issue: duplicateIssue("Product SKU became unavailable before import", { recordId: duplicateId }) });
            continue;
          }
          const value = productValues(row.mappedJson!, input.tenantId);
          bySku.set(sku, value.id!);
          inserts.push({ row, value });
        }
        for (const batch of chunks(inserts)) {
          const created = await tx.insert(schema.products).values(batch.map((entry) => entry.value)).returning();
          const byId = new Map(created.map((record) => [record.id, record]));
          for (const entry of batch) {
            const record = byId.get(entry.value.id!);
            if (!record) throw conflict("Product import result could not be reconciled to its CSV row");
            await autoAuditMutation(tx, {
              tenantId: input.tenantId, actorId: input.actorUserId, actorType: "user",
              action: "product.created", objectType: "Product", objectId: record.id,
              before: null, after: record, ip: input.ip,
            });
            evidence.push({ rowId: entry.row.id, recordId: record.id, operation: "created", before: null, after: recordJson(record) });
          }
        }
      } else {
        const inserts = createRows.map((row) => ({
          row,
          value: contactValues(row.mappedJson!, input.tenantId, input.actorUserId, job.objectType),
        }));
        for (const batch of chunks(inserts)) {
          const created = await tx.insert(schema.contacts).values(batch.map((entry) => entry.value)).returning();
          const byId = new Map(created.map((record) => [record.id, record]));
          for (const entry of batch) {
            const record = byId.get(entry.value.id!);
            if (!record) throw conflict("Contact import result could not be reconciled to its CSV row");
            await autoAuditContactRoles(tx, {
              tenantId: input.tenantId, actorId: input.actorUserId, action: "created",
              objectId: record.id, before: null, after: record, ip: input.ip,
            });
            evidence.push({ rowId: entry.row.id, recordId: record.id, operation: "created", before: null, after: recordJson(record) });
          }
        }
      }

      await updateImportedEvidence(tx, evidence);
      await writeRuntimeSkipped(tx, runtimeSkipped);
      const errorRows = job.errorRows;
      const [completed] = await tx.update(schema.migrationJobs).set({
        status: "completed",
        importedRows: evidence.length,
        errorRows,
        mappingJson: { ...state, lastFailure: undefined },
        completedAt: new Date(),
      }).where(eq(schema.migrationJobs.id, job.id)).returning();
      await audit(tx, input.tenantId, input.actorUserId, "migration_job.completed", "migration_job", job.id, {
        objectType: job.objectType,
        importedRows: evidence.length,
        skippedRows: job.totalRows - evidence.length - errorRows,
        duplicatePolicy: job.duplicatePolicy,
      });
      queue({
        id: `${DOMAIN_EVENTS.MIGRATION_COMPLETED}:${job.id}`,
        type: DOMAIN_EVENTS.MIGRATION_COMPLETED,
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        payload: { jobId: job.id, objectType: job.objectType, importedRows: evidence.length },
      });
      return { job: completed, importedRows: evidence.length, skippedRows: job.totalRows - evidence.length - errorRows };
    }));
  } catch (error) {
    const [job] = await db.select().from(schema.migrationJobs).where(and(
      eq(schema.migrationJobs.id, input.jobId), eq(schema.migrationJobs.tenantId, input.tenantId),
    ));
    if (job && job.status !== "completed" && job.status !== "rolled_back") {
      const state = mappingState(job);
      await db.transaction(async (tx) => {
        await tx.update(schema.migrationJobs).set({
          status: "failed",
          mappingJson: {
            ...state,
            lastFailure: { stage: "import", message: "Import failed; no records were committed", at: new Date().toISOString() },
          },
        }).where(eq(schema.migrationJobs.id, job.id));
        await audit(tx, input.tenantId, input.actorUserId, "migration_job.failed", "migration_job", job.id, {
          stage: "import", errorType: error instanceof Error ? error.name : "UnknownError",
        });
      });
    }
    throw error;
  }
}

async function dependencyReasons(tx: DB, objectType: MigrationObjectType, recordId: string): Promise<unknown[]> {
  const table = objectType === "Product" ? "products" : "contacts";
  const result = await tx.execute(sql`
    SELECT vaka_migration_record_dependencies(${sql.raw(`'${table}'`)}::regclass, ${recordId}::uuid) AS dependencies
  `);
  const rows = (result as unknown as { rows: Array<{ dependencies: unknown }> }).rows;
  return Array.isArray(rows[0]?.dependencies) ? rows[0].dependencies : [];
}

function restoreContact(before: Record<string, unknown>): Partial<typeof schema.contacts.$inferInsert> {
  const result: Record<string, unknown> = {};
  for (const field of CONTACT_FIELDS) if (before[field] !== undefined) result[field] = before[field];
  if (before.isCustomer !== undefined) result.isCustomer = before.isCustomer;
  if (before.isVendor !== undefined) result.isVendor = before.isVendor;
  return result as Partial<typeof schema.contacts.$inferInsert>;
}

function restoreProduct(before: Record<string, unknown>): Partial<typeof schema.products.$inferInsert> {
  const result: Record<string, unknown> = {};
  for (const field of PRODUCT_FIELDS) if (before[field] !== undefined) result[field] = before[field];
  return result as Partial<typeof schema.products.$inferInsert>;
}

async function appendRowIssues(tx: DB, issues: Array<{ rowId: string; issue: MigrationRowIssue }>): Promise<void> {
  for (const entry of issues) {
    await tx.update(schema.migrationRows).set({
      errorsJson: sql`${schema.migrationRows.errorsJson} || ${JSON.stringify([entry.issue])}::jsonb`,
    }).where(eq(schema.migrationRows.id, entry.rowId));
  }
}

export async function rollbackJob(input: {
  tenantId: string;
  actorUserId: string;
  jobId: string;
  ip?: string | null;
}) {
  const result = await db.transaction(async (tx) => {
    const job = await lockedJob(tx, input.tenantId, input.jobId);
    if (job.status !== "completed") throw conflict("Only a completed migration job can be rolled back");
    const state = mappingState(job);
    const rows = await tx.select().from(schema.migrationRows).where(and(
      eq(schema.migrationRows.jobId, job.id), eq(schema.migrationRows.status, "imported"),
    )).orderBy(asc(schema.migrationRows.rowNumber));
    const blockers: Array<{ rowId: string; rowNumber: number; issue: MigrationRowIssue }> = [];
    const currentByRow = new Map<string, CanonicalRow>();
    for (const row of rows) {
      if (!row.createdRecordId || !row.afterJson || !row.importOperation) {
        blockers.push({ rowId: row.id, rowNumber: row.rowNumber, issue: {
          code: "rollback_blocked", field: "$", message: "Import evidence is incomplete",
        } });
        continue;
      }
      const current = await currentCanonical(tx, input.tenantId, job.objectType, row.createdRecordId);
      if (!current) {
        if (row.importOperation === "created") continue;
        blockers.push({ rowId: row.id, rowNumber: row.rowNumber, issue: {
          code: "rollback_blocked", field: "$", message: "Updated record no longer exists",
        } });
        continue;
      }
      currentByRow.set(row.id, current);
      if (!recordsEqual(recordJson(current), row.afterJson)) {
        blockers.push({ rowId: row.id, rowNumber: row.rowNumber, issue: {
          code: "rollback_blocked", field: "$", message: "Record changed after import",
        } });
        continue;
      }
      if (row.importOperation === "created") {
        const dependencies = await dependencyReasons(tx, job.objectType, current.id);
        if (dependencies.length) {
          blockers.push({ rowId: row.id, rowNumber: row.rowNumber, issue: {
            code: "rollback_blocked", field: "$", message: "Imported record has dependent records",
            details: { dependencies },
          } });
        }
      }
    }
    if (blockers.length) {
      await appendRowIssues(tx, blockers.map((blocker) => ({ rowId: blocker.rowId, issue: blocker.issue })));
      await tx.update(schema.migrationJobs).set({
        mappingJson: {
          ...state,
          lastFailure: { stage: "rollback", message: "Rollback blocked; no records were changed", at: new Date().toISOString() },
        },
      }).where(eq(schema.migrationJobs.id, job.id));
      await audit(tx, input.tenantId, input.actorUserId, "migration_job.rollback_blocked", "migration_job", job.id, {
        objectType: job.objectType,
        blockedRows: blockers.map((blocker) => blocker.rowNumber),
      });
      return { blocked: true as const, blockers };
    }

    for (const row of rows.filter((value) => value.importOperation === "updated")) {
      if (!row.beforeJson || !row.createdRecordId) throw conflict("Updated row is missing rollback evidence");
      const current = currentByRow.get(row.id);
      if (!current) throw conflict("Updated record is unavailable for rollback");
      if (job.objectType === "Product") {
        const [restored] = await tx.update(schema.products).set(restoreProduct(row.beforeJson))
          .where(and(eq(schema.products.id, current.id), eq(schema.products.tenantId, input.tenantId))).returning();
        await autoAuditMutation(tx, {
          tenantId: input.tenantId, actorId: input.actorUserId, actorType: "user",
          action: "product.updated", objectType: "Product", objectId: restored.id,
          before: current, after: restored, ip: input.ip,
        });
      } else {
        const [restored] = await tx.update(schema.contacts).set(restoreContact(row.beforeJson))
          .where(and(eq(schema.contacts.id, current.id), eq(schema.contacts.tenantId, input.tenantId))).returning();
        await autoAuditContactRoles(tx, {
          tenantId: input.tenantId, actorId: input.actorUserId, action: "updated",
          objectId: restored.id, before: current, after: restored, ip: input.ip,
        });
      }
    }

    const createdRows = rows.filter((value) => value.importOperation === "created" && value.createdRecordId);
    for (const row of createdRows) {
      const current = currentByRow.get(row.id);
      if (!current) continue;
      if (job.objectType === "Product") {
        await autoAuditMutation(tx, {
          tenantId: input.tenantId, actorId: input.actorUserId, actorType: "user",
          action: "product.deleted", objectType: "Product", objectId: current.id,
          before: current, after: null, ip: input.ip,
        });
      } else {
        await autoAuditContactRoles(tx, {
          tenantId: input.tenantId, actorId: input.actorUserId, action: "deleted",
          objectId: current.id, before: current, after: null, ip: input.ip,
        });
      }
    }
    const createdIds = createdRows.map((row) => row.createdRecordId!).filter(Boolean);
    if (createdIds.length) {
      if (job.objectType === "Product") {
        await tx.delete(schema.products).where(and(
          eq(schema.products.tenantId, input.tenantId), inArray(schema.products.id, createdIds),
        ));
      } else {
        await tx.delete(schema.contacts).where(and(
          eq(schema.contacts.tenantId, input.tenantId), inArray(schema.contacts.id, createdIds),
        ));
      }
    }
    await tx.update(schema.migrationRows).set({
      status: "skipped",
      errorsJson: sql`${schema.migrationRows.errorsJson} || ${JSON.stringify([{
        code: "rolled_back", field: "$", message: "Imported change was rolled back",
      }])}::jsonb`,
    }).where(and(eq(schema.migrationRows.jobId, job.id), eq(schema.migrationRows.status, "imported")));
    const [rolledBack] = await tx.update(schema.migrationJobs).set({
      status: "rolled_back",
      mappingJson: { ...state, lastFailure: undefined },
      completedAt: new Date(),
    }).where(eq(schema.migrationJobs.id, job.id)).returning();
    await audit(tx, input.tenantId, input.actorUserId, "migration_job.rolled_back", "migration_job", job.id, {
      objectType: job.objectType,
      createdRecordsDeleted: createdIds.length,
      updatedRecordsRestored: rows.filter((row) => row.importOperation === "updated").length,
    });
    return { blocked: false as const, job: rolledBack };
  });
  if (result.blocked) {
    throw conflict(`Rollback blocked for ${result.blockers.length} row(s); no records were changed`);
  }
  return result.job;
}
