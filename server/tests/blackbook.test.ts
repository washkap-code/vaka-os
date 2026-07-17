// ============================================================================
// PB-001/PB-003 TESTS — Black Book registry, directory and search projection.
//   1. validateDataset: implements the schema.md import contract (checks
//      1–8, 10) — every rejection class exercised on a synthetic dataset.
//   2. Import: create → unchanged → versioned update; atomic failure leaves
//      the registry untouched; runs recorded with counts.
//   3. Tenant reads: fail closed without `blackbook.directory`; list/detail
//      with provenance once enabled; 404 on unknown key.
//   4. Governance: tenant users cannot import; platform import requires
//      step-up and writes platform audit evidence.
//   5. Real seed dataset (knowledge-system) validates with zero errors and
//      imports completely, when present next to the server workspace.
// ============================================================================
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { loginPlatformAdminFixture, platformAdminTestPassword } from "./platform-admin-test-auth.js";
import { db, schema } from "../src/lib.js";
import {
  BLACKBOOK_CATEGORIES, importDataset, listEntries, getEntry, validateDataset,
  type BlackbookDataset,
} from "../src/blackbook.js";

const app = createApp();
const uniq = `bb${Date.now().toString(36)}`;
const adminPassword = platformAdminTestPassword;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

// Isolated synthetic country so tests never collide with real ZW content or
// with earlier runs against the same scratch database (letters from time).
const COUNTRY = (() => {
  const n = Date.now();
  return String.fromCharCode(65 + (n % 26)) + String.fromCharCode(65 + (Math.floor(n / 26) % 26));
})();

function miniDataset(): BlackbookDataset {
  return {
    government_organisation: [{
      id: "test-ministry", name: "Test Ministry", category: "government_organisation",
      website: "https://ministry.gov.test/", services: ["test-service"],
      verified: true, sources: ["https://ministry.gov.test/about/"],
      lastReviewed: "2026-07-15", notes: "Synthetic test record.",
    }],
    service: [{
      id: "test-service", name: "Test Registration Service", category: "service",
      parentId: "test-ministry", verified: true,
      sources: ["https://ministry.gov.test/services/"], lastReviewed: "2026-07-15",
    }],
    licence_type: [{
      id: "test-licence", name: "Test Operating Licence", category: "licence_type",
      issuingAuthorityId: "test-ministry", appliesTo: ["All test businesses"],
      requiredDocuments: [], statutoryBasis: null, renewalFrequency: "ANNUAL",
      typicalProcessingTime: null, officialFormUrl: null, verified: true,
      sources: ["https://ministry.gov.test/licensing/"], lastReviewed: "2026-07-15",
      notes: null,
    }],
    compliance_event: [{
      id: "test-licence-renewal", name: "Renew test operating licence",
      category: "compliance_event", licenceTypeId: "test-licence",
      authorityId: "test-ministry", cadence: "ANNUAL",
      dueRule: "Confirm the current renewal date with the Test Ministry.",
      verified: true, sources: ["https://ministry.gov.test/licensing/"],
      lastReviewed: "2026-07-15",
    }],
  };
}

let owner: { token: string; tenantId: string; userId: string };
let disabledTenant: { token: string; tenantId: string };

beforeAll(async () => {
  const res = await request(app).post("/api/v1/auth/signup").send({
    companyName: `BlackBook Co ${uniq}`, subdomain: `${uniq}a`, baseCurrency: "USD",
    ownerEmail: `owner-${uniq}@test.zw`, ownerPassword: "SuperSecret123!", ownerName: "Owner",
    planName: "Growth",
  });
  expect(res.status).toBe(200);
  const me = await request(app).get("/api/v1/me").set(auth(res.body.token));
  owner = { token: res.body.token, tenantId: res.body.tenant.id, userId: me.body.user.id };
  const disabled = await request(app).post("/api/v1/auth/signup").send({
    companyName: `BlackBook Disabled ${uniq}`, subdomain: `${uniq}b`, baseCurrency: "USD",
    ownerEmail: `disabled-${uniq}@test.zw`, ownerPassword: "SuperSecret123!", ownerName: "Owner",
    planName: "Growth",
  });
  expect(disabled.status).toBe(200);
  disabledTenant = { token: disabled.body.token, tenantId: disabled.body.tenant.id };
  await db.update(schema.tenants).set({ countryCode: COUNTRY })
    .where(eq(schema.tenants.id, owner.tenantId));
  await db.update(schema.tenants).set({ countryCode: COUNTRY })
    .where(eq(schema.tenants.id, disabledTenant.tenantId));
});

describe("validateDataset (schema.md contract)", () => {
  it("accepts the well-formed synthetic dataset", () => {
    const { errors, records } = validateDataset(miniDataset());
    expect(errors).toEqual([]);
    expect(records).toHaveLength(4);
  });
  const reject = (mutate: (d: any) => void, fragment: string) => {
    const dataset: any = miniDataset();
    mutate(dataset);
    const { errors } = validateDataset(dataset);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(" | ")).toContain(fragment);
  };
  it("rejects an unknown dataset category", () =>
    reject((d) => { d.mystery_category = []; }, 'Unknown dataset category "mystery_category"'));
  it("rejects a non-array category", () =>
    reject((d) => { d.service = {}; }, "must be a JSON array"));
  it("rejects a missing required base field", () =>
    reject((d) => { delete d.service[0].lastReviewed; }, "lastReviewed"));
  it("rejects a category/file mismatch", () =>
    reject((d) => { d.service[0].category = "regulator"; }, "does not match its file"));
  it("rejects duplicate ids globally", () =>
    reject((d) => { d.service.push({ ...d.service[0] }); }, "Duplicate id"));
  it("rejects an unresolved reference", () =>
    reject((d) => { d.compliance_event[0].authorityId = "nowhere"; }, "does not resolve"));
  it("rejects an authority reference to a non-authority category", () =>
    reject((d) => { d.compliance_event[0].authorityId = "test-service"; }, "must reference one of"));
  it("rejects a verified record without an HTTPS source", () =>
    reject((d) => { d.service[0].sources = []; }, "verified record must cite at least one HTTPS source"));
  it("rejects a non-HTTPS source URL", () =>
    reject((d) => { d.service[0].sources = ["http://ministry.gov.test/"]; }, "not an absolute HTTPS URL"));
  it("rejects an invalid ISO date", () =>
    reject((d) => { d.service[0].lastReviewed = "2026-02-30"; }, "valid ISO calendar date"));
  it("rejects an out-of-enum cadence", () =>
    reject((d) => { d.compliance_event[0].cadence = "BIENNIAL"; }, "not in ONCE/MONTHLY/QUARTERLY/ANNUAL/OTHER"));
  it("rejects an out-of-enum renewal frequency", () =>
    reject((d) => { d.licence_type[0].renewalFrequency = "SOMETIMES"; }, "not in ONCE/MONTHLY/QUARTERLY/ANNUAL/OTHER"));
  it("rejects a licence without required arrays", () =>
    reject((d) => { d.licence_type[0].appliesTo = "everyone"; }, "appliesTo must be an array"));
  it("rejects a licence missing a required contract field", () =>
    reject((d) => { delete d.licence_type[0].statutoryBasis; }, 'missing required field "statutoryBasis"'));
  it("rejects unknown fields instead of silently accepting them", () =>
    reject((d) => { d.service[0].fee = "US$10"; }, 'unknown field "fee"'));
  it("rejects a non-kebab-case id", () =>
    reject((d) => { d.service[0].id = "Test_Service"; }, "non-kebab-case id"));
});

describe("importDataset (atomic, versioned, recorded)", () => {
  it("creates entries with version 1 and records the run", async () => {
    const result = await importDataset({
      actorUserId: owner.userId, countryCode: COUNTRY,
      datasetRevision: "rev-1", dataset: miniDataset(),
    });
    expect(result).toMatchObject({ recordCount: 4, created: 4, updated: 0, unchanged: 0 });
    const entries = await listEntries({ country: COUNTRY });
    expect(entries).toHaveLength(4);
    expect(entries.every((entry) => entry.currentVersion === 1)).toBe(true);
  });
  it("re-importing an identical revision changes nothing", async () => {
    const result = await importDataset({
      actorUserId: owner.userId, countryCode: COUNTRY,
      datasetRevision: "rev-1-again", dataset: miniDataset(),
    });
    expect(result).toMatchObject({ created: 0, updated: 0, unchanged: 4 });
  });
  it("a changed record bumps the version and keeps immutable history", async () => {
    const dataset: any = miniDataset();
    dataset.government_organisation[0].name = "Test Ministry (Renamed)";
    const result = await importDataset({
      actorUserId: owner.userId, countryCode: COUNTRY,
      datasetRevision: "rev-2", dataset,
    });
    expect(result).toMatchObject({ created: 0, updated: 1, unchanged: 3 });
    const entry = await getEntry(COUNTRY, "test-ministry");
    expect(entry.name).toBe("Test Ministry (Renamed)");
    expect(entry.currentVersion).toBe(2);
    expect(entry.versions.map((v) => v.version)).toEqual([2, 1]);
  });
  it("a failed import leaves the registry unchanged", async () => {
    const dataset: any = miniDataset();
    dataset.government_organisation[0].name = "Should Never Land";
    dataset.compliance_event[0].authorityId = "nowhere"; // poison one record
    await expect(importDataset({
      actorUserId: owner.userId, countryCode: COUNTRY,
      datasetRevision: "rev-3-bad", dataset,
    })).rejects.toThrow(/registry is unchanged/);
    const entry = await getEntry(COUNTRY, "test-ministry");
    expect(entry.name).toBe("Test Ministry (Renamed)"); // rev-2 state intact
    const runs = await db.select().from(schema.blackbookImportRuns)
      .where(eq(schema.blackbookImportRuns.countryCode, COUNTRY));
    expect(runs.map((run) => run.datasetRevision)).not.toContain("rev-3-bad");
  });
});

describe("tenant reads (behind blackbook.directory)", () => {
  it("fails closed before the flag is enabled", async () => {
    const res = await request(app).get("/api/v1/blackbook/entries").set(auth(owner.token));
    expect(res.status).toBe(403);
    expect(res.body.code ?? res.body.error ?? JSON.stringify(res.body)).toMatch(/FEATURE|disabled/i);
    const gatedSearch = await request(app).get("/api/v1/blackbook/search")
      .query({ q: "Test Ministry" }).set(auth(owner.token));
    expect(gatedSearch.status).toBe(403);
    const search = await request(app).get("/api/v1/search")
      .query({ q: "Test Ministry", entityTypes: "blackbook" }).set(auth(owner.token));
    expect(search.status).toBe(200);
    expect(search.body.results).toEqual([]);
  });
  it("lists and reads entries with provenance once enabled", async () => {
    await db.insert(schema.tenantFeatureFlags).values({
      tenantId: owner.tenantId, featureKey: "blackbook.directory", enabled: true, note: "test enable",
    });
    const list = await request(app)
      .get(`/api/v1/blackbook/entries?country=${COUNTRY}&category=licence_type`)
      .set(auth(owner.token));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].key).toBe("test-licence");

    const search = await request(app)
      .get(`/api/v1/blackbook/entries?country=${COUNTRY}&q=renamed`).set(auth(owner.token));
    expect(search.status).toBe(200);
    expect(search.body.map((entry: any) => entry.key)).toEqual(["test-ministry"]);

    const keywordSearch = await request(app)
      .get(`/api/v1/blackbook/entries?country=${COUNTRY}&q=synthetic%20test%20record`).set(auth(owner.token));
    expect(keywordSearch.status).toBe(200);
    expect(keywordSearch.body.map((entry: any) => entry.key)).toEqual(["test-ministry"]);

    const universal = await request(app).get("/api/v1/search")
      .query({ q: "synthetic test record", entityTypes: "blackbook" }).set(auth(owner.token));
    expect(universal.status).toBe(200);
    expect(universal.body.results).toHaveLength(1);
    expect(universal.body.results[0]).toMatchObject({
      id: "test-ministry",
      entityType: "blackbook",
      title: "Test Ministry (Renamed)",
      document: {
        id: "test-ministry",
        entityType: "blackbook",
        key: "test-ministry",
        category: "government_organisation",
        verified: true,
        lastReviewed: "2026-07-15",
      },
      object: {
        key: "blackbook",
        navigation: { section: "blackbook", recordView: "entry" },
      },
    });
    expect(universal.body.results[0].document).not.toHaveProperty("payload");
    expect(universal.body.results[0].document).not.toHaveProperty("sources");

    const directorySearch = await request(app).get("/api/v1/blackbook/search")
      .query({ q: "synthetic test record" }).set(auth(owner.token));
    expect(directorySearch.status).toBe(200);
    expect(directorySearch.headers["cache-control"]).toBe("private, no-store");
    expect(directorySearch.body.results.map((result: any) => result.id)).toEqual(["test-ministry"]);

    const disabledSearch = await request(app).get("/api/v1/search")
      .query({ q: "synthetic test record", entityTypes: "blackbook" }).set(auth(disabledTenant.token));
    expect(disabledSearch.status).toBe(200);
    expect(disabledSearch.body.results).toEqual([]);
    const disabledDirectorySearch = await request(app).get("/api/v1/blackbook/search")
      .query({ q: "synthetic test record" }).set(auth(disabledTenant.token));
    expect(disabledDirectorySearch.status).toBe(403);

    const detail = await request(app)
      .get(`/api/v1/blackbook/entries/test-licence?country=${COUNTRY}`).set(auth(owner.token));
    expect(detail.status).toBe(200);
    expect(detail.body.sources).toEqual(["https://ministry.gov.test/licensing/"]);
    expect(detail.body.lastReviewed).toBe("2026-07-15");
    expect(detail.body.notice).toMatch(/not professional advice/i);
    expect(detail.body.payload.renewalFrequency).toBe("ANNUAL");
  });
  it("404s on an unknown key", async () => {
    const res = await request(app)
      .get(`/api/v1/blackbook/entries/does-not-exist?country=${COUNTRY}`).set(auth(owner.token));
    expect(res.status).toBe(404);
  });
});

describe("governance (platform import path)", () => {
  it("tenant users cannot import", async () => {
    const res = await request(app).post("/api/v1/platform/blackbook/import")
      .set(auth(owner.token))
      .send({ countryCode: COUNTRY, datasetRevision: "rev-x", dataset: miniDataset() });
    expect(res.status).toBe(403);
  });
  it.skipIf(!adminPassword)("platform import requires step-up and is audited", async () => {
    const { auth: adminAuth, effectivePassword } = await loginPlatformAdminFixture(app);

    const dataset: any = miniDataset();
    dataset.government_organisation[0].notes = "Imported via platform route.";

    const noProof = await request(app).post("/api/v1/platform/blackbook/import")
      .set(adminAuth).send({ countryCode: COUNTRY, datasetRevision: "rev-4", dataset });
    expect(noProof.status).toBeGreaterThanOrEqual(400);

    const proofRes = await request(app).post("/api/v1/auth/step-up").set(adminAuth)
      .send({ currentPassword: effectivePassword });
    expect(proofRes.status).toBe(200);
    const proofHeader = { "X-Vaka-Step-Up": proofRes.body.proof as string };

    const imported = await request(app).post("/api/v1/platform/blackbook/import")
      .set({ ...adminAuth, ...proofHeader })
      .send({ countryCode: COUNTRY, datasetRevision: "rev-4", dataset });
    expect(imported.status).toBe(200);
    expect(imported.body).toMatchObject({ updated: 1, unchanged: 3 });

    const [auditRow] = await db.select().from(schema.platformAuditLogs)
      .where(eq(schema.platformAuditLogs.action, "platform_blackbook.imported"))
      .orderBy(desc(schema.platformAuditLogs.createdAt)).limit(1);
    expect(auditRow).toBeTruthy();
    expect((auditRow.metadata as any).datasetRevision).toBe("rev-4");

    const runs = await request(app)
      .get(`/api/v1/platform/blackbook/import-runs?country=${COUNTRY}`).set(adminAuth);
    expect(runs.status).toBe(200);
    expect(runs.body.some((run: any) => run.datasetRevision === "rev-4")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Real Zimbabwe seed package (PB-000/PB-000B), when available on disk.
// ---------------------------------------------------------------------------
const seedDir = [
  path.resolve(process.cwd(), "../knowledge-system/10-country-packs/Zimbabwe/black-book/data"),
  path.resolve(process.cwd(), "../../knowledge-system/10-country-packs/Zimbabwe/black-book/data"),
].find((candidate) => existsSync(candidate));

const SEED_FILE_CATEGORIES: Record<string, (typeof BLACKBOOK_CATEGORIES)[number]> = {
  "government_organisations.json": "government_organisation",
  "regulators.json": "regulator",
  "local_authorities.json": "local_authority",
  "utilities.json": "utility",
  "tender_portals.json": "tender_portal",
  "business_associations.json": "business_association",
  "licence-types.json": "licence_type",
  "compliance-events.json": "compliance_event",
  "services.json": "service",
};

describe.skipIf(!seedDir)("real Zimbabwe seed dataset", () => {
  it("validates with zero errors and imports completely", async () => {
    const dataset: BlackbookDataset = {};
    for (const [file, category] of Object.entries(SEED_FILE_CATEGORIES)) {
      dataset[category] = JSON.parse(readFileSync(path.join(seedDir!, file), "utf8"));
    }
    const { errors, records } = validateDataset(dataset);
    expect(errors).toEqual([]);
    expect(records.length).toBeGreaterThanOrEqual(113);

    const result = await importDataset({
      actorUserId: owner.userId, countryCode: "ZW",
      datasetRevision: "seed-test", dataset,
    });
    expect(result.recordCount).toBe(records.length);
    expect(result.created + result.updated + result.unchanged).toBe(records.length);
  });
});
