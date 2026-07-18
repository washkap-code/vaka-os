import { and, desc, eq, sql } from "drizzle-orm";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { issueAuthenticatedSession } from "../../../src/auth.js";
import { deleteOrRequestContacts } from "../../../src/contact-records.js";
import { audit, db, schema } from "../../../src/lib.js";
import { canonicalAuditDiff, verifyAuditChain } from "../../../src/universal-audit.js";
import { AUDIT_SERVICE, platformKernel } from "../../../src/platform-runtime.js";
import { signupFinanceTenant, type TestTenant } from "../../finance/helpers.js";

const app = createApp();
const unique = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
let tenant: TestTenant;
let platformAuth: { Authorization: string };

beforeAll(async () => {
  tenant = await signupFinanceTenant("universal-audit");
  const roleKey = `AUDIT_VERIFY_${unique}`;
  await db.insert(schema.platformRoles).values({
    key: roleKey,
    name: "Audit verification operator",
    permissions: ["platform.tenant_audit.read"],
    isSystem: false,
  });
  const [operator] = await db.insert(schema.users).values({
    tenantId: null,
    email: `audit-operator-${unique}@test.vaka`,
    passwordHash: "not-used-by-audit-test",
    fullName: "Audit Verification Operator",
    isPlatformAdmin: true,
    platformRoleKey: roleKey,
    status: "active",
  }).returning();
  const session = await issueAuthenticatedSession(operator.id);
  platformAuth = { Authorization: `Bearer ${session.token}` };
});

describe("P1-006 canonical diff middleware", () => {
  it("captures changed registered fields only", () => {
    expect(canonicalAuditDiff("Customer", {
      id: "11111111-1111-4111-8111-111111111111",
      tenantId: "tenant-a",
      name: "Before",
      phone: "111",
      unknownSecret: "do-not-copy",
    }, {
      id: "11111111-1111-4111-8111-111111111111",
      tenantId: "tenant-a",
      name: "After",
      phone: "111",
      unknownSecret: "changed-secret",
    })).toEqual({
      before: { name: "Before" },
      after: { name: "After" },
      changedFields: ["name"],
    });
  });

  it("records create/update/delete diffs for every covered object CRUD path", async () => {
    const companyCreated = await db.select().from(schema.auditLog).where(and(
      eq(schema.auditLog.tenantId, tenant.tenantId),
      eq(schema.auditLog.source, "auto"),
      eq(schema.auditLog.action, "company.created"),
    ));
    expect(companyCreated).toHaveLength(1);
    expect(companyCreated[0].afterJson).toMatchObject({ companyName: expect.any(String) });

    const customer = await request(app).post("/api/v1/contacts").set(tenant.auth).send({
      type: "COMPANY", name: `Audit Customer ${unique}`, isCustomer: true, isVendor: false, tags: [],
    });
    expect(customer.status).toBe(200);
    const customerUpdated = await request(app).patch(`/api/v1/contacts/${customer.body.id}`)
      .set(tenant.auth).send({ name: `Audit Customer Updated ${unique}` });
    expect(customerUpdated.status).toBe(200);

    const supplier = await request(app).post("/api/v1/suppliers").set(tenant.auth).send({
      type: "COMPANY", name: `Audit Supplier ${unique}`, supplierCode: `SUP-${unique}`, tags: [],
    });
    expect(supplier.status).toBe(200);
    expect((await request(app).patch(`/api/v1/suppliers/${supplier.body.id}`).set(tenant.auth)
      .send({ supplierLeadTimeDays: 7 })).status).toBe(200);

    const product = await request(app).post("/api/v1/products").set(tenant.auth).send({
      sku: `AUD-${unique}`, name: `Audit Product ${unique}`, costPrice: "5.00", salePrice: "8.00",
      currency: "USD", taxTreatment: "standard", reorderLevel: 0, trackStock: false,
    });
    expect(product.status).toBe(200);
    expect((await request(app).patch(`/api/v1/products/${product.body.id}/reorder-rule`)
      .set(tenant.auth).send({ reorderLevel: 12 })).status).toBe(200);

    const employee = await request(app).post("/api/v1/payroll/employees").set(tenant.auth).send({
      employeeNumber: `UA-${unique}`.slice(0, 30), firstName: "Audit", lastName: "Employee",
      currency: "USD", basicSalary: "600.00",
    });
    expect(employee.status).toBe(200);
    expect((await request(app).patch(`/api/v1/payroll/employees/${employee.body.id}`)
      .set(tenant.auth).send({ firstName: "Audited" })).status).toBe(200);

    expect((await request(app).patch("/api/v1/settings/branding").set(tenant.auth)
      .send({ companyName: `Universal Audit Co ${unique}` })).status).toBe(200);

    await deleteOrRequestContacts({
      tenantId: tenant.tenantId,
      actorUserId: tenant.userId,
      isTenantOwner: true,
      ids: [customer.body.id],
      reason: "Universal audit deletion coverage",
    });

    const autoRows = await db.select().from(schema.auditLog).where(and(
      eq(schema.auditLog.tenantId, tenant.tenantId), eq(schema.auditLog.source, "auto"),
    ));
    const actions = autoRows.map((row) => row.action);
    expect(actions).toEqual(expect.arrayContaining([
      "customer.created", "customer.updated", "customer.deleted",
      "supplier.created", "supplier.updated",
      "product.created", "product.updated",
      "employee.created", "employee.updated",
      "company.created", "company.updated",
    ]));
    const customerDiff = autoRows.find((row) =>
      row.action === "customer.updated" && row.objectId === customer.body.id);
    expect(customerDiff?.beforeJson).toEqual({ name: `Audit Customer ${unique}` });
    expect(customerDiff?.afterJson).toEqual({ name: `Audit Customer Updated ${unique}` });
  });
});

describe("P1-006 hash chain and finance mirror", () => {
  it("writes AuditService records into the universal ledger", async () => {
    await platformKernel().container.get(AUDIT_SERVICE).record({
      tenantId: tenant.tenantId,
      actorUserId: tenant.userId,
      action: "platform.audit_service_tested",
      entityType: "customer",
      entityId: "22222222-2222-4222-8222-222222222222",
      metadata: { status: "recorded" },
    });
    const [recorded] = await db.select().from(schema.auditLog).where(and(
      eq(schema.auditLog.tenantId, tenant.tenantId),
      eq(schema.auditLog.action, "platform.audit_service_tested"),
    ));
    expect(recorded).toMatchObject({
      actorId: tenant.userId,
      actorType: "user",
      objectType: "Customer",
      objectId: "22222222-2222-4222-8222-222222222222",
      source: "legacy",
    });
  });

  it("mirrors the authoritative legacy finance audit and verifies the chain", async () => {
    await audit(db, tenant.tenantId, tenant.userId, "invoice.test_evidence", "invoice",
      "11111111-1111-4111-8111-111111111111", { amount: "42.00", currency: "USD" });
    const [mirrored] = await db.select().from(schema.auditLog).where(and(
      eq(schema.auditLog.tenantId, tenant.tenantId),
      eq(schema.auditLog.action, "invoice.test_evidence"),
    )).orderBy(desc(schema.auditLog.occurredAt)).limit(1);
    expect(mirrored).toMatchObject({
      actorType: "user", objectType: "Invoice", source: "finance",
      afterJson: { amount: "42.00", currency: "USD" },
    });
    await expect(db.update(schema.auditLog).set({ action: "forbidden-tamper" })
      .where(eq(schema.auditLog.id, mirrored.id))).rejects.toThrow();
    expect(await verifyAuditChain(tenant.tenantId)).toMatchObject({ valid: true, reason: "valid" });
  });

  it("protects the admin verification endpoint and detects break-glass tampering", async () => {
    expect((await request(app).get("/api/v1/platform/audit/verify")
      .query({ tenantId: tenant.tenantId })).status).toBe(401);
    expect((await request(app).get("/api/v1/platform/audit/verify")
      .query({ tenantId: tenant.tenantId }).set(tenant.auth)).status).toBe(400);

    const valid = await request(app).get("/api/v1/platform/audit/verify")
      .query({ tenantId: tenant.tenantId }).set(platformAuth);
    expect(valid.status).toBe(200);
    expect(valid.body).toMatchObject({ tenantId: tenant.tenantId, valid: true });

    const [target] = await db.select({ id: schema.auditLog.id }).from(schema.auditLog)
      .where(eq(schema.auditLog.tenantId, tenant.tenantId)).limit(1);
    await db.execute(sql.raw('ALTER TABLE "audit_log" DISABLE TRIGGER "audit_log_append_only"'));
    try {
      await db.update(schema.auditLog).set({ action: "tampered-for-verification-test" })
        .where(eq(schema.auditLog.id, target.id));
    } finally {
      await db.execute(sql.raw('ALTER TABLE "audit_log" ENABLE TRIGGER "audit_log_append_only"'));
    }

    const invalid = await request(app).get("/api/v1/platform/audit/verify")
      .query({ tenantId: tenant.tenantId }).set(platformAuth);
    expect(invalid.status).toBe(200);
    expect(invalid.body).toMatchObject({
      tenantId: tenant.tenantId,
      valid: false,
      brokenAt: target.id,
      reason: "hash_mismatch",
    });
  });
});
