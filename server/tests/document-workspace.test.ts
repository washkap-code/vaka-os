// ============================================================================
// PD-001 TESTS — documents workspace.
//   1. Build-dark: whole surface fails closed until documents.workspace is ON
//   2. Folders: create, duplicate-name conflict, cross-tenant parent rejected
//   3. Documents: envelope validation (media type + signature), classification
//   4. Versioning: immutable version rows, currentVersion bump, per-version
//      content reads through the kernel document service
//   5. Archive/restore lifecycle (archived documents refuse new versions)
//   6. Tenant isolation and permission gates
//   7. Audit evidence on every write
// ============================================================================
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { db, schema } from "../src/lib.js";
import { login } from "../src/auth.js";

const app = createApp();
const uniq = `dw${Date.now().toString(36)}`;

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n", "ascii");
const pngDataUrl = () => `data:image/png;base64,${PNG_BYTES.toString("base64")}`;
const pdfDataUrl = () => `data:application/pdf;base64,${PDF_BYTES.toString("base64")}`;

async function makeTenant(n: string) {
  const res = await request(app).post("/api/v1/auth/signup").send({
    companyName: `Documents Co ${n}`, subdomain: `${uniq}${n}`, baseCurrency: "USD",
    ownerEmail: `owner-${uniq}-${n}@test.zw`, ownerPassword: "SuperSecret123!", ownerName: "Owner",
    planName: "Growth",
  });
  expect(res.status).toBe(200);
  return { token: res.body.token as string, tenantId: res.body.tenant.id as string, subdomain: `${uniq}${n}` };
}
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

let A: { token: string; tenantId: string; subdomain: string };
let B: { token: string; tenantId: string; subdomain: string };

beforeAll(async () => {
  A = await makeTenant("a");
  B = await makeTenant("b");
  // Build-dark rule: the surface fails closed before any flag row exists.
  for (const tenant of [A, B]) {
    const dark = await request(app).get("/api/v1/documents").set(auth(tenant.token));
    expect(dark.status).toBe(403);
    expect(dark.body.error).toBe("FEATURE_DISABLED");
  }
  await db.insert(schema.tenantFeatureFlags).values([
    { tenantId: A.tenantId, featureKey: "documents.workspace", enabled: true, note: "test enable" },
    { tenantId: B.tenantId, featureKey: "documents.workspace", enabled: true, note: "test enable" },
  ]);
});

describe("folders", () => {
  it("creates folders, rejects duplicates and cross-tenant parents", async () => {
    const root = await request(app).post("/api/v1/documents/folders").set(auth(A.token))
      .send({ name: "Compliance" });
    expect(root.status).toBe(200);

    const duplicate = await request(app).post("/api/v1/documents/folders").set(auth(A.token))
      .send({ name: "Compliance" });
    expect(duplicate.status).toBe(409);

    const child = await request(app).post("/api/v1/documents/folders").set(auth(A.token))
      .send({ name: "Licences", parentId: root.body.id });
    expect(child.status).toBe(200);
    expect(child.body.parentId).toBe(root.body.id);

    const foreignParent = await request(app).post("/api/v1/documents/folders").set(auth(B.token))
      .send({ name: "Sneaky", parentId: root.body.id });
    expect(foreignParent.status).toBe(400);

    const list = await request(app).get("/api/v1/documents/folders").set(auth(A.token));
    expect(list.status).toBe(200);
    expect(list.body.map((f: any) => f.name)).toContain("Compliance");
    expect(list.body.map((f: any) => f.name)).toContain("Licences");
  });
});

describe("documents and versions", () => {
  let folderId: string;
  let documentId: string;

  beforeAll(async () => {
    const folder = await request(app).post("/api/v1/documents/folders").set(auth(A.token))
      .send({ name: "Contracts" });
    folderId = folder.body.id;
  });

  it("rejects invalid envelopes and classifications", async () => {
    const badMedia = await request(app).post("/api/v1/documents").set(auth(A.token)).send({
      title: "Bad media", classification: "CONTRACT", fileName: "x.txt",
      dataUrl: `data:text/plain;base64,${Buffer.from("hello").toString("base64")}`,
    });
    expect(badMedia.status).toBe(400);

    const badSignature = await request(app).post("/api/v1/documents").set(auth(A.token)).send({
      title: "Bad signature", classification: "CONTRACT", fileName: "x.png",
      dataUrl: `data:image/png;base64,${PDF_BYTES.toString("base64")}`,
    });
    expect(badSignature.status).toBe(400);

    const badClassification = await request(app).post("/api/v1/documents").set(auth(A.token)).send({
      title: "Bad class", classification: "SECRET", fileName: "x.pdf", dataUrl: pdfDataUrl(),
    });
    expect(badClassification.status).toBe(400);
  });

  it("creates a document with an immutable first version", async () => {
    const created = await request(app).post("/api/v1/documents").set(auth(A.token)).send({
      title: "Supplier master agreement", classification: "CONTRACT",
      folderId, fileName: "supplier agreement.pdf", dataUrl: pdfDataUrl(),
    });
    expect(created.status).toBe(200);
    expect(created.body.currentVersion).toBe(1);
    expect(created.body.status).toBe("ACTIVE");
    documentId = created.body.id;

    const detail = await request(app).get(`/api/v1/documents/${documentId}`).set(auth(A.token));
    expect(detail.status).toBe(200);
    expect(detail.body.versions).toHaveLength(1);
    expect(detail.body.versions[0].version).toBe(1);
    expect(detail.body.versions[0].mediaType).toBe("application/pdf");
  });

  it("adds a new version and serves per-version content through the kernel", async () => {
    const v2 = await request(app).post(`/api/v1/documents/${documentId}/versions`)
      .set(auth(A.token)).send({ fileName: "supplier agreement v2.png", dataUrl: pngDataUrl() });
    expect(v2.status).toBe(200);
    expect(v2.body.currentVersion).toBe(2);

    const latest = await request(app).get(`/api/v1/documents/${documentId}/content`).set(auth(A.token));
    expect(latest.status).toBe(200);
    expect(latest.body.version).toBe(2);
    expect(latest.body.mediaType).toBe("image/png");
    expect(latest.body.dataUrl).toBe(pngDataUrl());

    const first = await request(app).get(`/api/v1/documents/${documentId}/content?version=1`).set(auth(A.token));
    expect(first.status).toBe(200);
    expect(first.body.version).toBe(1);
    expect(first.body.mediaType).toBe("application/pdf");
    expect(first.body.dataUrl).toBe(pdfDataUrl());

    const missing = await request(app).get(`/api/v1/documents/${documentId}/content?version=9`).set(auth(A.token));
    expect(missing.status).toBe(404);
  });

  it("archives, refuses versions while archived, restores", async () => {
    const archived = await request(app).post(`/api/v1/documents/${documentId}/archive`).set(auth(A.token));
    expect(archived.status).toBe(200);
    expect(archived.body.status).toBe("ARCHIVED");

    const again = await request(app).post(`/api/v1/documents/${documentId}/archive`).set(auth(A.token));
    expect(again.status).toBe(409);

    const rejected = await request(app).post(`/api/v1/documents/${documentId}/versions`)
      .set(auth(A.token)).send({ fileName: "late.pdf", dataUrl: pdfDataUrl() });
    expect(rejected.status).toBe(409);

    const active = await request(app).get("/api/v1/documents").set(auth(A.token));
    expect(active.body.some((d: any) => d.id === documentId)).toBe(false);
    const archivedList = await request(app).get("/api/v1/documents?status=ARCHIVED").set(auth(A.token));
    expect(archivedList.body.some((d: any) => d.id === documentId)).toBe(true);

    const restored = await request(app).post(`/api/v1/documents/${documentId}/restore`).set(auth(A.token));
    expect(restored.status).toBe(200);
    expect(restored.body.status).toBe("ACTIVE");
  });

  it("isolates tenants completely", async () => {
    const detail = await request(app).get(`/api/v1/documents/${documentId}`).set(auth(B.token));
    expect(detail.status).toBe(404);
    const content = await request(app).get(`/api/v1/documents/${documentId}/content`).set(auth(B.token));
    expect(content.status).toBe(404);
    const version = await request(app).post(`/api/v1/documents/${documentId}/versions`)
      .set(auth(B.token)).send({ fileName: "b.pdf", dataUrl: pdfDataUrl() });
    expect(version.status).toBe(404);
    const list = await request(app).get("/api/v1/documents?status=ALL").set(auth(B.token));
    expect(list.body.some((d: any) => d.id === documentId)).toBe(false);
  });

  it("records audit evidence for every write", async () => {
    const rows = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, A.tenantId),
      eq(schema.auditLogs.entityType, "workspace_document"),
    ));
    const actions = rows.map((row) => row.action);
    expect(actions).toContain("document.created");
    expect(actions).toContain("document.version_added");
    expect(actions).toContain("document.archived");
    expect(actions).toContain("document.restored");
  });
});

describe("permissions", () => {
  it("denies the surface to roles without documents permissions", async () => {
    const roles = await db.select().from(schema.roles).where(eq(schema.roles.tenantId, A.tenantId));
    const sales = roles.find((r) => r.name === "Sales")!;
    expect(sales.permissions).not.toContain("documents.read");
    const email = `sales-${uniq}@test.zw`;
    await db.insert(schema.users).values({
      tenantId: A.tenantId, email, fullName: "Sales User",
      passwordHash: await bcrypt.hash("Sales-Test-123!", 4),
      roleId: sales.id, mustChangePassword: false, status: "active",
    });
    const token = (await login(email, "Sales-Test-123!", A.subdomain)).token;
    const read = await request(app).get("/api/v1/documents").set(auth(token));
    expect(read.status).toBe(403);
    const write = await request(app).post("/api/v1/documents").set(auth(token)).send({
      title: "Nope", classification: "OTHER", fileName: "n.pdf", dataUrl: pdfDataUrl(),
    });
    expect(write.status).toBe(403);
  });

  it("seeds Accountant with read-only document access", async () => {
    const roles = await db.select().from(schema.roles).where(eq(schema.roles.tenantId, A.tenantId));
    const accountant = roles.find((r) => r.name === "Accountant")!;
    expect(accountant.permissions).toContain("documents.read");
    expect(accountant.permissions).not.toContain("documents.manage");
    const owner = roles.find((r) => r.name === "Owner")!;
    expect(owner.permissions).toContain("documents.manage");
  });
});
