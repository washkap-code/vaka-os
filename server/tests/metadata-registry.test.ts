import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { login } from "../src/auth.js";
import { db, schema } from "../src/lib.js";
import {
  CANONICAL_METADATA_OBJECTS, CanonicalMetadataProvider, METADATA_REGISTRY_VERSION,
} from "../src/metadata.js";
import { MetadataService } from "../src/platform/metadata/service.js";
import { signupFinanceTenant } from "./finance/helpers.js";

const app = createApp();

async function createToken(tenantId: string, permissions: string[], label: string): Promise<string> {
  const [tenant] = await db.select({ subdomain: schema.tenants.subdomain })
    .from(schema.tenants).where(eq(schema.tenants.id, tenantId));
  const [role] = await db.insert(schema.roles).values({
    tenantId,
    name: `Metadata ${label} ${Date.now()}`,
    permissions,
    isSystem: false,
  }).returning();
  const email = `metadata-${label}-${Date.now()}@test.vaka`;
  const password = "Metadata-Test-User-123!";
  await db.insert(schema.users).values({
    tenantId,
    email,
    passwordHash: await bcrypt.hash(password, 4),
    fullName: `Metadata ${label}`,
    roleId: role.id,
  });
  return (await login(email, password, tenant.subdomain)).token;
}

describe("P1-008 canonical metadata registry", () => {
  it("seeds unique governed projections and excludes restricted fields from future AI", async () => {
    const service = new MetadataService(new CanonicalMetadataProvider());
    const objects = await service.objects("tenant-1");
    expect(objects.map((object) => object.key)).toEqual(["company", "customer", "supplier", "invoice", "product"]);
    expect(Object.isFrozen(objects)).toBe(true);
    expect(objects.every((object) => Object.isFrozen(object) && Object.isFrozen(object.fields))).toBe(true);
    expect(new Set(objects.map((object) => object.key)).size).toBe(objects.length);
    expect(objects.every((object) => object.version === METADATA_REGISTRY_VERSION)).toBe(true);
    expect(objects.find((object) => object.key === "company")).toMatchObject({
      canonicalName: "Organisation",
      sourceTable: "tenants",
      searchable: false,
      readPermission: null,
    });
    expect(objects.find((object) => object.key === "company")?.surrogateNote).toContain("not a LegalEntity");
    expect(objects.find((object) => object.key === "customer")?.surrogateNote).toContain("CustomerAccount");
    expect(objects.find((object) => object.key === "supplier")).toMatchObject({
      canonicalName: "SupplierAccount", sourceTable: "contacts", readPermission: "inventory.read",
    });
    for (const object of objects) {
      expect(new Set(object.fields.map((field) => field.key)).size).toBe(object.fields.length);
      expect(object.fields.filter((field) => field.classification === "restricted")
        .every((field) => field.aiExposure === "excluded")).toBe(true);
    }
    expect(objects.find((object) => object.key === "product")?.fields.find((field) => field.key === "costPrice"))
      .toMatchObject({ aiExposure: "excluded", searchable: false, result: false });
    await expect(service.write({ tenantId: "tenant-1", entityType: "customer", entityId: "record-1", values: {} }))
      .rejects.toThrow("read-only");
    expect(() => service.objects(" ")).toThrow("tenantId is required");
    expect(() => new CanonicalMetadataProvider([CANONICAL_METADATA_OBJECTS[0], CANONICAL_METADATA_OBJECTS[0]]))
      .toThrow("duplicate metadata object key");
  });

  it("returns only authenticated and permission-allowed definitions without record values", async () => {
    const tenant = await signupFinanceTenant("metadata-api");
    const owner = await request(app).get("/api/v1/metadata/objects").set(tenant.auth);
    expect(owner.status).toBe(200);
    expect(owner.headers["cache-control"]).toBe("private, no-store");
    expect(owner.body.registryVersion).toBe(METADATA_REGISTRY_VERSION);
    expect(owner.body.objects.map((object: { key: string }) => object.key)).toEqual([
      "company", "customer", "supplier", "invoice", "product",
    ]);
    expect(JSON.stringify(owner.body)).not.toContain("Finance Kernel metadata-api");

    const crmToken = await createToken(tenant.tenantId, ["crm.read"], "crm");
    const crm = await request(app).get("/api/v1/metadata/objects")
      .set({ Authorization: `Bearer ${crmToken}` });
    expect(crm.status).toBe(200);
    expect(crm.body.objects.map((object: { key: string }) => object.key)).toEqual(["company", "customer"]);

    const reportsToken = await createToken(tenant.tenantId, ["reports.read"], "reports");
    const reports = await request(app).get("/api/v1/metadata/objects")
      .set({ Authorization: `Bearer ${reportsToken}` });
    expect(reports.status).toBe(200);
    expect(reports.body.objects.map((object: { key: string }) => object.key)).toEqual(["company"]);

    const filtered = await request(app).get("/api/v1/metadata/objects")
      .query({ keys: "invoice,product" }).set(tenant.auth);
    expect(filtered.body.objects.map((object: { key: string }) => object.key)).toEqual(["invoice", "product"]);
    expect((await request(app).get("/api/v1/metadata/objects").query({ keys: "ledger" }).set(tenant.auth)).status).toBe(400);
    expect((await request(app).get("/api/v1/metadata/objects").query({ tenantId: tenant.tenantId }).set(tenant.auth)).status).toBe(400);
  });

  it("powers governed object descriptors in permission-safe search results", async () => {
    const tenant = await signupFinanceTenant("metadata-search");
    const customer = await request(app).post("/api/v1/contacts").set(tenant.auth).send({
      name: "Registry Customer",
      type: "COMPANY",
      isCustomer: true,
    });
    expect(customer.status).toBe(200);
    const search = await request(app).get("/api/v1/search").query({ q: "Registry Customer" }).set(tenant.auth);
    expect(search.status).toBe(200);
    expect(search.body.results[0]).toMatchObject({
      id: customer.body.id,
      entityType: "customer",
      object: {
        key: "customer",
        version: METADATA_REGISTRY_VERSION,
        labelKey: "metadata.objects.customer.label",
        fallbackLabel: "Customer",
        navigation: { section: "crm", recordView: "customer" },
      },
    });

    const inventoryToken = await createToken(tenant.tenantId, ["inventory.read"], "inventory");
    const hidden = await request(app).get("/api/v1/search").query({ q: "Registry Customer" })
      .set({ Authorization: `Bearer ${inventoryToken}` });
    expect(hidden.status).toBe(200);
    expect(hidden.body.results).toEqual([]);
  });
});
