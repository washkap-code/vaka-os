import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { badRequest, conflict, db, notFound, schema, type DB } from "./lib.js";
import { recordAuditInTransaction } from "./platform/audit-facade.js";

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

export const warehouseCreateSchema = z.object({
  name: optionalText(160),
  address: optionalText(500),
  isDefault: z.boolean().optional(),
}).strict().refine((value) => Boolean(value.name?.trim() || value.address?.trim()), {
  message: "Enter a location name or address",
});

export const warehouseUpdateSchema = z.object({
  name: optionalText(160),
  address: optionalText(500),
  isDefault: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "Provide at least one location change",
});

type WarehouseCreateInput = z.infer<typeof warehouseCreateSchema>;
type WarehouseUpdateInput = z.infer<typeof warehouseUpdateSchema>;

type WarehouseCapacity = {
  planName: string;
  mode: "FINITE" | "CONTRACTED";
  used: number;
  limit: number | null;
  remaining: number | null;
  atLimit: boolean;
  overLimit: boolean;
};

function normaliseText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function warehouseNameFromAddress(address: string | null | undefined): string | null {
  return address?.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null;
}

function planLocationLimit(features: unknown): number | null {
  if (!features || typeof features !== "object" || Array.isArray(features)) return null;
  const value = (features as Record<string, unknown>).inventoryLocations;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

async function lockTenant(tx: DB, tenantId: string) {
  const [tenant] = await tx.select({ id: schema.tenants.id }).from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId)).for("update");
  if (!tenant) throw notFound("Workspace not found");
}

async function loadPlan(tx: DB, tenantId: string) {
  const [row] = await tx.select({
    planName: schema.plans.name,
    features: schema.plans.features,
  }).from(schema.subscriptions)
    .innerJoin(schema.plans, eq(schema.plans.id, schema.subscriptions.planId))
    .where(eq(schema.subscriptions.tenantId, tenantId))
    .limit(1);
  if (!row) throw conflict("A subscription plan is required before locations can be managed");
  return { ...row, limit: planLocationLimit(row.features) };
}

async function listRows(tx: DB, tenantId: string) {
  return tx.select().from(schema.warehouses)
    .where(eq(schema.warehouses.tenantId, tenantId))
    .orderBy(desc(schema.warehouses.isDefault), asc(schema.warehouses.name), asc(schema.warehouses.id));
}

function capacity(planName: string, limit: number | null, used: number): WarehouseCapacity {
  return {
    planName,
    mode: limit === null ? "CONTRACTED" : "FINITE",
    used,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
    atLimit: limit !== null && used >= limit,
    overLimit: limit !== null && used > limit,
  };
}

async function assertUniqueName(tx: DB, tenantId: string, name: string, excludeId?: string) {
  const predicates = [
    eq(schema.warehouses.tenantId, tenantId),
    sql`lower(${schema.warehouses.name}) = lower(${name})`,
  ];
  if (excludeId) predicates.push(ne(schema.warehouses.id, excludeId));
  const [existing] = await tx.select({ id: schema.warehouses.id }).from(schema.warehouses)
    .where(and(...predicates)).limit(1);
  if (existing) throw conflict("A stock location with this name already exists");
}

export async function getWarehouseSettings(tenantId: string) {
  const [plan, warehouses] = await Promise.all([loadPlan(db, tenantId), listRows(db, tenantId)]);
  return { warehouses, capacity: capacity(plan.planName, plan.limit, warehouses.length) };
}

export async function createWarehouse(opts: {
  tenantId: string;
  actorUserId: string;
  input: WarehouseCreateInput;
}) {
  return db.transaction(async (tx) => {
    await lockTenant(tx, opts.tenantId);
    const plan = await loadPlan(tx, opts.tenantId);
    const existing = await listRows(tx, opts.tenantId);
    const currentCapacity = capacity(plan.planName, plan.limit, existing.length);
    if (currentCapacity.atLimit) {
      throw conflict(`${plan.planName} supports ${plan.limit} stock ${plan.limit === 1 ? "location" : "locations"}. Upgrade or contact VAKA before adding another.`);
    }

    const address = normaliseText(opts.input.address);
    const name = normaliseText(opts.input.name) ?? warehouseNameFromAddress(address);
    if (!name) throw badRequest("Enter a location name or address");
    if (name.length > 160) throw badRequest("Location name must be 160 characters or fewer");
    await assertUniqueName(tx, opts.tenantId, name);

    const isDefault = opts.input.isDefault === true || existing.length === 0;
    if (isDefault) {
      await tx.update(schema.warehouses).set({ isDefault: false })
        .where(eq(schema.warehouses.tenantId, opts.tenantId));
    }
    const [warehouse] = await tx.insert(schema.warehouses).values({
      tenantId: opts.tenantId,
      name,
      address,
      isDefault,
    }).returning();
    await recordAuditInTransaction(tx, {
      tenantId: opts.tenantId,
      actorUserId: opts.actorUserId,
      action: "warehouse.created",
      entityType: "warehouse",
      entityId: warehouse.id,
      metadata: {
        name: warehouse.name,
        addressConfigured: Boolean(warehouse.address),
        isDefault: warehouse.isDefault,
        planName: plan.planName,
        locationCount: existing.length + 1,
        locationLimit: plan.limit,
      },
    });
    return {
      warehouse,
      capacity: capacity(plan.planName, plan.limit, existing.length + 1),
    };
  });
}

export async function updateWarehouse(opts: {
  tenantId: string;
  actorUserId: string;
  warehouseId: string;
  input: WarehouseUpdateInput;
}) {
  return db.transaction(async (tx) => {
    await lockTenant(tx, opts.tenantId);
    const [existing] = await tx.select().from(schema.warehouses).where(and(
      eq(schema.warehouses.id, opts.warehouseId),
      eq(schema.warehouses.tenantId, opts.tenantId),
    )).for("update");
    if (!existing) throw notFound("Stock location not found");
    if (existing.isDefault && opts.input.isDefault === false) {
      throw conflict("Choose another default location before removing this default");
    }

    const address = opts.input.address === undefined ? existing.address : normaliseText(opts.input.address);
    const name = opts.input.name === undefined
      ? existing.name
      : normaliseText(opts.input.name) ?? warehouseNameFromAddress(address);
    if (!name) throw badRequest("Enter a location name or address");
    if (name.length > 160) throw badRequest("Location name must be 160 characters or fewer");
    await assertUniqueName(tx, opts.tenantId, name, existing.id);

    if (opts.input.isDefault === true && !existing.isDefault) {
      await tx.update(schema.warehouses).set({ isDefault: false })
        .where(eq(schema.warehouses.tenantId, opts.tenantId));
    }
    const [warehouse] = await tx.update(schema.warehouses).set({
      name,
      address,
      isDefault: opts.input.isDefault ?? existing.isDefault,
    }).where(and(
      eq(schema.warehouses.id, existing.id),
      eq(schema.warehouses.tenantId, opts.tenantId),
    )).returning();

    const changedFields = (["name", "address", "isDefault"] as const).filter((field) => {
      if (field === "name") return existing.name !== warehouse.name;
      if (field === "address") return existing.address !== warehouse.address;
      return existing.isDefault !== warehouse.isDefault;
    });
    if (changedFields.length > 0) {
      await recordAuditInTransaction(tx, {
        tenantId: opts.tenantId,
        actorUserId: opts.actorUserId,
        action: "warehouse.updated",
        entityType: "warehouse",
        entityId: warehouse.id,
        metadata: {
          changedFields,
          becameDefault: !existing.isDefault && warehouse.isDefault,
          addressConfigured: Boolean(warehouse.address),
        },
      });
    }
    return warehouse;
  });
}
