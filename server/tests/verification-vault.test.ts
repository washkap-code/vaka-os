// ============================================================================
// PV-001 TESTS — verification evidence vault.
//   1. Build-dark: whole surface fails closed until verify.centre is ON
//   2. Registration: pins the workspace document version; rejects cross-tenant
//      and archived documents; validity-window validation
//   3. Singleton types: second ACTIVE row of an identity-class type → 409
//   4. Renewal: supersession chain, terminal-row immutability (service + DB)
//   5. Withdrawal: reasoned, terminal thereafter
//   6. Derived expiry states (CURRENT / EXPIRING_SOON / EXPIRED / NO_EXPIRY)
//   7. Tenant isolation on list/detail; permission gates read vs manage
//   8. Audit evidence on every write
// ============================================================================
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { db, schema } from "../src/lib.js";
import { changePassword, createTenantUser, login } from "../src/auth.js";
import { expiryStateOf } from "../src/verification-vault.js";

const app = createApp();
const uniq = `vv${Date.now().toString(36)}`;

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const pngDataUrl = () => `data:image/png;base64,${PNG_BYTES.toString("base64")}`;

async function makeTenant(n: string) {
  const res = await request(app).post("/api/v1/auth/signup").send({
    companyName: `Verify Co ${n}`, subdomain: `${uniq}${n}`, baseCurrency: "USD",
    ownerEmail: `owner-${uniq}-${n}@test.zw`, ownerPassword: "SuperSecret123!", ownerName: "Owner",
    planName: "Growth",
  });
  expect(res.status).toBe(200);
  return { token: res.body.token as string, tenantId: res.body.tenant.id as string };
}
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

let A: { token: string; tenantId: string };
let B: { token: string; tenantId: string };

async function makeWorkspaceDocument(tenant: { token: string }, title: string) {
  const res = await request(app).post("/api/v1/documents").set(auth(tenant.token)).send({
    title, classification: "CERTIFICATE", fileName: `${title}.png`, dataUrl: pngDataUrl(),
  });
  expect(res.status).toBe(200);
  return res.body.id as string;
}

const inYears = (years: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
};

beforeAll(async () => {
  A = await makeTenant("a");
  B = await makeTenant("b");
  // Build-dark rule: the surface fails closed before any flag row exists.
  const dark = await request(app).get("/api/v1/verification/evidence").set(auth(A.token));
  expect(dark.status).toBe(403);
  expect(dark.body.error).toBe("FEATURE_DISABLED");

  await db.insert(schema.tenantFeatureFlags).values([
    { tenantId: A.tenantId, featureKey: "verify.centre", enabled: true, note: "test enable" },
    { tenantId: B.tenantId, featureKey: "verify.centre", enabled: true, note: "test enable" },
    // Evidence bytes live in the documents workspace, so both flags are on.
    { tenantId: A.tenantId, featureKey: "documents.workspace", enabled: true, note: "test enable" },
    { tenantId: B.tenantId, featureKey: "documents.workspace", enabled: true, note: "test enable" },
  ]);
});

describe("registration", () => {
  let taxClearanceDocA: string;

  beforeAll(async () => {
    taxClearanceDocA = await makeWorkspaceDocument(A, "Tax clearance 2026");
  });

  it("registers evidence pinning the document's current version", async () => {
    const res = await request(app).post("/api/v1/verification/evidence").set(auth(A.token)).send({
      evidenceType: "TAX_CLEARANCE", documentId: taxClearanceDocA,
      issuer: "ZIMRA", referenceNumber: "ITF263-2026-001",
      validFrom: "2026-01-01", expiresAt: inYears(1),
    });
    expect(res.status).toBe(200);
    expect(res.body.documentVersion).toBe(1);
    expect(res.body.status).toBe("ACTIVE");
    expect(res.body.expiryState).toBe("CURRENT");
  });

  it("rejects a second ACTIVE row of a singleton type with 409", async () => {
    const res = await request(app).post("/api/v1/verification/evidence").set(auth(A.token)).send({
      evidenceType: "TAX_CLEARANCE", documentId: taxClearanceDocA, issuer: "ZIMRA",
    });
    expect(res.status).toBe(409);
  });

  it("allows multiple ACTIVE rows of non-singleton types", async () => {
    const licence1 = await makeWorkspaceDocument(A, "Shop licence");
    const licence2 = await makeWorkspaceDocument(A, "Liquor licence");
    for (const documentId of [licence1, licence2]) {
      const res = await request(app).post("/api/v1/verification/evidence").set(auth(A.token)).send({
        evidenceType: "LICENCE", documentId, issuer: "City of Harare", expiresAt: inYears(1),
      });
      expect(res.status).toBe(200);
    }
  });

  it("rejects a cross-tenant document reference", async () => {
    const foreignDoc = await makeWorkspaceDocument(B, "B tax clearance");
    const res = await request(app).post("/api/v1/verification/evidence").set(auth(A.token)).send({
      evidenceType: "PROOF_OF_ADDRESS", documentId: foreignDoc, issuer: "ZESA",
    });
    expect(res.status).toBe(400);
  });

  it("rejects an archived backing document", async () => {
    const docId = await makeWorkspaceDocument(A, "Old certificate");
    const archived = await request(app).post(`/api/v1/documents/${docId}/archive`).set(auth(A.token));
    expect(archived.status).toBe(200);
    const res = await request(app).post("/api/v1/verification/evidence").set(auth(A.token)).send({
      evidenceType: "OTHER", documentId: docId, issuer: "Issuer",
    });
    expect(res.status).toBe(400);
  });

  it("rejects an inverted validity window", async () => {
    const docId = await makeWorkspaceDocument(A, "Window test");
    const res = await request(app).post("/api/v1/verification/evidence").set(auth(A.token)).send({
      evidenceType: "OTHER", documentId: docId, issuer: "Issuer",
      validFrom: "2026-06-01", expiresAt: "2026-05-01",
    });
    expect(res.status).toBe(400);
  });
});

describe("renewal and withdrawal", () => {
  let evidenceId: string;

  beforeAll(async () => {
    const docId = await makeWorkspaceDocument(A, "Incorporation certificate");
    const res = await request(app).post("/api/v1/verification/evidence").set(auth(A.token)).send({
      evidenceType: "INCORPORATION_CERTIFICATE", documentId: docId,
      issuer: "Registrar of Companies", expiresAt: inYears(1),
    });
    expect(res.status).toBe(200);
    evidenceId = res.body.id;
  });

  it("renews: successor ACTIVE, predecessor SUPERSEDED with pointer", async () => {
    const newDoc = await makeWorkspaceDocument(A, "Incorporation certificate 2027");
    const renewed = await request(app)
      .post(`/api/v1/verification/evidence/${evidenceId}/renew`).set(auth(A.token)).send({
        evidenceType: "INCORPORATION_CERTIFICATE", documentId: newDoc,
        issuer: "Registrar of Companies", expiresAt: inYears(2),
      });
    expect(renewed.status).toBe(200);
    expect(renewed.body.status).toBe("ACTIVE");

    const old = await request(app)
      .get(`/api/v1/verification/evidence/${evidenceId}`).set(auth(A.token));
    expect(old.status).toBe(200);
    expect(old.body.status).toBe("SUPERSEDED");
    expect(old.body.supersededBy).toBe(renewed.body.id);
    expect(old.body.successor.id).toBe(renewed.body.id);

    const successor = await request(app)
      .get(`/api/v1/verification/evidence/${renewed.body.id}`).set(auth(A.token));
    expect(successor.body.predecessor.id).toBe(evidenceId);

    // Terminal rows are immutable: no second renewal, no withdrawal.
    const again = await request(app)
      .post(`/api/v1/verification/evidence/${evidenceId}/renew`).set(auth(A.token)).send({
        evidenceType: "INCORPORATION_CERTIFICATE", documentId: newDoc, issuer: "Registrar of Companies",
      });
    expect(again.status).toBe(409);
    const withdrawTerminal = await request(app)
      .post(`/api/v1/verification/evidence/${evidenceId}/withdraw`).set(auth(A.token))
      .send({ reason: "should not work" });
    expect(withdrawTerminal.status).toBe(409);
  });

  it("renewal must keep the evidence type", async () => {
    const docId = await makeWorkspaceDocument(A, "Director ID");
    const created = await request(app).post("/api/v1/verification/evidence").set(auth(A.token)).send({
      evidenceType: "DIRECTOR_ID", documentId: docId, issuer: "Registrar General",
    });
    expect(created.status).toBe(200);
    const res = await request(app)
      .post(`/api/v1/verification/evidence/${created.body.id}/renew`).set(auth(A.token)).send({
        evidenceType: "OTHER", documentId: docId, issuer: "Registrar General",
      });
    expect(res.status).toBe(400);
  });

  it("withdraws with a reason and becomes terminal", async () => {
    const docId = await makeWorkspaceDocument(A, "Insurance policy");
    const created = await request(app).post("/api/v1/verification/evidence").set(auth(A.token)).send({
      evidenceType: "INSURANCE", documentId: docId, issuer: "Old Mutual", expiresAt: inYears(1),
    });
    expect(created.status).toBe(200);

    const missingReason = await request(app)
      .post(`/api/v1/verification/evidence/${created.body.id}/withdraw`).set(auth(A.token)).send({});
    expect(missingReason.status).toBe(400);

    const withdrawn = await request(app)
      .post(`/api/v1/verification/evidence/${created.body.id}/withdraw`).set(auth(A.token))
      .send({ reason: "Policy cancelled" });
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.body.status).toBe("WITHDRAWN");
    expect(withdrawn.body.withdrawnReason).toBe("Policy cancelled");

    const again = await request(app)
      .post(`/api/v1/verification/evidence/${created.body.id}/withdraw`).set(auth(A.token))
      .send({ reason: "twice" });
    expect(again.status).toBe(409);
  });

  it("DB refuses a SUPERSEDED row without a pointer (defence in depth)", async () => {
    await expect(db.update(schema.verificationEvidence)
      .set({ status: "SUPERSEDED" })
      .where(and(
        eq(schema.verificationEvidence.tenantId, A.tenantId),
        eq(schema.verificationEvidence.status, "ACTIVE"),
      ))).rejects.toThrow();
  });
});

describe("derived expiry states", () => {
  it("computes CURRENT / EXPIRING_SOON / EXPIRED / NO_EXPIRY", () => {
    const today = new Date("2026-07-17T12:00:00Z");
    expect(expiryStateOf(null, today)).toBe("NO_EXPIRY");
    expect(expiryStateOf("2026-07-16", today)).toBe("EXPIRED");
    expect(expiryStateOf("2026-07-17", today)).toBe("EXPIRING_SOON");
    expect(expiryStateOf("2026-08-16", today)).toBe("EXPIRING_SOON");
    expect(expiryStateOf("2026-08-17", today)).toBe("CURRENT");
  });

  it("summarises expiring evidence in the list response", async () => {
    const docId = await makeWorkspaceDocument(B, "Expiring licence");
    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const created = await request(app).post("/api/v1/verification/evidence").set(auth(B.token)).send({
      evidenceType: "LICENCE", documentId: docId, issuer: "Council", expiresAt: soon,
    });
    expect(created.status).toBe(200);

    const list = await request(app).get("/api/v1/verification/evidence").set(auth(B.token));
    expect(list.status).toBe(200);
    expect(list.body.summary.active).toBeGreaterThanOrEqual(1);
    expect(list.body.summary.expiringSoon).toBeGreaterThanOrEqual(1);
    const row = list.body.items.find((item: any) => item.id === created.body.id);
    expect(row.expiryState).toBe("EXPIRING_SOON");
  });
});

describe("isolation, permissions and audit", () => {
  it("tenant B sees none of tenant A's evidence", async () => {
    const list = await request(app).get("/api/v1/verification/evidence?status=ALL").set(auth(B.token));
    expect(list.status).toBe(200);
    const aRows = await db.select({ id: schema.verificationEvidence.id })
      .from(schema.verificationEvidence)
      .where(eq(schema.verificationEvidence.tenantId, A.tenantId));
    expect(aRows.length).toBeGreaterThan(0);
    const bIds = new Set(list.body.items.map((item: any) => item.id));
    for (const row of aRows) expect(bIds.has(row.id)).toBe(false);

    const detail = await request(app)
      .get(`/api/v1/verification/evidence/${aRows[0].id}`).set(auth(B.token));
    expect(detail.status).toBe(404);
  });

  it("read-only users cannot write", async () => {
    // The Accountant default role carries verify.read but not verify.manage.
    const [accountantRole] = await db.select().from(schema.roles).where(and(
      eq(schema.roles.tenantId, A.tenantId), eq(schema.roles.name, "Accountant"),
    ));
    const [ownerUser] = await db.select().from(schema.users)
      .where(eq(schema.users.email, `owner-${uniq}-a@test.zw`));
    const member = await createTenantUser({
      tenantId: A.tenantId, actorUserId: ownerUser.id,
      email: `reader-${uniq}@test.zw`, fullName: "Read Only", roleId: accountantRole.id,
    });
    const newPassword = "Reader-Pass-2026!";
    await changePassword({
      userId: member.user.id, currentPassword: member.temporaryPassword, newPassword,
    });
    const session = await login(`reader-${uniq}@test.zw`, newPassword, `${uniq}a`);
    const readerToken = session.token;

    const canRead = await request(app).get("/api/v1/verification/evidence").set(auth(readerToken));
    expect(canRead.status).toBe(200);

    const docId = await makeWorkspaceDocument(A, "Reader attempt");
    const cannotWrite = await request(app).post("/api/v1/verification/evidence")
      .set(auth(readerToken)).send({ evidenceType: "OTHER", documentId: docId, issuer: "X" });
    expect(cannotWrite.status).toBe(403);
  });

  it("every write left an audit row", async () => {
    const rows = await db.select({ action: schema.auditLogs.action }).from(schema.auditLogs)
      .where(eq(schema.auditLogs.tenantId, A.tenantId));
    const actions = rows.map((row) => row.action);
    for (const expected of [
      "verification.evidence_added",
      "verification.evidence_renewed",
      "verification.evidence_withdrawn",
    ]) {
      expect(actions).toContain(expected);
    }
  });
});
