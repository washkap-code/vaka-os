// ============================================================================
// PW-003 — Tenant task centre + opt-in event automation.
//
// Tasks are operational work items only — never financial writes. Automation
// rules map domain events to task creation from a closed, code-defined
// catalogue; a tenant enables each rule explicitly (no row = disabled).
// A partial unique index dedupes OPEN automation tasks per subject, so a
// re-fired event never creates a second open task.
// ============================================================================
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { audit, badRequest, conflict, db, notFound, schema } from "./lib.js";
import type { EventBusContract } from "./platform/events/interfaces.js";
import { DOMAIN_EVENTS, type DomainEventPayloads } from "./platform/events/registry.js";
import { postgresFeatureFlagStore } from "./feature-flags-store.js";

/** PW-004: automation is silent unless the tenant's workflow.centre flag is ON. */
async function workflowCentreEnabled(tenantId: string): Promise<boolean> {
  const rows = await postgresFeatureFlagStore.list(tenantId);
  return rows.some((row) => row.featureKey === "workflow.centre" && row.enabled);
}

// ---------------------------------------------------------------------------
// Automation rule catalogue (closed; unknown keys rejected / ignored)
// ---------------------------------------------------------------------------
export const AUTOMATION_RULES = [
  {
    key: "procurement-approval-task",
    label: "Create a task when a purchase approval is requested",
    event: DOMAIN_EVENTS.PROCUREMENT_APPROVAL_REQUESTED,
  },
  {
    key: "supplier-bill-review-task",
    label: "Create a task when a supplier bill is posted",
    event: DOMAIN_EVENTS.SUPPLIER_BILL_POSTED,
  },
] as const;
export type AutomationRuleKey = (typeof AUTOMATION_RULES)[number]["key"];

export const automationRuleKeySchema = z.enum(["procurement-approval-task", "supplier-bill-review-task"]);

export const manualTaskSchema = z.object({
  title: z.string().trim().min(3).max(200),
  detail: z.string().trim().max(2000).optional(),
  assignedTo: z.string().uuid().optional(),
});

export const closeTaskSchema = z.object({
  outcome: z.enum(["DONE", "DISMISSED"]),
});

// ---------------------------------------------------------------------------
// Task operations
// ---------------------------------------------------------------------------
export async function listTasks(tenantId: string, status: "OPEN" | "DONE" | "DISMISSED" | "ALL" = "OPEN") {
  const conditions = [eq(schema.tenantTasks.tenantId, tenantId)];
  if (status !== "ALL") conditions.push(eq(schema.tenantTasks.status, status));
  return db.select().from(schema.tenantTasks).where(and(...conditions))
    .orderBy(desc(schema.tenantTasks.createdAt)).limit(200);
}

export async function createManualTask(
  tenantId: string, userId: string, input: z.infer<typeof manualTaskSchema>,
) {
  if (input.assignedTo) {
    const [assignee] = await db.select({ id: schema.users.id }).from(schema.users).where(and(
      eq(schema.users.id, input.assignedTo), eq(schema.users.tenantId, tenantId),
    ));
    if (!assignee) throw badRequest("Assignee is not a member of this workspace");
  }
  return db.transaction(async (tx) => {
    const [task] = await tx.insert(schema.tenantTasks).values({
      tenantId, title: input.title, detail: input.detail ?? null,
      sourceType: "manual", assignedTo: input.assignedTo ?? null, createdBy: userId,
    }).returning();
    await audit(tx, tenantId, userId, "task.created", "tenant_task", task.id, { title: input.title });
    return task;
  });
}

export async function closeTask(
  tenantId: string, userId: string, taskId: string, outcome: "DONE" | "DISMISSED",
) {
  return db.transaction(async (tx) => {
    const [task] = await tx.select().from(schema.tenantTasks).where(and(
      eq(schema.tenantTasks.tenantId, tenantId), eq(schema.tenantTasks.id, taskId),
    ));
    if (!task) throw notFound("Task not found");
    if (task.status !== "OPEN") throw conflict("Only open tasks can be closed");
    const [closed] = await tx.update(schema.tenantTasks).set({
      status: outcome, closedBy: userId, closedAt: new Date(), updatedAt: new Date(),
    }).where(and(
      eq(schema.tenantTasks.id, taskId), eq(schema.tenantTasks.status, "OPEN"),
    )).returning();
    if (!closed) throw conflict("Task was modified concurrently — reload and retry");
    await audit(tx, tenantId, userId, "task.closed", "tenant_task", taskId, { outcome });
    return closed;
  });
}

// ---------------------------------------------------------------------------
// Automation rule configuration (settings.manage; audited)
// ---------------------------------------------------------------------------
export async function listAutomationRules(tenantId: string) {
  const rows = await db.select().from(schema.automationRules)
    .where(eq(schema.automationRules.tenantId, tenantId));
  return AUTOMATION_RULES.map((rule) => {
    const row = rows.find((r) => r.ruleKey === rule.key);
    return { key: rule.key, label: rule.label, event: rule.event, enabled: row?.enabled ?? false };
  });
}

export async function setAutomationRule(
  tenantId: string, userId: string, key: AutomationRuleKey, enabled: boolean,
) {
  await db.insert(schema.automationRules).values({
    tenantId, ruleKey: key, enabled, updatedBy: userId,
  }).onConflictDoUpdate({
    target: [schema.automationRules.tenantId, schema.automationRules.ruleKey],
    set: { enabled, updatedBy: userId, updatedAt: sql`now()` },
  });
  await audit(db, tenantId, userId,
    enabled ? "automation_rule.enabled" : "automation_rule.disabled",
    "automation_rule", undefined, { ruleKey: key });
  return listAutomationRules(tenantId);
}

async function ruleEnabled(tenantId: string, key: AutomationRuleKey): Promise<boolean> {
  const [row] = await db.select({ enabled: schema.automationRules.enabled })
    .from(schema.automationRules).where(and(
      eq(schema.automationRules.tenantId, tenantId),
      eq(schema.automationRules.ruleKey, key),
    ));
  return row?.enabled ?? false;
}

// ---------------------------------------------------------------------------
// Event subscriber — creates tasks; deduped by the partial unique index.
// ---------------------------------------------------------------------------
async function createAutomationTask(opts: {
  tenantId: string;
  sourceKey: AutomationRuleKey;
  title: string;
  detail: string | null;
  subjectType: string;
  subjectId: string;
}): Promise<void> {
  await db.insert(schema.tenantTasks).values({
    tenantId: opts.tenantId, title: opts.title, detail: opts.detail,
    sourceType: "automation", sourceKey: opts.sourceKey,
    subjectType: opts.subjectType, subjectId: opts.subjectId,
  }).onConflictDoNothing();
}

export function subscribeTaskAutomation(bus: EventBusContract) {
  bus.subscribe<DomainEventPayloads["procurement.approval_requested"]>(
    DOMAIN_EVENTS.PROCUREMENT_APPROVAL_REQUESTED,
    async (event) => {
      if (!event.tenantId) return;
      if (!(await workflowCentreEnabled(event.tenantId))) return;
      if (!(await ruleEnabled(event.tenantId, "procurement-approval-task"))) return;
      const kindLabel = event.payload.kind === "purchase_order" ? "purchase order" : "purchase requisition";
      await createAutomationTask({
        tenantId: event.tenantId,
        sourceKey: "procurement-approval-task",
        title: `Approve ${kindLabel} ${event.payload.number ?? "(draft)"}`,
        detail: `A ${kindLabel} is waiting for an approval decision.`,
        subjectType: event.payload.kind,
        subjectId: event.payload.entityId,
      });
    },
    { handlerName: "tasks.procurement.approval-requested" },
  );

  bus.subscribe<DomainEventPayloads["supplier_bill.posted"]>(
    DOMAIN_EVENTS.SUPPLIER_BILL_POSTED,
    async (event) => {
      if (!event.tenantId) return;
      if (!(await workflowCentreEnabled(event.tenantId))) return;
      if (!(await ruleEnabled(event.tenantId, "supplier-bill-review-task"))) return;
      await createAutomationTask({
        tenantId: event.tenantId,
        sourceKey: "supplier-bill-review-task",
        title: `Review posted supplier bill ${event.payload.number}`,
        detail: "A supplier bill was posted and may need payment scheduling.",
        subjectType: "supplier_bill",
        subjectId: event.payload.supplierBillId,
      });
    },
    { handlerName: "tasks.supplier-bill.posted" },
  );
}
