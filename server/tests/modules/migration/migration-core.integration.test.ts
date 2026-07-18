import bcrypt from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { login } from "../../../src/auth.js";
import { db, schema } from "../../../src/lib.js";

const app = createApp();
const unique = `p15${Date.now().toString(36)}`;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

interface TestTenant { tenantId: string; token: string; userId: string }

let tenantA: TestTenant;
let tenantB: TestTenant;

async function createTenant(suffix: string): Promise<TestTenant> {
  const response = await request(app).post("/api/v1/auth/signup").send({
    companyName: `P15 Migration ${suffix} ${unique}`,
    subdomain: `${unique}-${suffix}`,
    baseCurrency: "USD",
    ownerEmail: `owner-${suffix}-${unique}@test.vaka`,
    ownerPassword: "Migration-Test-Owner-123!",
    ownerName: `Owner ${suffix}`,
  });
  expect(response.status).toBe(200);
  return {
    tenantId: response.body.tenant.id as string,
    token: response.body.token as string,
    userId: response.body.user.id as string,
  };
}

async function upload(
  tenant: TestTenant,
  objectType: "Customer" | "Supplier" | "Product",
  csvText: string,
  duplicatePolicy: "skip" | "update-existing" | "create-anyway" = "skip",
): Promise<string> {
  const response = await request(app).post("/api/v1/migration/jobs").set(bearer(tenant.token)).send({
    objectType,
    sourceFilename: `${objectType.toLowerCase()}.csv`,
    duplicatePolicy,
    csvText,
  });
  expect(response.status).toBe(200);
  return response.body.id as string;
}

async function map(
  tenant: TestTenant,
  jobId: string,
  mapping: Record<string, string>,
): Promise<void> {
  const response = await request(app).post(`/api/v1/migration/jobs/${jobId}/map`)
    .set(bearer(tenant.token)).send({ mapping });
  expect(response.status).toBe(200);
  expect(response.body.status).toBe("mapped");
}

async function validate(tenant: TestTenant, jobId: string) {
  const response = await request(app).post(`/api/v1/migration/jobs/${jobId}/validate`)
    .set(bearer(tenant.token));
  expect(response.status).toBe(200);
  return response.body as { validRows: number; errorRows: number; skippedRows: number };
}

async function importValid(tenant: TestTenant, jobId: string) {
  const response = await request(app).post(`/api/v1/migration/jobs/${jobId}/import`)
    .set(bearer(tenant.token));
  expect(response.status).toBe(200);
  return response.body as { job: { status: string }; importedRows: number; skippedRows: number };
}

beforeAll(async () => {
  tenantA = await createTenant("a");
  tenantB = await createTenant("b");
});

describe("P15-001 upload, mapping, validation, and isolation", () => {
  it("rejects malformed CSV before a job is persisted", async () => {
    const before = await db.select({ count: sql<number>`count(*)::int` }).from(schema.migrationJobs)
      .where(eq(schema.migrationJobs.tenantId, tenantA.tenantId));
    const response = await request(app).post("/api/v1/migration/jobs").set(bearer(tenantA.token)).send({
      objectType: "Customer",
      sourceFilename: "broken.csv",
      csvText: 'name,email\n"Unclosed,hello@example.com',
    });
    expect(response.status).toBe(400);
    const after = await db.select({ count: sql<number>`count(*)::int` }).from(schema.migrationJobs)
      .where(eq(schema.migrationJobs.tenantId, tenantA.tenantId));
    expect(after[0].count).toBe(before[0].count);
  });

  it("suggests deterministic mappings and rejects unknown registry targets", async () => {
    const jobId = await upload(tenantA, "Customer", "Company Name,E-mail\nMap Me,map@example.com");
    const suggested = await request(app).get(`/api/v1/migration/jobs/${jobId}/suggest-mapping`)
      .set(bearer(tenantA.token));
    expect(suggested.status).toBe(200);
    expect(suggested.body.suggestions).toEqual([
      { column: "Company Name", field: "name", score: 95, reason: "alias" },
      { column: "E-mail", field: "email", score: 100, reason: "exact" },
    ]);
    const invalid = await request(app).post(`/api/v1/migration/jobs/${jobId}/map`)
      .set(bearer(tenantA.token)).send({ mapping: { "Company Name": "passwordHash" } });
    expect(invalid.status).toBe(400);
  });

  it("stores registry validation errors per row", async () => {
    const longName = "X".repeat(201);
    const jobId = await upload(tenantA, "Customer", [
      "name,email",
      "Valid Customer,valid-customer@example.com",
      ",missing-name@example.com",
      `${longName},long-name@example.com`,
    ].join("\n"));
    await map(tenantA, jobId, { name: "name", email: "email" });
    expect(await validate(tenantA, jobId)).toEqual({ validRows: 1, errorRows: 2, skippedRows: 0 });
    const rows = await request(app).get(`/api/v1/migration/jobs/${jobId}/rows`)
      .set(bearer(tenantA.token));
    expect(rows.status).toBe(200);
    expect(rows.body.rows.map((row: { status: string }) => row.status)).toEqual(["valid", "error", "error"]);
    expect(rows.body.rows[1].errorsJson).toContainEqual(expect.objectContaining({ field: "name", code: "required" }));
    expect(rows.body.rows[2].errorsJson).toContainEqual(expect.objectContaining({ field: "name", code: "max_length" }));
  });

  it("enforces migration:run and never exposes another tenant's job", async () => {
    const [salesRole] = await db.select().from(schema.roles).where(and(
      eq(schema.roles.tenantId, tenantA.tenantId), eq(schema.roles.name, "Sales"),
    ));
    const email = `sales-${unique}@test.vaka`;
    const password = "Migration-Test-Sales-123!";
    await db.insert(schema.users).values({
      tenantId: tenantA.tenantId,
      roleId: salesRole.id,
      email,
      fullName: "Migration Sales",
      passwordHash: await bcrypt.hash(password, 4),
    });
    const [tenant] = await db.select({ subdomain: schema.tenants.subdomain }).from(schema.tenants)
      .where(eq(schema.tenants.id, tenantA.tenantId));
    const salesToken = (await login(email, password, tenant.subdomain)).token;
    expect((await request(app).get("/api/v1/migration/jobs").set(bearer(salesToken))).status).toBe(403);

    const jobId = await upload(tenantA, "Customer", "name\nTenant A Only");
    expect((await request(app).get(`/api/v1/migration/jobs/${jobId}`).set(bearer(tenantB.token))).status).toBe(404);
    const listB = await request(app).get("/api/v1/migration/jobs").set(bearer(tenantB.token));
    expect(listB.status).toBe(200);
    expect(listB.body.jobs.some((job: { id: string }) => job.id === jobId)).toBe(false);
  });
});

describe("P15-001 duplicate policies and reversible imports", () => {
  it("skips natural-key duplicates and completes with row-accurate status", async () => {
    await db.insert(schema.contacts).values({
      tenantId: tenantA.tenantId,
      ownerUserId: tenantA.userId,
      name: "Existing Skip Customer",
      email: `skip-${unique}@example.com`,
      isCustomer: true,
    });
    const jobId = await upload(tenantA, "Customer", `name,email\nDuplicate,skip-${unique}@example.com`);
    await map(tenantA, jobId, { name: "name", email: "email" });
    expect(await validate(tenantA, jobId)).toEqual({ validRows: 0, errorRows: 0, skippedRows: 1 });
    const imported = await importValid(tenantA, jobId);
    expect(imported).toMatchObject({ job: { status: "completed" }, importedRows: 0, skippedRows: 1 });
  });

  it("updates an existing record and clean rollback restores the exact pre-import state", async () => {
    const [existing] = await db.insert(schema.contacts).values({
      tenantId: tenantA.tenantId,
      ownerUserId: tenantA.userId,
      name: "Original Update Name",
      email: `update-${unique}@example.com`,
      isCustomer: true,
    }).returning();
    const jobId = await upload(
      tenantA,
      "Customer",
      `name,email\nImported Update Name,update-${unique}@example.com`,
      "update-existing",
    );
    await map(tenantA, jobId, { name: "name", email: "email" });
    expect(await validate(tenantA, jobId)).toEqual({ validRows: 1, errorRows: 0, skippedRows: 0 });
    expect(await importValid(tenantA, jobId)).toMatchObject({ importedRows: 1 });
    expect((await db.select().from(schema.contacts).where(eq(schema.contacts.id, existing.id)))[0].name)
      .toBe("Imported Update Name");

    const rollback = await request(app).post(`/api/v1/migration/jobs/${jobId}/rollback`)
      .set(bearer(tenantA.token));
    expect(rollback.status).toBe(200);
    expect(rollback.body.status).toBe("rolled_back");
    expect((await db.select().from(schema.contacts).where(eq(schema.contacts.id, existing.id)))[0].name)
      .toBe("Original Update Name");
  });

  it("allows create-anyway for contact natural keys", async () => {
    const email = `create-anyway-${unique}@example.com`;
    await db.insert(schema.contacts).values({
      tenantId: tenantA.tenantId, ownerUserId: tenantA.userId,
      name: "Create Anyway Existing", email, isCustomer: true,
    });
    const jobId = await upload(tenantA, "Supplier", `name,email\nCreate Anyway Supplier,${email}`, "create-anyway");
    await map(tenantA, jobId, { name: "name", email: "email" });
    expect(await validate(tenantA, jobId)).toEqual({ validRows: 1, errorRows: 0, skippedRows: 0 });
    expect(await importValid(tenantA, jobId)).toMatchObject({ importedRows: 1 });
    const matches = await db.select().from(schema.contacts).where(and(
      eq(schema.contacts.tenantId, tenantA.tenantId), eq(schema.contacts.email, email),
    ));
    expect(matches).toHaveLength(2);
    expect(matches.some((contact) => contact.isVendor)).toBe(true);
  });

  it("blocks the entire rollback when an imported record has a dependent row", async () => {
    const jobId = await upload(tenantA, "Customer", `name,email\nBlocked Rollback,blocked-${unique}@example.com`);
    await map(tenantA, jobId, { name: "name", email: "email" });
    await validate(tenantA, jobId);
    await importValid(tenantA, jobId);
    const [row] = await db.select().from(schema.migrationRows).where(and(
      eq(schema.migrationRows.jobId, jobId), eq(schema.migrationRows.status, "imported"),
    ));
    await db.insert(schema.deals).values({
      tenantId: tenantA.tenantId,
      contactId: row.createdRecordId!,
      title: "Rollback dependency",
    });
    const rollback = await request(app).post(`/api/v1/migration/jobs/${jobId}/rollback`)
      .set(bearer(tenantA.token));
    expect(rollback.status).toBe(409);
    expect(rollback.body.message).toMatch(/blocked/i);
    expect(await db.select().from(schema.contacts).where(eq(schema.contacts.id, row.createdRecordId!)))
      .toHaveLength(1);
    const [staged] = await db.select().from(schema.migrationRows).where(eq(schema.migrationRows.id, row.id));
    expect(staged.status).toBe("imported");
    expect(staged.errorsJson).toContainEqual(expect.objectContaining({ code: "rollback_blocked" }));
  });
});

describe("P15-001 transaction and platform evidence", () => {
  it("rolls back the whole import transaction on a late database failure", async () => {
    const skuA = `TX-${unique}-A`;
    const skuB = `TX-${unique}-B`;
    const jobId = await upload(tenantA, "Product", `sku,name\n${skuA},First\n${skuB},Second`);
    await map(tenantA, jobId, { sku: "sku", name: "name" });
    expect(await validate(tenantA, jobId)).toEqual({ validRows: 2, errorRows: 0, skippedRows: 0 });
    const [second] = await db.select().from(schema.migrationRows).where(and(
      eq(schema.migrationRows.jobId, jobId), eq(schema.migrationRows.rowNumber, 3),
    ));
    await db.update(schema.migrationRows).set({
      mappedJson: { ...(second.mappedJson ?? {}), currency: "EUR" },
    }).where(eq(schema.migrationRows.id, second.id));
    const imported = await request(app).post(`/api/v1/migration/jobs/${jobId}/import`)
      .set(bearer(tenantA.token));
    expect(imported.status).toBe(500);
    const products = await db.select().from(schema.products).where(and(
      eq(schema.products.tenantId, tenantA.tenantId),
      sql`${schema.products.sku} IN (${skuA}, ${skuB})`,
    ));
    expect(products).toHaveLength(0);
    const [job] = await db.select().from(schema.migrationJobs).where(eq(schema.migrationJobs.id, jobId));
    expect(job.status).toBe("failed");
    expect(job.importedRows).toBe(0);
  });

  it("records one migration event plus canonical hash-chain audit evidence", async () => {
    const jobId = await upload(tenantA, "Product", `sku,name\nAUD-${unique},Audited Product`);
    await map(tenantA, jobId, { sku: "sku", name: "name" });
    await validate(tenantA, jobId);
    await importValid(tenantA, jobId);
    const [row] = await db.select().from(schema.migrationRows).where(eq(schema.migrationRows.jobId, jobId));
    const events = await db.select().from(schema.platformEvents).where(and(
      eq(schema.platformEvents.tenantId, tenantA.tenantId),
      eq(schema.platformEvents.eventType, "migration.completed"),
      eq(schema.platformEvents.objectId, jobId),
    ));
    expect(events).toHaveLength(1);
    expect(events[0].payloadJson).toMatchObject({ jobId, objectType: "Product", importedRows: 1 });
    const audits = await db.select().from(schema.auditLog).where(and(
      eq(schema.auditLog.tenantId, tenantA.tenantId),
      eq(schema.auditLog.objectType, "Product"),
      eq(schema.auditLog.objectId, row.createdRecordId!),
      eq(schema.auditLog.source, "migration"),
    ));
    expect(audits).toHaveLength(1);
    expect(audits[0].hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("P15-001 capacity boundary", () => {
  it("imports 10,000 customers with exact job and row counts", async () => {
    const prefix = `Scale ${unique}`;
    const csv = [
      "name,email",
      ...Array.from({ length: 10_000 }, (_, index) =>
        `${prefix} ${index + 1},scale-${unique}-${index + 1}@example.com`),
    ].join("\n");
    const jobId = await upload(tenantB, "Customer", csv);
    await map(tenantB, jobId, { name: "name", email: "email" });
    expect(await validate(tenantB, jobId)).toEqual({ validRows: 10_000, errorRows: 0, skippedRows: 0 });
    expect(await importValid(tenantB, jobId)).toMatchObject({ importedRows: 10_000, skippedRows: 0 });

    const [rowCounts] = await db.select({
      total: sql<number>`count(*)::int`,
      imported: sql<number>`count(*) FILTER (WHERE ${schema.migrationRows.status} = 'imported')::int`,
      evidenced: sql<number>`count(*) FILTER (WHERE ${schema.migrationRows.createdRecordId} IS NOT NULL)::int`,
    }).from(schema.migrationRows).where(eq(schema.migrationRows.jobId, jobId));
    expect(rowCounts).toEqual({ total: 10_000, imported: 10_000, evidenced: 10_000 });
    const [contactCount] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.contacts).where(and(
      eq(schema.contacts.tenantId, tenantB.tenantId),
      sql`${schema.contacts.name} LIKE ${`${prefix}%`}`,
    ));
    expect(contactCount.count).toBe(10_000);
  }, 120_000);
});
