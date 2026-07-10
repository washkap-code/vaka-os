import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { login, signupTenant } from "../src/auth.js";

const app = createApp();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const sessionIdFrom = (token: string) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).sid as string;

describe("owner session visibility", () => {
  it("shows tenant-scoped presence and revokes another device session", async () => {
    const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
    const email = `session-owner-${suffix}@test.zw`;
    const password = "Session-Test-123!";
    const { tenant } = await signupTenant({
      companyName: "Session Visibility Test",
      subdomain: `session${suffix}`.slice(0, 31),
      baseCurrency: "USD",
      ownerEmail: email,
      ownerPassword: password,
      ownerName: "Session Owner",
      planName: "Growth",
    });
    const first = await login(email, password, tenant.subdomain);
    const second = await login(email, password, tenant.subdomain);
    const activity = await request(app).get("/api/v1/security/activity").set(auth(first.token));
    expect(activity.status).toBe(200);
    expect(activity.body.summary.registered_users).toBe(1);
    expect(activity.body.summary.valid_sessions).toBeGreaterThanOrEqual(2);
    expect(activity.body.sessions.some((session: any) => session.id === sessionIdFrom(first.token))).toBe(true);
    expect(activity.body.events.some((event: any) => event.action === "security.session_created")).toBe(true);

    const stockRole = activity.body.roles.find((role: any) => role.name === "Stock Controller");
    expect(stockRole).toBeTruthy();
    const memberEmail = `session-member-${suffix}@test.zw`;
    const created = await request(app).post("/api/v1/security/users").set(auth(first.token)).send({
      email: memberEmail, fullName: "Session Member", roleId: stockRole.id,
    });
    expect(created.status).toBe(200);
    expect(created.body.temporaryPassword).toHaveLength(20);
    const memberLogin = await login(memberEmail, created.body.temporaryPassword, tenant.subdomain);
    expect(memberLogin.user.mustChangePassword).toBe(true);
    const disabled = await request(app).post(`/api/v1/security/users/${created.body.user.id}/disabled`)
      .set(auth(first.token)).send({});
    expect(disabled.status).toBe(200);
    expect((await request(app).get("/api/v1/me").set(auth(memberLogin.token))).status).toBe(401);

    const secondId = sessionIdFrom(second.token);
    const revoke = await request(app).post(`/api/v1/security/sessions/${secondId}/revoke`)
      .set(auth(first.token)).send({ reason: "owner_device_review" });
    expect(revoke.status).toBe(200);
    const revokedResponse = await request(app).get("/api/v1/me").set(auth(second.token));
    expect(revokedResponse.status).toBe(401);

    const otherEmail = `session-other-${suffix}@test.zw`;
    const other = await signupTenant({
      companyName: "Other Session Tenant",
      subdomain: `other${suffix}`.slice(0, 31),
      baseCurrency: "USD",
      ownerEmail: otherEmail,
      ownerPassword: password,
      ownerName: "Other Owner",
      planName: "Growth",
    });
    const otherSession = await login(otherEmail, password, other.tenant.subdomain);
    const otherActivity = await request(app).get("/api/v1/security/activity").set(auth(otherSession.token));
    expect(otherActivity.status).toBe(200);
    expect(otherActivity.body.users).toHaveLength(1);
    expect(otherActivity.body.users[0].email).toBe(otherEmail);
    expect(otherActivity.body.users[0].email).not.toBe(email);
  });
});
