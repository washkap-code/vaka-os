import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { audit, conflict, db, notFound, schema, type DB } from "./lib.js";
import { queuePartyRoleEvents } from "./party-events.js";
import { runWithPostCommitEvents } from "./platform/events/index.js";

const nullableText = (max: number) => z.string().trim().max(max).optional().nullable();
const supplierCode = z.string().trim().min(1).max(50)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, "Supplier code contains unsupported characters")
  .optional().nullable();
const boundedDays = z.number().int().min(0).max(3650).optional().nullable();

export const supplierCreateSchema = z.object({
  type: z.enum(["INDIVIDUAL", "COMPANY"]).default("COMPANY"),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(254).optional().nullable(),
  phone: nullableText(50),
  address: nullableText(500),
  addressLine1: nullableText(200),
  addressLine2: nullableText(200),
  city: nullableText(100),
  region: nullableText(100),
  postalCode: nullableText(30),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional().nullable(),
  website: z.string().trim().url().max(500).optional().nullable(),
  industry: nullableText(100),
  registrationNumber: nullableText(100),
  notes: nullableText(5000),
  taxNumber: nullableText(100),
  tags: z.array(z.string().trim().min(1).max(50)).max(50).default([]),
  isCustomer: z.boolean().default(false),
  supplierCode,
  supplierCurrency: z.enum(["USD", "ZWG"]).optional().nullable(),
  supplierPaymentTermsDays: boundedDays,
  supplierLeadTimeDays: boundedDays,
}).strict();

export const supplierUpdateSchema = supplierCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one supplier field is required",
);

type SupplierCreate = z.infer<typeof supplierCreateSchema>;
type SupplierUpdate = z.infer<typeof supplierUpdateSchema>;

function isSupplierCodeConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; constraint?: unknown; cause?: unknown };
  if (candidate.code === "23505" && candidate.constraint === "contacts_tenant_active_supplier_code") return true;
  return candidate.cause ? isSupplierCodeConflict(candidate.cause) : false;
}

async function ensureSupplierCodeAvailable(
  tx: DB,
  tenantId: string,
  code: string | null | undefined,
  excludeContactId?: string,
): Promise<void> {
  if (!code) return;
  const predicates = [
    eq(schema.contacts.tenantId, tenantId),
    isNull(schema.contacts.deletedAt),
    sql`lower(${schema.contacts.supplierCode}) = lower(${code})`,
  ];
  if (excludeContactId) predicates.push(ne(schema.contacts.id, excludeContactId));
  const [existing] = await tx.select({ id: schema.contacts.id }).from(schema.contacts)
    .where(and(...predicates)).limit(1);
  if (existing) throw conflict("Supplier code is already in use");
}

export async function listSuppliers(tenantId: string) {
  return db.select().from(schema.contacts).where(and(
    eq(schema.contacts.tenantId, tenantId),
    eq(schema.contacts.isVendor, true),
    isNull(schema.contacts.deletedAt),
  )).orderBy(asc(schema.contacts.name));
}

export async function getSupplier(tenantId: string, supplierId: string) {
  const [supplier] = await db.select().from(schema.contacts).where(and(
    eq(schema.contacts.id, supplierId),
    eq(schema.contacts.tenantId, tenantId),
    eq(schema.contacts.isVendor, true),
    isNull(schema.contacts.deletedAt),
  ));
  if (!supplier) throw notFound("Supplier not found");
  return supplier;
}

export async function assertActiveSupplier(tx: DB, tenantId: string, supplierId: string) {
  const [supplier] = await tx.select().from(schema.contacts).where(and(
    eq(schema.contacts.id, supplierId),
    eq(schema.contacts.tenantId, tenantId),
    eq(schema.contacts.isVendor, true),
    isNull(schema.contacts.deletedAt),
  ));
  if (!supplier) throw notFound("Supplier not found");
  return supplier;
}

export async function createSupplier(opts: {
  tenantId: string;
  actorUserId: string;
  input: SupplierCreate;
}) {
  try {
    return await runWithPostCommitEvents((queue) => db.transaction(async (tx) => {
      await ensureSupplierCodeAvailable(tx, opts.tenantId, opts.input.supplierCode);
      const [supplier] = await tx.insert(schema.contacts).values({
        ...opts.input,
        tenantId: opts.tenantId,
        isVendor: true,
        ownerUserId: opts.actorUserId,
      }).returning();
      await audit(tx, opts.tenantId, opts.actorUserId, "supplier.created", "contact", supplier.id, {
        isCustomer: supplier.isCustomer,
        supplierCodeConfigured: Boolean(supplier.supplierCode),
      });
      queuePartyRoleEvents(queue, {
        tenantId: opts.tenantId,
        actorUserId: opts.actorUserId,
        contactId: supplier.id,
        change: "created",
        after: supplier,
      });
      return supplier;
    }));
  } catch (error) {
    if (isSupplierCodeConflict(error)) throw conflict("Supplier code is already in use");
    throw error;
  }
}

export async function updateSupplier(opts: {
  tenantId: string;
  actorUserId: string;
  supplierId: string;
  input: SupplierUpdate;
}) {
  try {
    return await runWithPostCommitEvents((queue) => db.transaction(async (tx) => {
      const before = await assertActiveSupplier(tx, opts.tenantId, opts.supplierId);
      await ensureSupplierCodeAvailable(tx, opts.tenantId, opts.input.supplierCode, before.id);
      const [supplier] = await tx.update(schema.contacts).set(opts.input).where(and(
        eq(schema.contacts.id, before.id),
        eq(schema.contacts.tenantId, opts.tenantId),
        eq(schema.contacts.isVendor, true),
        isNull(schema.contacts.deletedAt),
      )).returning();
      if (!supplier) throw notFound("Supplier not found");
      await audit(tx, opts.tenantId, opts.actorUserId, "supplier.updated", "contact", supplier.id, {
        isCustomer: supplier.isCustomer,
        supplierCodeConfigured: Boolean(supplier.supplierCode),
      });
      queuePartyRoleEvents(queue, {
        tenantId: opts.tenantId,
        actorUserId: opts.actorUserId,
        contactId: supplier.id,
        change: "updated",
        before,
        after: supplier,
      });
      return supplier;
    }));
  } catch (error) {
    if (isSupplierCodeConflict(error)) throw conflict("Supplier code is already in use");
    throw error;
  }
}
