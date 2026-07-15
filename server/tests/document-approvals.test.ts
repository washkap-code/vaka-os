// ============================================================================
// PD-002 TESTS — document approvals (second-person rule) + retention.
// ============================================================================
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { changePassword, createTenantUser, login } from "../src/auth.js";
import { db, schema } from "../src/lib.js";

const app = createApp();
const uniq = `pd2${Date.now().toString(36)}`;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==";

let owner: { token: string; tenantId: string };
let second: { token: string };
let documentId: string;
let approvalId: string;

beforeAll(async () => {
  const res = await request(app).post("/api/v1/auth/signup").send({
    companyName: `Docs Co ${uniq}`, subdomain: `${uniq}a`, baseCurrency: "USD",
    ownerEmail: `owner-${uniq}@test.zw`, ownerPassword: "SuperSecret123!", ownerName: "Owner",
    planName: "Growth",
  });
  expect(res.status).toBe(200);
  owner = { token: res.body.token, tenantId: res.body.tenant.id };
  await db.insert(schema.tenantFeatureFlags).values({
    tenantId: owner.tenantId, featureKey: "documents.workspace", enabled: true, note: "test",
  });
  // Second user with documents.manage (Admin role) for the second-person rule.
  const [adminRole] = await db.select().from(schema.roles).where(and(
    eq(schema.roles.tenantId, owner.tenantId), eq(schema.roles.name, "Admin"),
  ));
  const ownerUser = await db.select().from(schema.users)
    .where(eq(schema.users.email, `owner-${uniq}@test.zw`));
  const member = await createTenantUser({
    tenantId: owner.tenantId, actorUserId: ownerUser[0].id,
    email: `admin-${uniq}@test.zw`, fullName: "Second Admin", roleId: adminRole.id,
  });
  const newPassword = "Second-Admin-2026!";
  await changePassword({
    userId: member.user.id, currentPassword: member.temporaryPassword, newPassword,
  });
  const session = await login(`admin-${uniq}@test.zw`, newPassword, `${uniq}a`);
  second = { token: session.token };

  const created = await request(app).post("/api/v1/documents").set(auth(owner.token)).send({
    title: "Supplier Contract", classification: "CONTRACT",
    fileName: "contract.png", dataUrl: PNG,
  });
  expect(created.status).toBe(200);
  documentId = created.body.id;
});

describe("approvals — second-person rule", () => {
  it("requests approval; duplicate pending is refused", async () => {
    const res = await request(app).post(`/api/v1/documents/${documentId}/approvals`)
      .set(auth(owner.token)).send({ note: "Please review before signature" });
    expect(res.status).toBe(200);
    approvalId = res.body.id;
    expect(res.body.status).toBe("PENDING");
    const dup = await request(app).post(`/api/v1/documents/${documentId}/approvals`)
      .set(auth(owner.token)).send({});
    expect(dup.status).toBe(409);
  });
  it("the requester cannot decide their own approval", async () => {
    const res = await request(app)
      .post(`/api/v1/documents/approvals/${approvalId}/decide`)
      .set(auth(owner.token)).send({ decision: "APPROVED" });
    expect(res.status).toBe(409);
  });
  it("a second person approves; re-deciding is refused", async () => {
    const res = await request(app)
      .post(`/api/v1/documents/approvals/${approvalId}/decide`)
      .set(auth(second.token)).send({ decision: "APPROVED", note: "Looks correct" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("APPROVED");
    expect(res.body.decidedBy).toBeTruthy();
    const again = await request(app)
      .post(`/api/v1/documents/approvals/${approvalId}/decide`)
      .set(auth(second.token)).send({ decision: "REJECTED" });
    expect(again.status).toBe(409);
    const list = await request(app)
      .get("/api/v1/documents/approvals/list?status=APPROVED").set(auth(owner.token));
    expect(list.status).toBe(200);
    expect(list.body.some((a: any) => a.id === approvalId)).toBe(true);
  });
});

describe("retention", () => {
  it("a document under retention cannot be archived; clearing retention frees it", async () => {
    const future = "2030-12-31";
    const set = await request(app).put(`/api/v1/documents/${documentId}/retention`)
      .set(auth(owner.token)).send({ retentionUntil: future });
    expect(set.status).toBe(200);
    expect(set.body.retentionUntil).toBe(future);
    const blocked = await request(app).post(`/api/v1/documents/${documentId}/archive`)
      .set(auth(owner.token));
    expect(blocked.status).toBe(409);
    const clear = await request(app).put(`/api/v1/documents/${documentId}/retention`)
      .set(auth(owner.token)).send({ retentionUntil: null });
    expect(clear.status).toBe(200);
    const archived = await request(app).post(`/api/v1/documents/${documentId}/archive`)
      .set(auth(owner.token));
    expect(archived.status).toBe(200);
  });
});
