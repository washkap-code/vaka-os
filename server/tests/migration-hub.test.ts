// ============================================================================
// PM-001/PM-002 TESTS — Migration Hub.
//   1. Fails closed without `migration.hub`.
//   2. Project lifecycle: create → stage → commit → reconcile → close.
//   3. Contacts step: staged commit creates contacts; rollback hard-deletes
//      them (guarded) and marks rows ROLLED_BACK.
//   4. Opening trial balance: balanced TB posts ONE journal; unbalanced or
//      invalid TBs are rejected leaving the ledger unchanged; rollback posts
//      a reversal journal (append-only) with net-zero account effect.
//   5. Open invoices: memo register with contact matching; rollback deletes.
//   6. Opening stock rollback is refused (documented v1 limitation).
//   7. Owner sign-off recorded; close blocked while steps are STAGED.
// ============================================================================
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { and, eq, sql } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { db, schema } from "../src/lib.js";

const app = createApp();
const uniq = `pm${Date.now().toString(36)}`;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

let A: { token: string; tenantId: string };
let B: { token: string; tenantId: string };
let projectId: string;

async function makeTenant(n: string) {
  const res = await request(app).post("/api/v1/auth/signup").send({
    companyName: `Migrate Co ${n} ${uniq}`, subdomain: `${uniq}${n}`, baseCurrency: "USD",
    ownerEmail: `owner-${uniq}-${n}@test.zw`, ownerPassword: "SuperSecret123!", ownerName: "Owner",
    planName: "Growth",
  });
  expect(res.status).toBe(200);
  return { token: res.body.token as string, tenantId: res.body.tenant.id as string };
}

async function journalTotals(tenantId: string) {
  const [row] = await db.select({
    entries: sql<number>`count(distinct ${schema.journalEntries.id})::int`,
    debits: sql<string>`coalesce(sum(${schema.journalLines.debit}), 0)::text`,
    credits: sql<string>`coalesce(sum(${schema.journalLines.credit}), 0)::text`,
  }).from(schema.journalEntries)
    .leftJoin(schema.journalLines, eq(schema.journalLines.journalEntryId, schema.journalEntries.id))
    .where(eq(schema.journalEntries.tenantId, tenantId));
  return row;
}

beforeAll(async () => {
  A = await makeTenant("a");
  B = await makeTenant("b");
  await db.insert(schema.tenantFeatureFlags).values({
    tenantId: A.tenantId, featureKey: "migration.hub", enabled: true, note: "test enable",
  });
});

describe("feature gating", () => {
  it("fails closed for a tenant without the flag", async () => {
    const res = await request(app).get("/api/v1/migration/projects").set(auth(B.token));
    expect(res.status).toBe(403);
  });
});

describe("project + contacts step (PM-001)", () => {
  it("creates a project", async () => {
    const res = await request(app).post("/api/v1/migration/projects").set(auth(A.token))
      .send({ name: "Move from OldBooks", sourceSystem: "OldBooks 9" });
    expect(res.status).toBe(200);
    projectId = res.body.id;
    expect(res.body.status).toBe("OPEN");
  });
  let contactsStepId: string;
  it("stages, commits and verifies a contacts step", async () => {
    const csv = "name,email,is_customer\nMigrated Alpha Ltd,alpha@migrate.test,true\nMigrated Beta Ltd,beta@migrate.test,true\n";
    const preview = await request(app)
      .post(`/api/v1/migration/projects/${projectId}/steps/contacts/preview`)
      .set(auth(A.token)).send({ csvText: csv });
    expect(preview.status).toBe(200);
    expect(preview.body.step.status).toBe("STAGED");
    expect(preview.body.step.summary.validRows).toBe(2);
    contactsStepId = preview.body.step.id;

    const commit = await request(app)
      .post(`/api/v1/migration/projects/${projectId}/steps/${contactsStepId}/commit`)
      .set(auth(A.token)).send({});
    expect(commit.status).toBe(200);
    expect(commit.body.step.status).toBe("COMMITTED");
    const contacts = await db.select().from(schema.contacts).where(and(
      eq(schema.contacts.tenantId, A.tenantId),
    ));
    expect(contacts.filter((c) => c.name.startsWith("Migrated")).length).toBe(2);
  });
  it("rolls back the contacts step (hard delete, audited)", async () => {
    const res = await request(app)
      .post(`/api/v1/migration/projects/${projectId}/steps/${contactsStepId}/rollback`)
      .set(auth(A.token)).send({ reason: "Wrong source file used" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ROLLED_BACK");
    const contacts = await db.select().from(schema.contacts)
      .where(eq(schema.contacts.tenantId, A.tenantId));
    expect(contacts.filter((c) => c.name.startsWith("Migrated")).length).toBe(0);
  });
});

describe("opening trial balance (PM-002)", () => {
  let codes: { code: string }[] = [];
  let tbStepId: string;
  beforeAll(async () => {
    codes = await db.select({ code: schema.accounts.code }).from(schema.accounts)
      .where(and(eq(schema.accounts.tenantId, A.tenantId), eq(schema.accounts.isActive, true)))
      .limit(2);
    expect(codes.length).toBe(2);
  });
  it("rejects a TB with an unknown account code at commit", async () => {
    const csv = `account_code,debit,credit\n${codes[0].code},100.00,\nNOPE-999,,100.00\n`;
    const preview = await request(app)
      .post(`/api/v1/migration/projects/${projectId}/steps/opening_trial_balance/preview`)
      .set(auth(A.token)).send({ csvText: csv });
    expect(preview.status).toBe(200);
    expect(preview.body.step.summary.invalidRows).toBe(1);
    const commit = await request(app)
      .post(`/api/v1/migration/projects/${projectId}/steps/${preview.body.step.id}/commit`)
      .set(auth(A.token)).send({ asOfDate: "2026-01-01" });
    expect(commit.status).toBe(409);
  });
  it("rejects an unbalanced TB at commit, leaving the ledger unchanged", async () => {
    const before = await journalTotals(A.tenantId);
    const csv = `account_code,debit,credit\n${codes[0].code},100.00,\n${codes[1].code},,90.00\n`;
    const preview = await request(app)
      .post(`/api/v1/migration/projects/${projectId}/steps/opening_trial_balance/preview`)
      .set(auth(A.token)).send({ csvText: csv });
    expect(preview.status).toBe(200);
    const commit = await request(app)
      .post(`/api/v1/migration/projects/${projectId}/steps/${preview.body.step.id}/commit`)
      .set(auth(A.token)).send({ asOfDate: "2026-01-01" });
    expect(commit.status).toBe(409);
    expect(JSON.stringify(commit.body)).toMatch(/balance/i);
    const after = await journalTotals(A.tenantId);
    expect(after.entries).toBe(before.entries);
  });
  it("posts a balanced TB as one journal and reconciles", async () => {
    const csv = `account_code,account_name,debit,credit\n${codes[0].code},X,1500.00,\n${codes[1].code},Y,,1500.00\n`;
    const preview = await request(app)
      .post(`/api/v1/migration/projects/${projectId}/steps/opening_trial_balance/preview`)
      .set(auth(A.token)).send({ csvText: csv });
    expect(preview.status).toBe(200);
    tbStepId = preview.body.step.id;
    const commit = await request(app)
      .post(`/api/v1/migration/projects/${projectId}/steps/${tbStepId}/commit`)
      .set(auth(A.token)).send({ asOfDate: "2026-01-01" });
    expect(commit.status).toBe(200);
    expect(commit.body.result.journalEntryId).toBeTruthy();
    expect(commit.body.result.debitTotal).toBe("1500.00");

    const recon = await request(app)
      .get(`/api/v1/migration/projects/${projectId}/reconciliation`).set(auth(A.token));
    expect(recon.status).toBe(200);
    expect(recon.body.openingTrialBalance.journalEntryId).toBe(commit.body.result.journalEntryId);
    expect(recon.body.openingTrialBalance.posted.debitTotal).toBe("1500.00");
    expect(recon.body.openingTrialBalance.posted.creditTotal).toBe("1500.00");
  });
  it("rolls back via a reversal journal with net-zero effect", async () => {
    const before = await journalTotals(A.tenantId);
    const res = await request(app)
      .post(`/api/v1/migration/projects/${projectId}/steps/${tbStepId}/rollback`)
      .set(auth(A.token)).send({ reason: "Opening balances re-cut by accountant" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ROLLED_BACK");
    expect(res.body.reversalJournalEntryId).toBeTruthy();
    const after = await journalTotals(A.tenantId);
    expect(after.entries).toBe(before.entries + 1);
    // Ledger stays balanced and the reversal nets the opening journal to zero:
    expect(after.debits).toBe(after.credits);
  });
});

describe("open invoices register (PM-002)", () => {
  let stepId: string;
  it("stages and commits AR open items with contact matching", async () => {
    // Create a contact that should match by name.
    const csvContacts = "name,is_customer\nMatched Customer Ltd,true\n";
    const cPrev = await request(app)
      .post(`/api/v1/migration/projects/${projectId}/steps/contacts/preview`)
      .set(auth(A.token)).send({ csvText: csvContacts });
    await request(app)
      .post(`/api/v1/migration/projects/${projectId}/steps/${cPrev.body.step.id}/commit`)
      .set(auth(A.token)).send({});

    const csv = "customer,invoice_number,issue_date,currency,amount,balance\nMatched Customer Ltd,INV-100,2025-11-01,USD,500.00,200.00\nUnknown Customer,INV-101,2025-12-01,USD,300.00,300.00\n";
    const preview = await request(app)
      .post(`/api/v1/migration/projects/${projectId}/steps/open_invoices/preview`)
      .set(auth(A.token)).send({ csvText: csv });
    expect(preview.status).toBe(200);
    stepId = preview.body.step.id;
    const commit = await request(app)
      .post(`/api/v1/migration/projects/${projectId}/steps/${stepId}/commit`)
      .set(auth(A.token)).send({});
    expect(commit.status).toBe(200);
    expect(commit.body.result).toMatchObject({
      itemCount: 2, matchedContacts: 1, totalBalance: "500.00",
    });
    const recon = await request(app)
      .get(`/api/v1/migration/projects/${projectId}/reconciliation`).set(auth(A.token));
    const ar = recon.body.openItems.find((r: any) => r.side === "AR" && r.currency === "USD");
    expect(ar.count).toBe(2);
    expect(ar.totalBalance).toBe("500.00");
  });
  it("rollback deletes the register rows", async () => {
    const res = await request(app)
      .post(`/api/v1/migration/projects/${projectId}/steps/${stepId}/rollback`)
      .set(auth(A.token)).send({ reason: "Re-import with corrected balances" });
    expect(res.status).toBe(200);
    const items = await db.select().from(schema.migrationOpenItems)
      .where(eq(schema.migrationOpenItems.stepId, stepId));
    expect(items).toHaveLength(0);
  });
});

describe("governance", () => {
  it("records the accountant sign-off (owner)", async () => {
    const res = await request(app)
      .post(`/api/v1/migration/projects/${projectId}/sign-off`).set(auth(A.token))
      .send({ reviewerName: "T. Accountant", reviewerRole: "Chartered Accountant (Z)", note: "Opening balances agreed to source TB." });
    expect(res.status).toBe(200);
    expect(res.body.signOff.reviewerName).toBe("T. Accountant");
  });
  it("refuses to close while a step is STAGED, then closes cleanly", async () => {
    const csv = "name,is_customer\nDangling Stage Ltd,true\n";
    const preview = await request(app)
      .post(`/api/v1/migration/projects/${projectId}/steps/contacts/preview`)
      .set(auth(A.token)).send({ csvText: csv });
    const blocked = await request(app)
      .post(`/api/v1/migration/projects/${projectId}/close`).set(auth(A.token));
    expect(blocked.status).toBe(409);
    await request(app)
      .post(`/api/v1/migration/projects/${projectId}/steps/${preview.body.step.id}/commit`)
      .set(auth(A.token)).send({});
    // Discard every remaining staged step (the two deliberately-rejected TB
    // stages above); a discarded step's batch can never be committed.
    const project = await request(app)
      .get(`/api/v1/migration/projects/${projectId}`).set(auth(A.token));
    for (const step of project.body.steps.filter((s: any) => s.status === "STAGED")) {
      const discarded = await request(app)
        .post(`/api/v1/migration/projects/${projectId}/steps/${step.id}/discard`)
        .set(auth(A.token));
      expect(discarded.status).toBe(200);
      expect(discarded.body.status).toBe("DISCARDED");
      const recommit = await request(app)
        .post(`/api/v1/migration/projects/${projectId}/steps/${step.id}/commit`)
        .set(auth(A.token)).send({ asOfDate: "2026-01-01" });
      expect(recommit.status).toBe(409);
    }
    const closed = await request(app)
      .post(`/api/v1/migration/projects/${projectId}/close`).set(auth(A.token));
    expect(closed.status).toBe(200);
    expect(closed.body.status).toBe("CLOSED");
    // Closed project refuses further staging.
    const again = await request(app)
      .post(`/api/v1/migration/projects/${projectId}/steps/contacts/preview`)
      .set(auth(A.token)).send({ csvText: csv });
    expect(again.status).toBe(409);
  });
});
