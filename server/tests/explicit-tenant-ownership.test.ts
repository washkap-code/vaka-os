import { describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { createApp } from "../src/app.js";
import {
  changePassword, createTenantUser, login, setTenantUserStatus, signupTenant,
} from "../src/auth.js";
import { db, schema } from "../src/lib.js";

const app = createApp();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const suffix = () => `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

async function createWorkspace(label: string) {
  const unique = suffix();
  const password = "Explicit-Owner-Test-2026!";
  const result = await signupTenant({
    companyName: `${label} Workspace`,
    subdomain: `${label.toLowerCase().replace(/[^a-z]/g, "").slice(0, 8)}${unique}`.slice(0, 31),
    baseCurrency: "USD",
    ownerEmail: `${label.toLowerCase().replace(/[^a-z]/g, "")}-${unique}@test.zw`,
    ownerPassword: password,
    ownerName: `${label} Owner`,
    planName: "Growth",
  });
  return { ...result, password };
}

describe("explicit tenant ownership", () => {
  it("establishes and audits ownership atomically during signup", async () => {
    const { tenant, owner } = await createWorkspace("Established");
    const [ownership] = await db.select().from(schema.tenantOwnerships)
      .where(eq(schema.tenantOwnerships.tenantId, tenant.id));

    expect(ownership).toMatchObject({ tenantId: tenant.id, ownerUserId: owner.id });
    const [event] = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, tenant.id),
      eq(schema.auditLogs.action, "security.tenant_ownership_established"),
    ));
    expect(event).toMatchObject({
      userId: owner.id,
      entityType: "tenant_ownership",
      entityId: tenant.id,
      metadata: { source: "signup" },
    });
  });

  it("keeps owner authority when role labels change and denies a role-name lookalike", async () => {
    const { tenant, owner, password } = await createWorkspace("Authority");
    const tenantRoles = await db.select().from(schema.roles)
      .where(eq(schema.roles.tenantId, tenant.id));
    const ownerRole = tenantRoles.find((role) => role.id === owner.roleId)!;
    const stockRole = tenantRoles.find((role) => role.name === "Stock Controller")!;
    const member = await createTenantUser({
      tenantId: tenant.id,
      actorUserId: owner.id,
      email: `role-lookalike-${suffix()}@test.zw`,
      fullName: "Role Name Lookalike",
      roleId: stockRole.id,
    });

    await db.update(schema.roles).set({ name: "Principal Account Owner" })
      .where(eq(schema.roles.id, ownerRole.id));
    await db.update(schema.roles).set({ name: "Owner" })
      .where(eq(schema.roles.id, stockRole.id));

    const ownerLogin = await login(owner.email, password, tenant.subdomain);
    const ownerActivity = await request(app).get("/api/v1/security/activity")
      .set(auth(ownerLogin.token));
    expect(ownerActivity.status).toBe(200);

    const memberPassword = "Role-Lookalike-Replacement-2026!";
    await changePassword({
      userId: member.user.id,
      currentPassword: member.temporaryPassword,
      newPassword: memberPassword,
    });
    const memberLogin = await login(member.user.email, memberPassword, tenant.subdomain);
    const memberActivity = await request(app).get("/api/v1/security/activity")
      .set(auth(memberLogin.token));
    expect(memberActivity.status).toBe(403);

    await expect(setTenantUserStatus({
      tenantId: tenant.id,
      actorUserId: member.user.id,
      userId: owner.id,
      status: "disabled",
    })).rejects.toThrow("The accountable Owner cannot be disabled");
  });

  it("rejects an owner reference to a user from another tenant", async () => {
    const first = await createWorkspace("FirstBoundary");
    const second = await createWorkspace("SecondBoundary");
    const [role] = await db.select().from(schema.roles).where(and(
      eq(schema.roles.tenantId, first.tenant.id),
      eq(schema.roles.name, "Staff"),
    ));
    const foreignMember = await createTenantUser({
      tenantId: first.tenant.id,
      actorUserId: first.owner.id,
      email: `foreign-owner-${suffix()}@test.zw`,
      fullName: "Foreign Tenant User",
      roleId: role.id,
    });

    await expect(db.update(schema.tenantOwnerships)
      .set({ ownerUserId: foreignMember.user.id })
      .where(eq(schema.tenantOwnerships.tenantId, second.tenant.id)))
      .rejects.toThrow();

    const [preserved] = await db.select().from(schema.tenantOwnerships)
      .where(eq(schema.tenantOwnerships.tenantId, second.tenant.id));
    expect(preserved.ownerUserId).toBe(second.owner.id);
  });
});
