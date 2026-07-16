// ============================================================================
// FLAG-001/002 TESTS — build-dark feature flags.
//   1. Service: default OFF, unknown keys fail closed, audited toggles
//   2. Middleware: FEATURE_DISABLED until enabled, then passes
//   3. /me exposes enabled features; tenant isolation between A and B
//   4. Platform admin: list + step-up-protected toggle with audit evidence;
//      tenant users denied; unknown key rejected
// ============================================================================
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { desc, eq } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { db, schema } from "../src/lib.js";
import { FeatureFlagService, UnknownFeatureError } from "../src/platform/features/service.js";
import { FEATURE_CATALOGUE, type FeatureFlagStore, type SetFeatureFlagInput } from "../src/platform/features/types.js";
import { requireFeature } from "../src/feature-flags.js";
import { loginPlatformAdminFixture, platformAdminTestPassword } from "./platform-admin-test-auth.js";

const app = createApp();
const uniq = `ff${Date.now().toString(36)}`;
const adminPassword = platformAdminTestPassword;

async function makeTenant(n: string) {
  const res = await request(app).post("/api/v1/auth/signup").send({
    companyName: `Flags Co ${n}`, subdomain: `${uniq}${n}`, baseCurrency: "USD",
    ownerEmail: `owner-${uniq}-${n}@test.zw`, ownerPassword: "SuperSecret123!", ownerName: "Owner",
    planName: "Growth",
  });
  expect(res.status).toBe(200);
  return { token: res.body.token as string, tenantId: res.body.tenant.id as string };
}
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

function memoryStore(): FeatureFlagStore & { rows: Map<string, SetFeatureFlagInput> } {
  const rows = new Map<string, SetFeatureFlagInput>();
  return {
    rows,
    async list(tenantId) {
      return [...rows.values()].filter((row) => row.tenantId === tenantId)
        .map((row) => ({ featureKey: row.key, enabled: row.enabled, note: row.note, updatedAt: new Date() }));
    },
    async upsert(input) { rows.set(`${input.tenantId}:${input.key}`, input); },
  };
}

let A: { token: string; tenantId: string };
let B: { token: string; tenantId: string };

beforeAll(async () => {
  A = await makeTenant("a");
  B = await makeTenant("b");
});

describe("FeatureFlagService (fail closed)", () => {
  it("defaults every catalogue key to OFF", async () => {
    const service = new FeatureFlagService(memoryStore(), async () => {});
    for (const feature of FEATURE_CATALOGUE) {
      expect(await service.isEnabled("tenant-x", feature.key)).toBe(false);
    }
    expect(await service.enabledFeatures("tenant-x")).toEqual([]);
  });
  it("treats unknown keys as disabled on read and rejects them on write", async () => {
    const service = new FeatureFlagService(memoryStore(), async () => {});
    expect(await service.isEnabled("tenant-x", "not.a.feature")).toBe(false);
    await expect(service.setFlag({
      tenantId: "tenant-x", key: "not.a.feature", enabled: true, note: "test", actorUserId: "u1",
    })).rejects.toThrow(UnknownFeatureError);
  });
  it("audits every toggle", async () => {
    const audits: SetFeatureFlagInput[] = [];
    const service = new FeatureFlagService(memoryStore(), async (input) => { audits.push(input); });
    await service.setFlag({
      tenantId: "tenant-x", key: "network.directory", enabled: true, note: "pilot", actorUserId: "u1",
    });
    expect(await service.isEnabled("tenant-x", "network.directory")).toBe(true);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ key: "network.directory", enabled: true });
  });
});

describe("requireFeature middleware (real kernel + database)", () => {
  const invoke = (tenantId: string | null) => new Promise<unknown>((resolve) => {
    const middleware = requireFeature("blackbook.directory");
    middleware({ auth: tenantId ? { tenantId } : {} } as any, {} as any, (err?: unknown) => resolve(err));
  });

  it("fails closed with FEATURE_DISABLED when the flag is off or there is no tenant", async () => {
    const offErr = await invoke(A.tenantId) as any;
    expect(offErr?.code).toBe("FEATURE_DISABLED");
    expect(offErr?.status).toBe(403);
    const noTenantErr = await invoke(null) as any;
    expect(noTenantErr?.code).toBe("FEATURE_DISABLED");
  });

  it("passes once the tenant flag is enabled, without affecting other tenants", async () => {
    await db.insert(schema.tenantFeatureFlags).values({
      tenantId: A.tenantId, featureKey: "blackbook.directory", enabled: true, note: "test enable",
    });
    expect(await invoke(A.tenantId)).toBeUndefined();
    const bErr = await invoke(B.tenantId) as any;
    expect(bErr?.code).toBe("FEATURE_DISABLED");
  });
});

describe("/me feature exposure", () => {
  it("reflects enabled flags for the right tenant only", async () => {
    const meA = await request(app).get("/api/v1/me").set(auth(A.token));
    expect(meA.status).toBe(200);
    expect(meA.body.features).toContain("blackbook.directory");
    const meB = await request(app).get("/api/v1/me").set(auth(B.token));
    expect(meB.body.features).toEqual([]);
  });
});

describe("platform administration", () => {
  it("denies tenant users the platform feature endpoints", async () => {
    const list = await request(app).get(`/api/v1/platform/tenants/${A.tenantId}/features`).set(auth(A.token));
    expect(list.status).toBe(403);
    const toggle = await request(app).put(`/api/v1/platform/tenants/${A.tenantId}/features/network.directory`)
      .set(auth(A.token)).send({ enabled: true, note: "should fail" });
    expect(toggle.status).toBe(403);
  });

  it.skipIf(!adminPassword)("lists, toggles with step-up + note, and audits", async () => {
    const { auth: adminAuth, effectivePassword } = await loginPlatformAdminFixture(app);

    const list = await request(app).get(`/api/v1/platform/tenants/${B.tenantId}/features`).set(adminAuth);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(FEATURE_CATALOGUE.length);
    expect(list.body.every((f: any) => f.enabled === false)).toBe(true);

    // Toggle without step-up proof must fail.
    const noProof = await request(app).put(`/api/v1/platform/tenants/${B.tenantId}/features/network.directory`)
      .set(adminAuth).send({ enabled: true, note: "Dark-launch pilot for tenant B" });
    expect(noProof.status).toBeGreaterThanOrEqual(400);

    const proofRes = await request(app).post("/api/v1/auth/step-up").set(adminAuth)
      .send({ currentPassword: effectivePassword });
    expect(proofRes.status).toBe(200);
    const proofHeader = { "X-Vaka-Step-Up": proofRes.body.proof as string };

    const enable = await request(app).put(`/api/v1/platform/tenants/${B.tenantId}/features/network.directory`)
      .set({ ...adminAuth, ...proofHeader }).send({ enabled: true, note: "Dark-launch pilot for tenant B" });
    expect(enable.status).toBe(200);
    const flag = enable.body.find((f: any) => f.key === "network.directory");
    expect(flag.enabled).toBe(true);
    expect(flag.note).toBe("Dark-launch pilot for tenant B");

    const meB = await request(app).get("/api/v1/me").set(auth(B.token));
    expect(meB.body.features).toContain("network.directory");

    const unknown = await request(app).put(`/api/v1/platform/tenants/${B.tenantId}/features/not.a.feature`)
      .set({ ...adminAuth, ...proofHeader }).send({ enabled: true, note: "Should be rejected" });
    expect(unknown.status).toBe(400);

    const [auditRow] = await db.select().from(schema.auditLogs)
      .where(eq(schema.auditLogs.tenantId, B.tenantId))
      .orderBy(desc(schema.auditLogs.createdAt)).limit(50);
    const events = await db.select().from(schema.auditLogs)
      .where(eq(schema.auditLogs.tenantId, B.tenantId));
    expect(auditRow).toBeTruthy();
    expect(events.some((event) =>
      event.action === "platform.feature.enabled"
      && (event.metadata as any)?.featureKey === "network.directory")).toBe(true);
  });
});
