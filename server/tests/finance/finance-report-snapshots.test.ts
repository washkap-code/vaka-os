import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { login } from "../../src/auth.js";
import { loadFinanceReportSnapshotPdf } from "../../src/finance-report-snapshots.js";
import { db, schema } from "../../src/lib.js";
import { signupFinanceTenant } from "./helpers.js";

const app = createApp();
const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
};
const digest = (value: Buffer) => createHash("sha256").update(value).digest("hex");

async function restrictedToken(tenantId: string, subdomain: string) {
  const [role] = await db.insert(schema.roles).values({
    tenantId,
    name: `No snapshot reports ${Date.now()}`,
    permissions: ["crm.read"],
    isSystem: false,
  }).returning();
  const email = `no-snapshot-reports-${Date.now()}@test.vaka`;
  const password = "Snapshot-Test-123!";
  await db.insert(schema.users).values({
    tenantId,
    email,
    passwordHash: await bcrypt.hash(password, 4),
    fullName: "Restricted Snapshot User",
    roleId: role.id,
  });
  return (await login(email, password, subdomain)).token;
}

describe("P7-002 immutable finance report snapshots", () => {
  it("creates, replays and retrieves exact tenant-scoped VAT snapshot evidence", async () => {
    const tenant = await signupFinanceTenant("report-snapshot-vat");
    const other = await signupFinanceTenant("report-snapshot-other");
    await db.update(schema.tenants).set({
      companyName: "Snapshot Evidence Company",
      brandPrimaryColor: "#234B65",
      brandSecondaryColor: "#D8A62A",
      registrationNumber: "SNAP-001",
    }).where(eq(schema.tenants.id, tenant.tenantId));
    const journalsBefore = await db.select({ id: schema.journalEntries.id }).from(schema.journalEntries)
      .where(eq(schema.journalEntries.tenantId, tenant.tenantId));
    const body = { reportType: "VAT", period: { from: today(), to: today() }, confirm: true };
    const created = await request(app).post("/api/v1/reports/snapshots")
      .set(tenant.auth).set("Idempotency-Key", "vat-snapshot-key-001").send(body);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      reportType: "VAT",
      reportVersion: "vat-technical-preview-v1",
      pdfTemplateVersion: "finance-report-pdf-v1",
      brandingVersion: "finance-report-branding-v1",
      mediaType: "application/pdf",
      deduplicated: false,
    });
    expect(created.body.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(created.body).not.toHaveProperty("reportDocument");
    expect(created.body).not.toHaveProperty("brandingDocument");
    expect((await request(app).post("/api/v1/reports/snapshots").set(tenant.auth).send(body)).status).toBe(400);
    expect((await request(app).post("/api/v1/reports/snapshots")
      .set(tenant.auth).set("Idempotency-Key", "vat-snapshot-key-002")
      .send({ ...body, confirm: false })).status).toBe(400);

    const replay = await request(app).post("/api/v1/reports/snapshots")
      .set(tenant.auth).set("Idempotency-Key", "vat-snapshot-key-001").send(body);
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ id: created.body.id, checksum: created.body.checksum, deduplicated: true });

    const conflict = await request(app).post("/api/v1/reports/snapshots")
      .set(tenant.auth).set("Idempotency-Key", "vat-snapshot-key-001")
      .send({ ...body, period: { from: yesterday(), to: today() } });
    expect(conflict.status).toBe(409);

    await db.update(schema.tenants).set({ companyName: "Changed Current Company" })
      .where(eq(schema.tenants.id, tenant.tenantId));
    const replayAfterBrandChange = await request(app).post("/api/v1/reports/snapshots")
      .set(tenant.auth).set("Idempotency-Key", "vat-snapshot-key-001").send(body);
    expect(replayAfterBrandChange.body).toMatchObject({
      id: created.body.id,
      checksum: created.body.checksum,
      deduplicated: true,
    });
    const pdf = await request(app).get(`/api/v1/reports/snapshots/${created.body.id}/pdf`).set(tenant.auth);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect(pdf.headers["cache-control"]).toBe("private, no-store");
    expect(pdf.body.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(pdf.body.byteLength).toBe(created.body.byteSize);
    expect(digest(pdf.body)).toBe(created.body.checksum);
    expect(pdf.body.toString("latin1")).toContain("Snapshot Evidence Company");
    expect(pdf.body.toString("latin1")).not.toContain("Changed Current Company");

    const listed = await request(app).get("/api/v1/reports/snapshots").set(tenant.auth);
    expect(listed.status).toBe(200);
    expect(listed.body.some((row: { id: string }) => row.id === created.body.id)).toBe(true);
    expect(listed.body[0]).not.toHaveProperty("reportDocument");

    expect((await request(app).get(`/api/v1/reports/snapshots/${created.body.id}`).set(other.auth)).status).toBe(404);
    expect((await request(app).get(`/api/v1/reports/snapshots/${created.body.id}/pdf`).set(other.auth)).status).toBe(404);
    expect((await request(app).get("/api/v1/reports/snapshots/not-a-uuid").set(tenant.auth)).status).toBe(400);

    const [tenantRow] = await db.select({ subdomain: schema.tenants.subdomain }).from(schema.tenants)
      .where(eq(schema.tenants.id, tenant.tenantId));
    const denied = await restrictedToken(tenant.tenantId, tenantRow.subdomain);
    expect((await request(app).get("/api/v1/reports/snapshots").set("Authorization", `Bearer ${denied}`)).status).toBe(403);

    const audits = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, tenant.tenantId),
      eq(schema.auditLogs.entityId, created.body.id),
    ));
    expect(audits.map((row) => row.action).sort()).toEqual(["report.snapshot_created", "report.snapshot_opened"]);
    expect(JSON.stringify(audits.map((row) => row.metadata))).not.toContain("Snapshot Evidence Company");
    expect(JSON.stringify(audits.map((row) => row.metadata))).not.toContain("reportDocument");

    try {
      await db.update(schema.financeReportSnapshots).set({ fileName: "changed.pdf" })
        .where(eq(schema.financeReportSnapshots.id, created.body.id));
      throw new Error("Expected append-only database control to reject snapshot mutation");
    } catch (error) {
      expect((error as { cause?: Error }).cause?.message).toMatch(/append-only/i);
    }
    const journalsAfter = await db.select({ id: schema.journalEntries.id }).from(schema.journalEntries)
      .where(eq(schema.journalEntries.tenantId, tenant.tenantId));
    expect(journalsAfter).toEqual(journalsBefore);
  });

  it("captures and replays a statutory report from immutable stored inputs", async () => {
    const tenant = await signupFinanceTenant("report-snapshot-statutory");
    const body = {
      reportType: "STATUTORY",
      period: { from: today(), to: today(), asAt: today() },
      confirm: true,
    };
    const created = await request(app).post("/api/v1/reports/snapshots")
      .set(tenant.auth).set("Idempotency-Key", "statutory-snapshot-key-001").send(body);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ reportType: "STATUTORY", reportVersion: "statutory-report-pack-v1" });
    const pdf = await request(app).get(`/api/v1/reports/snapshots/${created.body.id}/pdf`).set(tenant.auth);
    expect(pdf.status).toBe(200);
    expect(digest(pdf.body)).toBe(created.body.checksum);
    expect(pdf.body.toString("latin1")).toContain("Management accounts and statutory report pack");
  });

  it("fails closed when stored snapshot integrity evidence does not match", async () => {
    const tenant = await signupFinanceTenant("report-snapshot-integrity");
    const created = await request(app).post("/api/v1/reports/snapshots")
      .set(tenant.auth).set("Idempotency-Key", "integrity-snapshot-key-001")
      .send({ reportType: "VAT", period: { from: today(), to: today() }, confirm: true });
    expect(created.status).toBe(201);
    const [source] = await db.select().from(schema.financeReportSnapshots).where(and(
      eq(schema.financeReportSnapshots.id, created.body.id),
      eq(schema.financeReportSnapshots.tenantId, tenant.tenantId),
    ));
    const [corrupt] = await db.insert(schema.financeReportSnapshots).values({
      tenantId: source.tenantId,
      reportType: source.reportType,
      reportVersion: source.reportVersion,
      pdfTemplateVersion: source.pdfTemplateVersion,
      brandingVersion: source.brandingVersion,
      parameters: source.parameters,
      reportDocument: source.reportDocument,
      brandingDocument: source.brandingDocument,
      fileName: source.fileName,
      mediaType: source.mediaType,
      byteSize: source.byteSize,
      checksum: "0".repeat(64),
      idempotencyKey: "integrity-snapshot-key-corrupt",
      idempotencyFingerprint: source.idempotencyFingerprint,
      createdBy: source.createdBy,
    }).returning();
    await expect(loadFinanceReportSnapshotPdf(tenant.tenantId, corrupt.id)).rejects
      .toThrow("failed integrity verification");
  });
});
