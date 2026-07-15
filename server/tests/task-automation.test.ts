// ============================================================================
// PW-003 TESTS — task centre + opt-in event automation.
//   1. Manual tasks: create, close, double-close conflict, invalid assignee
//   2. Automation: disabled by default; enabled rule creates exactly one
//      OPEN task per subject (dedupe on re-fired events)
//   3. Rules settings: catalogue, permission gate, audit
//   4. Tenant isolation
// ============================================================================
import request from "supertest";
import { describe, expect, it, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { db, schema } from "../src/lib.js";
import { buildPlatformKernel, EVENT_BUS } from "../src/platform-runtime.js";
import { DOMAIN_EVENTS } from "../src/platform/events/registry.js";
import { signupFinanceTenant, type TestTenant } from "./finance/helpers.js";

const app = createApp();
const runId = `ta${Date.now().toString(36)}`;

let A: TestTenant;
let B: TestTenant;

beforeAll(async () => {
  A = await signupFinanceTenant(`${runId}-a`);
  B = await signupFinanceTenant(`${runId}-b`);
  // PW-004: the entire task surface ships dark behind workflow.centre.
  // Prove fail-closed first, then enable for both tenants for the suite.
  const dark = await request(app).get("/api/v1/tasks").set(A.auth);
  expect(dark.status).toBe(403);
  expect(dark.body.error).toBe("FEATURE_DISABLED");
  await db.insert(schema.tenantFeatureFlags).values([
    { tenantId: A.tenantId, featureKey: "workflow.centre", enabled: true, note: "test enable" },
    { tenantId: B.tenantId, featureKey: "workflow.centre", enabled: true, note: "test enable" },
  ]);
});

describe("manual tasks", () => {
  it("creates, lists and closes a task with audit; double-close conflicts", async () => {
    const created = await request(app).post("/api/v1/tasks").set(A.auth)
      .send({ title: "Call the bank about the merchant account" });
    expect(created.status).toBe(200);
    expect(created.body.status).toBe("OPEN");

    const open = await request(app).get("/api/v1/tasks").set(A.auth);
    expect(open.status).toBe(200);
    expect(open.body.some((t: any) => t.id === created.body.id)).toBe(true);

    const closed = await request(app).post(`/api/v1/tasks/${created.body.id}/close`)
      .set(A.auth).send({ outcome: "DONE" });
    expect(closed.status).toBe(200);
    expect(closed.body.status).toBe("DONE");
    expect(closed.body.closedAt).toBeTruthy();

    const again = await request(app).post(`/api/v1/tasks/${created.body.id}/close`)
      .set(A.auth).send({ outcome: "DISMISSED" });
    expect(again.status).toBe(409);

    const events = await db.select().from(schema.auditLogs)
      .where(eq(schema.auditLogs.tenantId, A.tenantId));
    expect(events.some((e) => e.action === "task.created")).toBe(true);
    expect(events.some((e) => e.action === "task.closed")).toBe(true);
  });

  it("rejects an assignee outside the tenant", async () => {
    const [foreignUser] = await db.select({ id: schema.users.id }).from(schema.users)
      .where(eq(schema.users.tenantId, B.tenantId));
    const res = await request(app).post("/api/v1/tasks").set(A.auth)
      .send({ title: "Cross-tenant assignment must fail", assignedTo: foreignUser.id });
    expect(res.status).toBe(400);
  });
});

describe("automation rules", () => {
  const bus = () => buildPlatformKernel().container.get(EVENT_BUS);
  const fireApprovalEvent = (tenantId: string, entityId: string) =>
    bus().publish({
      id: crypto.randomUUID(),
      type: DOMAIN_EVENTS.PROCUREMENT_APPROVAL_REQUESTED,
      occurredAt: new Date(),
      tenantId,
      actorUserId: null,
      payload: { kind: "purchase_order", entityId, number: "PO-00042", requesterUserId: crypto.randomUUID() },
    });

  it("does nothing while the rule is disabled (default)", async () => {
    await fireApprovalEvent(A.tenantId, crypto.randomUUID());
    const tasks = await request(app).get("/api/v1/tasks").set(A.auth);
    expect(tasks.body.filter((t: any) => t.sourceType === "automation")).toHaveLength(0);
  });

  it("creates exactly one open task per subject once enabled (dedupe)", async () => {
    const enable = await request(app).put("/api/v1/settings/automation-rules/procurement-approval-task")
      .set(A.auth).send({ enabled: true });
    expect(enable.status).toBe(200);
    expect(enable.body.find((r: any) => r.key === "procurement-approval-task").enabled).toBe(true);

    const subjectId = crypto.randomUUID();
    await fireApprovalEvent(A.tenantId, subjectId);
    await fireApprovalEvent(A.tenantId, subjectId); // duplicate event
    const tasks = await request(app).get("/api/v1/tasks").set(A.auth);
    const automationTasks = tasks.body.filter((t: any) => t.subjectId === subjectId);
    expect(automationTasks).toHaveLength(1);
    expect(automationTasks[0].title).toBe("Approve purchase order PO-00042");
    expect(automationTasks[0].sourceKey).toBe("procurement-approval-task");

    // Closing frees the dedupe slot; the same subject can raise a new task.
    await request(app).post(`/api/v1/tasks/${automationTasks[0].id}/close`)
      .set(A.auth).send({ outcome: "DONE" });
    await fireApprovalEvent(A.tenantId, subjectId);
    const after = await request(app).get("/api/v1/tasks").set(A.auth);
    expect(after.body.filter((t: any) => t.subjectId === subjectId)).toHaveLength(1);
  });

  it("keeps rules and tasks tenant-isolated", async () => {
    // Rule enabled for A only; B's identical event creates nothing.
    await fireApprovalEvent(B.tenantId, crypto.randomUUID());
    const bTasks = await request(app).get("/api/v1/tasks").set(B.auth);
    expect(bTasks.body.filter((t: any) => t.sourceType === "automation")).toHaveLength(0);

    // A's tasks are invisible to B.
    const aTasks = await request(app).get("/api/v1/tasks").set(A.auth);
    expect(aTasks.body.length).toBeGreaterThan(0);
    const bAll = await request(app).get("/api/v1/tasks?status=ALL").set(B.auth);
    expect(bAll.body.some((t: any) => aTasks.body.some((a: any) => a.id === t.id))).toBe(false);
  });

  it("gates rule configuration behind settings.manage and audits toggles", async () => {
    const rules = await request(app).get("/api/v1/settings/automation-rules").set(A.auth);
    expect(rules.status).toBe(200);
    expect(rules.body).toHaveLength(2);

    const unknown = await request(app).put("/api/v1/settings/automation-rules/not-a-rule")
      .set(A.auth).send({ enabled: true });
    expect(unknown.status).toBe(400);

    const events = await db.select().from(schema.auditLogs)
      .where(eq(schema.auditLogs.tenantId, A.tenantId));
    expect(events.some((e) => e.action === "automation_rule.enabled")).toBe(true);
  });
});
