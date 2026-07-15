// ============================================================================
// PW-002 TESTS — configurable approval policies.
//   1. Kernel evaluation: thresholds, permission, second person, fail-closed
//   2. Settings CRUD: permission gate, validation, audit, catalogue check
//   3. Purchase orders: blocked below/above threshold as configured
//   4. Payroll: preparer cannot post own run under policy; second poster can
//   5. Removing the policy restores prior behaviour
// ============================================================================
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it, beforeAll } from "vitest";
import { createApp } from "../src/app.js";
import { login } from "../src/auth.js";
import { db, schema, toCents } from "../src/lib.js";
import { ApprovalPolicyViolationError, ApprovalService } from "../src/platform/workflow/approvals.js";
import {
  createContact, createProduct, defaultWarehouse, signupFinanceTenant, type TestTenant,
} from "./finance/helpers.js";

const app = createApp();
const runId = `ap${Date.now().toString(36)}`;
const service = new ApprovalService();

async function createRoleUser(tenant: TestTenant, roleName: string, label: string) {
  const [tenantRecord] = await db.select({ subdomain: schema.tenants.subdomain })
    .from(schema.tenants).where(eq(schema.tenants.id, tenant.tenantId));
  const roles = await db.select().from(schema.roles).where(eq(schema.roles.tenantId, tenant.tenantId));
  const role = roles.find((candidate) => candidate.name === roleName);
  expect(role, `Missing ${roleName} role`).toBeTruthy();
  const email = `ap-${runId}-${label}@test.vaka`;
  const password = "Approval-Test-123!";
  const [user] = await db.insert(schema.users).values({
    tenantId: tenant.tenantId, email, fullName: `${roleName} ${label}`,
    passwordHash: await bcrypt.hash(password, 4),
    roleId: role!.id, mustChangePassword: false, status: "active",
  }).returning();
  const session = await login(email, password, tenantRecord.subdomain);
  return { id: user.id, auth: { Authorization: `Bearer ${session.token}` } };
}

describe("kernel policy evaluation", () => {
  const base = {
    subjectLabel: "purchase order",
    actorUserId: "actor-1",
    actorPermissions: ["procurement.approve"],
    subjectCreatedBy: "creator-1",
  };

  it("is a no-op with no policy or below the threshold", () => {
    expect(() => service.evaluatePolicy({ ...base, policy: null, amountCents: toCents("999999") })).not.toThrow();
    expect(() => service.evaluatePolicy({
      ...base, amountCents: toCents("499.99"),
      policy: { thresholdCents: toCents("500"), requiredPermission: "accounting.post", requireDistinctActor: true },
    })).not.toThrow();
  });

  it("requires the configured permission at/above the threshold", () => {
    const policy = { thresholdCents: toCents("500"), requiredPermission: "accounting.post", requireDistinctActor: false };
    expect(() => service.evaluatePolicy({ ...base, policy, amountCents: toCents("500.00") }))
      .toThrow(/requires the 'accounting.post' permission/);
    expect(() => service.evaluatePolicy({
      ...base, policy, amountCents: toCents("500.00"),
      actorPermissions: ["accounting.post"],
    })).not.toThrow();
  });

  it("requires a second person and fails closed when the preparer is unknown", () => {
    const policy = { thresholdCents: 0n, requiredPermission: null, requireDistinctActor: true };
    expect(() => service.evaluatePolicy({
      ...base, policy, amountCents: 1n, subjectCreatedBy: "actor-1",
    })).toThrow(/second person must approve/);
    expect(() => service.evaluatePolicy({
      ...base, policy, amountCents: 1n, subjectCreatedBy: null,
    })).toThrow(/preparer cannot be established/);
    expect(() => service.evaluatePolicy({
      ...base, policy, amountCents: 1n, subjectCreatedBy: "someone-else",
    })).not.toThrow();
    expect(ApprovalPolicyViolationError).toBeTruthy();
  });
});

describe("settings CRUD", () => {
  let tenant: TestTenant;
  beforeAll(async () => { tenant = await signupFinanceTenant(`${runId}-crud`); });

  it("lists both subjects unconfigured by default", async () => {
    const res = await request(app).get("/api/v1/settings/approval-policies").set(tenant.auth);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.every((p: any) => p.configured === false)).toBe(true);
  });

  it("rejects empty policies, unknown permissions and unknown subjects", async () => {
    const empty = await request(app).put("/api/v1/settings/approval-policies/purchase_order")
      .set(tenant.auth).send({ thresholdAmount: "100.00", requiredPermission: null, requireDistinctActor: false });
    expect(empty.status).toBe(400);
    const badPerm = await request(app).put("/api/v1/settings/approval-policies/purchase_order")
      .set(tenant.auth).send({ thresholdAmount: "100.00", requiredPermission: "not.a.permission", requireDistinctActor: false });
    expect(badPerm.status).toBe(400);
    const badSubject = await request(app).put("/api/v1/settings/approval-policies/invoice")
      .set(tenant.auth).send({ thresholdAmount: "100.00", requiredPermission: null, requireDistinctActor: true });
    expect(badSubject.status).toBe(400);
  });

  it("upserts, audits and removes a policy (settings.manage required)", async () => {
    const sales = await createRoleUser(tenant, "Sales", "crud-sales");
    const denied = await request(app).put("/api/v1/settings/approval-policies/payroll_run")
      .set(sales.auth).send({ thresholdAmount: "0.00", requiredPermission: null, requireDistinctActor: true });
    expect(denied.status).toBe(403);

    const set = await request(app).put("/api/v1/settings/approval-policies/payroll_run")
      .set(tenant.auth).send({ thresholdAmount: "0.00", requiredPermission: null, requireDistinctActor: true });
    expect(set.status).toBe(200);
    const configured = set.body.find((p: any) => p.subjectType === "payroll_run");
    expect(configured).toMatchObject({ configured: true, requireDistinctActor: true });

    const events = await db.select().from(schema.auditLogs)
      .where(eq(schema.auditLogs.tenantId, tenant.tenantId));
    expect(events.some((event) => event.action === "approval_policy.updated")).toBe(true);

    const removed = await request(app).delete("/api/v1/settings/approval-policies/payroll_run").set(tenant.auth);
    expect(removed.status).toBe(200);
    expect(removed.body.find((p: any) => p.subjectType === "payroll_run").configured).toBe(false);
    const removeAgain = await request(app).delete("/api/v1/settings/approval-policies/payroll_run").set(tenant.auth);
    expect(removeAgain.status).toBe(400);
  });
});

describe("purchase-order threshold enforcement", () => {
  it("blocks approval at/above the threshold without the extra permission", async () => {
    const tenant = await signupFinanceTenant(`${runId}-po`);
    const warehouse = await defaultWarehouse(tenant);
    const product = await createProduct(tenant, `${runId}-po`, { costPrice: "1.00", salePrice: "2.00", trackStock: true });
    const supplier = await createContact(tenant, `Supplier ${runId}`, { isVendor: true, isCustomer: false });
    const approver = await createRoleUser(tenant, "Procurement Approver", "po-approver");

    // Policy: POs of $100+ additionally require accounting.post (approver lacks it).
    const set = await request(app).put("/api/v1/settings/approval-policies/purchase_order")
      .set(tenant.auth).send({ thresholdAmount: "100.00", requiredPermission: "accounting.post", requireDistinctActor: false });
    expect(set.status).toBe(200);

    const smallDraft = await request(app).post("/api/v1/purchase-orders").set(tenant.auth).send({
      vendorContactId: supplier.id, currency: "USD", rateToBase: "1",
      lines: [{ productId: product.id, warehouseId: warehouse.id, quantity: "10", unitCost: "5.00" }],
    });
    expect(smallDraft.status).toBe(200); // $50 — below threshold
    const smallApprove = await request(app).post(`/api/v1/purchase-orders/${smallDraft.body.id}/approve`)
      .set(approver.auth).send({ reason: "Below the policy threshold" });
    expect(smallApprove.status).toBe(200);

    const bigDraft = await request(app).post("/api/v1/purchase-orders").set(tenant.auth).send({
      vendorContactId: supplier.id, currency: "USD", rateToBase: "1",
      lines: [{ productId: product.id, warehouseId: warehouse.id, quantity: "10", unitCost: "50.00" }],
    });
    expect(bigDraft.status).toBe(200); // $500 — at/above threshold
    const bigApprove = await request(app).post(`/api/v1/purchase-orders/${bigDraft.body.id}/approve`)
      .set(approver.auth).send({ reason: "Above the policy threshold" });
    expect(bigApprove.status).toBe(409);
    expect(bigApprove.body.message).toMatch(/requires the 'accounting.post' permission/);

    // Owner holds every permission (and is not the PO creator? The owner IS
    // the creator — use the distinct-actor-free policy: owner has
    // accounting.post but is the creator; hard SoD from PW-001 still blocks.
    const ownerApprove = await request(app).post(`/api/v1/purchase-orders/${bigDraft.body.id}/approve`)
      .set(tenant.auth).send({ reason: "Creator self-approval must still fail" });
    expect(ownerApprove.status).toBe(409);
    expect(ownerApprove.body.message).toMatch(/cannot approve their own/);

    // Removing the policy restores the approver's authority.
    await request(app).delete("/api/v1/settings/approval-policies/purchase_order").set(tenant.auth);
    const retry = await request(app).post(`/api/v1/purchase-orders/${bigDraft.body.id}/approve`)
      .set(approver.auth).send({ reason: "Policy removed" });
    expect(retry.status).toBe(200);
  });
});

describe("payroll second-person enforcement", () => {
  it("stops the preparer posting their own run while a second poster succeeds", async () => {
    const tenant = await signupFinanceTenant(`${runId}-pay`);
    const employee = await request(app).post("/api/v1/payroll/employees").set(tenant.auth).send({
      employeeNumber: "E100", firstName: "Rudo", lastName: "Ncube",
      currency: "USD", basicSalary: "800.00",
    });
    expect(employee.status).toBe(200);
    const run = await request(app).post("/api/v1/payroll/runs").set(tenant.auth).send({ month: "2026-05" });
    expect(run.status).toBe(200); // prepared by the Owner

    const set = await request(app).put("/api/v1/settings/approval-policies/payroll_run")
      .set(tenant.auth).send({ thresholdAmount: "0.00", requiredPermission: null, requireDistinctActor: true });
    expect(set.status).toBe(200);

    const selfPost = await request(app).post(`/api/v1/payroll/runs/${run.body.id}/post`).set(tenant.auth);
    expect(selfPost.status).toBe(409);
    expect(selfPost.body.message).toMatch(/second person must approve this payroll run/);

    const accountant = await createRoleUser(tenant, "Accountant", "pay-poster");
    const secondPost = await request(app).post(`/api/v1/payroll/runs/${run.body.id}/post`).set(accountant.auth);
    expect(secondPost.status).toBe(200);
    expect(secondPost.body.status).toBe("POSTED");
  });
});
