import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { and, count, eq, inArray } from "drizzle-orm";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { login } from "../../src/auth.js";
import { db, schema } from "../../src/lib.js";
import {
  BlackBookService, isReviewDue, lookupService,
} from "../../src/modules/blackbook/service.js";
import {
  seedZimbabweBlackBook, ZIMBABWE_BLACKBOOK_ORGANISATION_SEED,
  ZIMBABWE_BLACKBOOK_SERVICE_SEED,
} from "../../src/modules/blackbook/seed.js";
import { loginPlatformAdminFixture } from "../platform-admin-test-auth.js";
import { signupFinanceTenant, type TestTenant } from "../finance/helpers.js";

const app = createApp();
const runId = Date.now().toString(36);
const country = "QZ";
const fixedNow = new Date("2026-07-18T12:00:00.000Z");
const service = new BlackBookService(() => fixedNow);

let principalAuth: { Authorization: string };
let principalId: string;
let nonEditorAuth: { Authorization: string };
let tenantA: TestTenant;
let tenantB: TestTenant;

beforeAll(async () => {
  ({ auth: principalAuth } = await loginPlatformAdminFixture(app));
  const [principal] = await db.select({ id: schema.users.id }).from(schema.users)
    .where(eq(schema.users.platformRoleKey, "PRINCIPAL_ADMIN"));
  principalId = principal.id;

  const password = "BlackBook-Non-Editor-123!";
  const email = `blackbook-non-editor-${runId}@test.vaka`;
  await db.insert(schema.users).values({
    tenantId: null,
    email,
    passwordHash: await bcrypt.hash(password, 4),
    fullName: "Black Book Non Editor",
    isPlatformAdmin: true,
    platformRoleKey: "SUPPORT_ANALYST",
    mustChangePassword: false,
  });
  const session = await login(email, password);
  nonEditorAuth = { Authorization: `Bearer ${session.token}` };

  tenantA = await signupFinanceTenant(`blackbook-core-a-${runId}`);
  tenantB = await signupFinanceTenant(`blackbook-core-b-${runId}`);
  await db.update(schema.tenants).set({ countryCode: country })
    .where(inArray(schema.tenants.id, [tenantA.tenantId, tenantB.tenantId]));
});

describe("P11-001 review age", () => {
  it("flags null and dates older than twelve months without prematurely flagging the anniversary date", () => {
    expect(isReviewDue(null, fixedNow)).toBe(true);
    expect(isReviewDue("2025-07-17", fixedNow)).toBe(true);
    expect(isReviewDue("2025-07-18", fixedNow)).toBe(false);
    expect(isReviewDue("2026-01-01", fixedNow)).toBe(false);
  });
});

describe("P11-001 platform governance and shared directory", () => {
  it("denies tenant users and platform staff without blackbook:editor", async () => {
    const id = randomUUID();
    const payload = {
      orgType: "ministry",
      name: `Denied Ministry ${runId}`,
      country,
      reason: "Permission denial test",
    };
    const tenantDenied = await request(app).put(`/api/v1/blackbook/organisations/${id}`)
      .set(tenantA.auth).send(payload);
    expect(tenantDenied.status).toBe(403);
    const platformDenied = await request(app).put(`/api/v1/blackbook/organisations/${id}`)
      .set(nonEditorAuth).send(payload);
    expect(platformDenied.status).toBe(403);
    const [row] = await db.select({ id: schema.govOrganisations.id }).from(schema.govOrganisations)
      .where(eq(schema.govOrganisations.id, id));
    expect(row).toBeUndefined();
  });

  it("versions hierarchy and child records, searches globally, and audits every effective write", async () => {
    const parentId = randomUUID();
    const childId = randomUUID();
    const contactId = randomUUID();
    const serviceId = randomUUID();
    const baseOrganisation = {
      orgType: "ministry" as const,
      name: `Ministry of Structured Tests ${runId}`,
      acronym: "MST",
      parentOrgId: null,
      country,
      description: "Synthetic test organisation for Black Book governance.",
      website: null,
      status: "active" as const,
      verifiedAt: "2025-07-17",
      reason: "Create synthetic parent organisation",
    };
    const created = await request(app).put(`/api/v1/blackbook/organisations/${parentId}`)
      .set(principalAuth).send(baseOrganisation);
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ id: parentId, version: 1, review_due: true });

    const updated = await request(app).put(`/api/v1/blackbook/organisations/${parentId}`)
      .set(principalAuth).send({
        ...baseOrganisation,
        name: `Ministry of Structured Services ${runId}`,
        reason: "Correct synthetic organisation name",
      });
    expect(updated.status).toBe(200);
    expect(updated.body.version).toBe(2);

    const child = await request(app).put(`/api/v1/blackbook/organisations/${childId}`)
      .set(principalAuth).send({
        orgType: "department",
        name: `Structured Services Department ${runId}`,
        parentOrgId: parentId,
        country,
        verifiedAt: "2026-01-01",
        reason: "Create synthetic child department",
      });
    expect(child.status).toBe(200);
    expect(child.body.review_due).toBe(false);

    const contact = await request(app)
      .put(`/api/v1/blackbook/organisations/${parentId}/contacts/${contactId}`)
      .set(principalAuth).send({
        type: "email",
        label: "Synthetic editorial contact",
        value: null,
        region: null,
        verifiedAt: null,
        reason: "Add unverified contact placeholder",
      });
    expect(contact.status).toBe(200);
    expect(contact.body).toMatchObject({ id: contactId, value: null, review_due: true });

    const serviceCreated = await request(app).put(`/api/v1/blackbook/services/${serviceId}`)
      .set(principalAuth).send({
        orgId: parentId,
        name: `Structured Permit Registration ${runId}`,
        description: "Synthetic searchable registration service.",
        category: "registration",
        requirementsJson: null,
        feesJson: null,
        processingTime: null,
        officialFormUrl: null,
        onlineServiceUrl: null,
        verifiedAt: null,
        reason: "Create synthetic public service",
      });
    expect(serviceCreated.status).toBe(200);
    expect(serviceCreated.body.review_due).toBe(true);

    const serviceUpdated = await request(app).put(`/api/v1/blackbook/services/${serviceId}`)
      .set(principalAuth).send({
        ...serviceCreated.body,
        description: "Synthetic searchable registration and permit service.",
        reason: "Improve synthetic service description",
        review_due: undefined,
        id: undefined,
      });
    expect(serviceUpdated.status, JSON.stringify(serviceUpdated.body)).toBe(200);

    for (const tenant of [tenantA, tenantB]) {
      const list = await request(app).get("/api/v1/blackbook/organisations")
        .query({ country, q: "Structured Services" }).set(tenant.auth);
      expect(list.status).toBe(200);
      expect(list.body.map((row: { id: string }) => row.id)).toContain(parentId);
      const detail = await request(app).get(`/api/v1/blackbook/organisations/${parentId}`)
        .set(tenant.auth);
      expect(detail.status).toBe(200);
      expect(detail.body.children).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: childId, parentOrgId: parentId }),
      ]));
      expect(detail.body.contacts).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: contactId }),
      ]));
      expect(detail.body.services).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: serviceId }),
      ]));
    }

    const filteredServices = await request(app).get("/api/v1/blackbook/services")
      .query({ category: "registration", q: "permit", country }).set(tenantA.auth);
    expect(filteredServices.status).toBe(200);
    expect(filteredServices.body.map((row: { id: string }) => row.id)).toContain(serviceId);

    const organisationSearch = await request(app).get("/api/v1/search")
      .query({ q: "Structured Services", entityTypes: "government_organisation" })
      .set(tenantA.auth);
    expect(organisationSearch.status).toBe(200);
    expect(organisationSearch.body.results.find((row: { id: string }) => row.id === parentId)).toMatchObject({
      id: parentId,
      entityType: "government_organisation",
      document: { review_due: true, country },
    });
    const serviceSearch = await request(app).get("/api/v1/search")
      .query({ q: "Structured Permit", entityTypes: "government_service" })
      .set(tenantB.auth);
    expect(serviceSearch.status).toBe(200);
    expect(serviceSearch.body.results.find((row: { id: string }) => row.id === serviceId)).toMatchObject({
      id: serviceId,
      entityType: "government_service",
      document: { organisationId: parentId, country },
    });

    const complianceLookup = await lookupService("registration", country);
    expect(complianceLookup).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: serviceId, review_due: true }),
    ]));

    const parentRevisions = await service.listRevisions("organisation", parentId);
    const serviceRevisions = await service.listRevisions("service", serviceId);
    const contactRevisions = await service.listRevisions("contact_point", contactId);
    expect(parentRevisions).toHaveLength(2);
    expect(serviceRevisions).toHaveLength(2);
    expect(contactRevisions).toHaveLength(1);
    expect(parentRevisions.at(-1)?.beforeJson).toBeNull();
    expect(parentRevisions[0].beforeJson).toBeTruthy();

    const auditActions = await db.select({ action: schema.platformAuditLogs.action })
      .from(schema.platformAuditLogs).where(inArray(schema.platformAuditLogs.action, [
        "blackbook.organisation.created",
        "blackbook.organisation.updated",
        "blackbook.contact_point.created",
        "blackbook.service.created",
        "blackbook.service.updated",
      ]));
    expect(new Set(auditActions.map((row) => row.action))).toEqual(new Set([
      "blackbook.organisation.created",
      "blackbook.organisation.updated",
      "blackbook.contact_point.created",
      "blackbook.service.created",
      "blackbook.service.updated",
    ]));

    const deletedService = await request(app).delete(`/api/v1/blackbook/services/${serviceId}`)
      .set(principalAuth).send({ reason: "Delete synthetic service after test" });
    const deletedContact = await request(app)
      .delete(`/api/v1/blackbook/organisations/${parentId}/contacts/${contactId}`)
      .set(principalAuth).send({ reason: "Delete synthetic contact after test" });
    const retiredChild = await request(app).delete(`/api/v1/blackbook/organisations/${childId}`)
      .set(principalAuth).send({ reason: "Retire synthetic child after test" });
    expect(deletedService.body.deleted).toBe(true);
    expect(deletedContact.body.deleted).toBe(true);
    expect(retiredChild.body.organisation.status).toBe("dissolved");
    expect(await service.listRevisions("service", serviceId)).toHaveLength(3);
    expect(await service.listRevisions("contact_point", contactId)).toHaveLength(2);
    expect(await service.listRevisions("organisation", childId)).toHaveLength(2);
  });

  it("rejects direct service writes from a tenant identity", async () => {
    await expect(service.upsertOrganisation({
      actorUserId: tenantA.userId,
      entityId: randomUUID(),
      reason: "Attempt a forbidden direct write",
      input: {
        orgType: "regulator",
        name: `Forbidden Regulator ${runId}`,
        acronym: null,
        parentOrgId: null,
        country,
        description: null,
        website: null,
        status: "active",
        verifiedAt: null,
      },
    })).rejects.toMatchObject({ status: 403 });
  });
});

describe("P11-001 Zimbabwe structural seed", () => {
  it("is idempotent and contains no fabricated contact, fee, timing, form, or verification values", async () => {
    const first = await seedZimbabweBlackBook(principalId);
    expect(first).toMatchObject({
      organisations: ZIMBABWE_BLACKBOOK_ORGANISATION_SEED.length,
      placeholderContacts: ZIMBABWE_BLACKBOOK_ORGANISATION_SEED.length,
      services: ZIMBABWE_BLACKBOOK_SERVICE_SEED.length,
      verifiedValuesSeeded: 0,
    });
    const seedIds = [
      ...ZIMBABWE_BLACKBOOK_ORGANISATION_SEED.map((entry) => entry.id),
      ...ZIMBABWE_BLACKBOOK_SERVICE_SEED.map((entry) => entry.id),
    ];
    const [beforeRepeat] = await db.select({ value: count() }).from(schema.blackbookRevisions)
      .where(inArray(schema.blackbookRevisions.entityId, seedIds));
    await seedZimbabweBlackBook(principalId);
    const [afterRepeat] = await db.select({ value: count() }).from(schema.blackbookRevisions)
      .where(inArray(schema.blackbookRevisions.entityId, seedIds));
    expect(afterRepeat.value).toBe(beforeRepeat.value);

    const contacts = await db.select().from(schema.govContactPoints)
      .where(inArray(schema.govContactPoints.orgId,
        ZIMBABWE_BLACKBOOK_ORGANISATION_SEED.map((entry) => entry.id)));
    expect(contacts).toHaveLength(ZIMBABWE_BLACKBOOK_ORGANISATION_SEED.length);
    expect(contacts.every((row) => row.value === null && row.verifiedAt === null)).toBe(true);

    const services = await db.select().from(schema.govServices)
      .where(inArray(schema.govServices.id, ZIMBABWE_BLACKBOOK_SERVICE_SEED.map((entry) => entry.id)));
    expect(services).toHaveLength(ZIMBABWE_BLACKBOOK_SERVICE_SEED.length);
    expect(services.every((row) => row.requirementsJson === null && row.feesJson === null
      && row.processingTime === null && row.officialFormUrl === null
      && row.onlineServiceUrl === null && row.verifiedAt === null)).toBe(true);

    const organisations = await db.select().from(schema.govOrganisations)
      .where(and(
        eq(schema.govOrganisations.country, "ZW"),
        inArray(schema.govOrganisations.id,
          ZIMBABWE_BLACKBOOK_ORGANISATION_SEED.map((entry) => entry.id)),
      ));
    expect(organisations.some((row) => row.acronym === "ZIMRA")).toBe(true);
    expect(organisations.some((row) => row.acronym === "NSSA")).toBe(true);
    expect(organisations.some((row) => row.acronym === "PRAZ")).toBe(true);
    expect(organisations.some((row) => row.acronym === "RBZ")).toBe(true);
  });
});
