import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import { createApp } from "../../src/app.js";
import { db, schema } from "../../src/lib.js";

const app = createApp();
const marker = `p10${Date.now().toString(36)}`;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

interface TestTenant {
  token: string;
  tenantId: string;
  companyName: string;
}

async function createTenant(label: string): Promise<TestTenant> {
  const companyName = `P10 Company ${label} ${marker}`;
  const response = await request(app).post("/api/v1/auth/signup").send({
    companyName,
    subdomain: `${marker}-${label}`,
    baseCurrency: "USD",
    ownerEmail: `owner-${marker}-${label}@test.vaka.africa`,
    ownerPassword: "SuperSecret123!",
    ownerName: `Owner ${label}`,
    planName: "Growth",
  });
  expect(response.status).toBe(200);
  const tenantId = response.body.tenant.id as string;
  await db.insert(schema.tenantFeatureFlags).values({
    tenantId,
    featureKey: "network.directory",
    enabled: true,
    note: "P10 integration test",
  });
  return { token: response.body.token as string, tenantId, companyName };
}

const validProfile = {
  slug: `matobo-engineering-${marker}`,
  name: "Matobo Engineering",
  tagline: "Reliable solar and fabrication delivery",
  description: "Matobo Engineering designs, fabricates, installs, and maintains dependable energy and industrial systems for growing businesses across Zimbabwe and the wider region.",
  industryPrimary: "manufacturing",
  industrySecondary: ["energy"],
  country: "ZW",
  region: "Matabeleland South",
  city: "Gwanda",
  address: { locality: "Industrial Site" },
  phone: "+263 29 2000000",
  emailPublic: "hello@matobo.example",
  website: "https://matobo.example/",
  foundedYear: 2014,
  employeeBand: "10-49",
  visibility: "public",
  capabilities: [
    { category: "energy", name: "Commercial solar installations" },
    { category: "fabrication", name: "Structural steel fabrication" },
  ],
  acceptEnquiries: false,
};

let owner: TestTenant;
let viewer: TestTenant;
let profileId: string;

beforeAll(async () => {
  owner = await createTenant("owner");
  viewer = await createTenant("viewer");
});

describe("P10-001 Business Directory Core", () => {
  it("keeps a draft cross-tenant invisible and rejects incomplete publication through metadata", async () => {
    const draft = await request(app).put("/api/v1/network/profile").set(auth(owner.token)).send({
      ...validProfile,
      name: "PRIVATE DRAFT PROFILE",
      description: "Too short",
      phone: null,
      emailPublic: null,
      website: null,
    });
    expect(draft.status).toBe(200);
    profileId = draft.body.profile.id as string;
    expect(draft.body.status).toBe("draft");

    const crossTenant = await request(app)
      .get("/api/v1/network/directory?q=PRIVATE%20DRAFT").set(auth(viewer.token));
    expect(crossTenant.status).toBe(200);
    expect(crossTenant.body.some((profile: { id: string }) => profile.id === profileId)).toBe(false);
    expect(JSON.stringify(crossTenant.body)).not.toContain(marker);

    const publish = await request(app).post("/api/v1/network/profile/publish").set(auth(owner.token));
    expect(publish.status).toBe(400);
    expect(publish.body.message).toContain("description must be at least 100 characters");
    expect(publish.body.message).toContain("At least one of phone, emailPublic, website is required");
  });

  it("enforces one profile per canonical Company and global slug uniqueness", async () => {
    const first = await request(app).put("/api/v1/network/profile").set(auth(owner.token)).send(validProfile);
    expect(first.status).toBe(200);
    expect(first.body.profile.id).toBe(profileId);

    const second = await request(app).put("/api/v1/network/profile").set(auth(owner.token)).send({
      ...validProfile,
      tagline: "Updated without creating a second profile",
    });
    expect(second.status).toBe(200);
    expect(second.body.profile.id).toBe(profileId);

    const rows = await db.select({ id: schema.businessProfiles.id }).from(schema.businessProfiles).where(and(
      eq(schema.businessProfiles.tenantId, owner.tenantId),
      eq(schema.businessProfiles.companyId, owner.tenantId),
    ));
    expect(rows).toHaveLength(1);

    const duplicateSlug = await request(app).put("/api/v1/network/profile").set(auth(viewer.token)).send({
      ...validProfile,
      name: "Different Company",
    });
    expect(duplicateSlug.status).toBe(409);
  });

  it("publishes end-to-end through a completed single-step workflow", async () => {
    const response = await request(app).post("/api/v1/network/profile/publish").set(auth(owner.token));
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("published");
    expect(response.body.publishedSnapshot.name).toBe(validProfile.name);
    expect(response.body.publishedSnapshot.capabilities).toHaveLength(2);

    const [instance] = await db.select().from(schema.workflowInstances).where(and(
      eq(schema.workflowInstances.tenantId, owner.tenantId),
      eq(schema.workflowInstances.objectType, "BusinessProfile"),
      eq(schema.workflowInstances.objectId, profileId),
    ));
    expect(instance).toMatchObject({ status: "COMPLETED", currentStep: 0 });
    const actions = await db.select().from(schema.workflowActions)
      .where(eq(schema.workflowActions.instanceId, instance.id));
    expect(actions).toEqual([expect.objectContaining({ action: "APPROVE", step: 0 })]);

    const [publishedEvent] = await db.select().from(schema.platformEvents).where(and(
      eq(schema.platformEvents.tenantId, owner.tenantId),
      eq(schema.platformEvents.eventType, "profile.published"),
      eq(schema.platformEvents.objectId, profileId),
    ));
    expect(publishedEvent).toBeTruthy();
  });

  it("searches public snapshots by text, capability, industry, country, and region", async () => {
    const capability = await request(app)
      .get("/api/v1/network/directory?q=commercial%20solar").set(auth(viewer.token));
    expect(capability.status).toBe(200);
    expect(capability.body).toContainEqual(expect.objectContaining({ id: profileId, name: validProfile.name }));

    const filtered = await request(app)
      .get("/api/v1/network/directory?industry=manufacturing&country=ZW&region=Matabeleland%20South&page=1")
      .set(auth(viewer.token));
    expect(filtered.body.some((profile: { id: string }) => profile.id === profileId)).toBe(true);

    const excluded = await request(app)
      .get("/api/v1/network/directory?industry=education&country=ZW")
      .set(auth(viewer.token));
    expect(excluded.body.some((profile: { id: string }) => profile.id === profileId)).toBe(false);
  });

  it("never leaks post-publication draft edits and hides non-public visibility immediately", async () => {
    const edit = await request(app).put("/api/v1/network/profile").set(auth(owner.token)).send({
      ...validProfile,
      name: "SECRET UNREVIEWED EDIT",
    });
    expect(edit.status).toBe(200);
    expect(edit.body.staleSincePublish).toBe(true);

    const secret = await request(app)
      .get("/api/v1/network/directory?q=SECRET%20UNREVIEWED").set(auth(viewer.token));
    expect(secret.body.some((profile: { id: string }) => profile.id === profileId)).toBe(false);
    const original = await request(app)
      .get("/api/v1/network/directory?q=Matobo%20Engineering").set(auth(viewer.token));
    expect(original.body.some((profile: { id: string }) => profile.id === profileId)).toBe(true);

    const hidden = await request(app).put("/api/v1/network/profile").set(auth(owner.token)).send({
      ...validProfile,
      visibility: "hidden",
    });
    expect(hidden.status).toBe(200);
    const noLongerVisible = await request(app)
      .get("/api/v1/network/directory?q=Matobo%20Engineering").set(auth(viewer.token));
    expect(noLongerVisible.body.some((profile: { id: string }) => profile.id === profileId)).toBe(false);

    await request(app).put("/api/v1/network/profile").set(auth(owner.token)).send(validProfile);
  });

  it("reads Company legal facts live and records profile views, events, and audit", async () => {
    await db.update(schema.tenants).set({
      companyName: `Canonical Legal Name ${marker}`,
      registrationNumber: `REG-${marker}`,
    }).where(eq(schema.tenants.id, owner.tenantId));

    const response = await request(app)
      .get(`/api/v1/network/profiles/${validProfile.slug}`).set(auth(viewer.token));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: profileId,
      legalName: `Canonical Legal Name ${marker}`,
      registrationNumber: `REG-${marker}`,
      verificationStatus: "unverified",
    });
    expect(response.body.tenantId).toBeUndefined();
    expect(response.body.status).toBeUndefined();

    const views = await db.select().from(schema.profileViews)
      .where(eq(schema.profileViews.profileId, profileId));
    expect(views).toHaveLength(1);
    expect(views[0].viewerTenantId).toBe(viewer.tenantId);

    const [viewEvent] = await db.select().from(schema.platformEvents).where(and(
      eq(schema.platformEvents.eventType, "profile.viewed"),
      eq(schema.platformEvents.objectId, profileId),
    ));
    expect(viewEvent).toBeTruthy();

    const audits = await db.select({ action: schema.auditLogs.action }).from(schema.auditLogs).where(and(
      eq(schema.auditLogs.entityId, profileId),
      inArray(schema.auditLogs.action, [
        "business_profile.created",
        "business_profile.updated",
        "business_profile.submitted",
        "business_profile.published",
        "business_profile.viewed",
      ]),
    ));
    expect(new Set(audits.map((audit) => audit.action))).toEqual(new Set([
      "business_profile.created",
      "business_profile.updated",
      "business_profile.submitted",
      "business_profile.published",
      "business_profile.viewed",
    ]));
  });
});
