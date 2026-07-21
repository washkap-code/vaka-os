import { describe, expect, it } from "vitest";
import { AuditService } from "../../../src/platform/audit/service.js";
import { InMemoryEventBus } from "../../../src/platform/events/service.js";
import { IdentityService } from "../../../src/platform/identity/service.js";
import {
  InvalidWorkflowDefinitionError, WorkflowConditionContextError,
  WorkflowAlreadyRegisteredError, WorkflowEngineNotConfiguredError,
  WorkflowIdentityMismatchError, WorkflowInstanceNotFoundError,
  WorkflowNotFoundError, WorkflowPermissionDeniedError, WorkflowStateConflictError,
} from "../../../src/platform/workflow/errors.js";
import type {
  ApplyWorkflowTransitionRequest, CreateWorkflowInstanceRequest, WorkflowStoreContract,
} from "../../../src/platform/workflow/interfaces.js";
import { WorkflowService } from "../../../src/platform/workflow/service.js";
import type {
  StoredWorkflowDefinition, WorkflowActionContext, WorkflowActionRecord,
  WorkflowInstance, WorkflowInstanceSnapshot, WorkflowProcessDefinition,
  WorkflowTransitionResult,
} from "../../../src/platform/workflow/types.js";

class MemoryWorkflowStore implements WorkflowStoreContract {
  readonly actions: WorkflowActionRecord[] = [];
  readonly snapshots = new Map<string, WorkflowInstanceSnapshot>();
  private sequence = 0;

  async createInstance(request: CreateWorkflowInstanceRequest): Promise<WorkflowInstanceSnapshot> {
    this.sequence += 1;
    const definition: StoredWorkflowDefinition = {
      id: `definition-${this.sequence}`,
      tenantId: request.tenantId,
      name: request.definition.name,
      version: request.definition.version,
      objectType: request.definition.objectType,
      steps: request.definition.steps,
      active: request.definition.active ?? true,
    };
    const instance: WorkflowInstance = {
      id: `instance-${this.sequence}`,
      tenantId: request.tenantId,
      definitionId: definition.id,
      objectType: request.objectRef.objectType,
      objectId: request.objectRef.objectId,
      status: request.status,
      currentStep: request.currentStep,
      startedBy: request.startedBy,
      startedAt: request.startedAt,
      completedAt: request.completedAt,
    };
    const snapshot = { definition, instance };
    this.snapshots.set(instance.id, snapshot);
    return snapshot;
  }

  async getInstance(tenantId: string, instanceId: string): Promise<WorkflowInstanceSnapshot | null> {
    const snapshot = this.snapshots.get(instanceId);
    return snapshot?.instance.tenantId === tenantId ? snapshot : null;
  }

  async applyTransition(request: ApplyWorkflowTransitionRequest): Promise<WorkflowTransitionResult> {
    const snapshot = this.snapshots.get(request.instanceId);
    if (!snapshot || snapshot.instance.currentStep !== request.expectedCurrentStep) {
      throw new Error("test transition conflict");
    }
    const instance: WorkflowInstance = {
      ...snapshot.instance,
      status: request.nextStatus,
      currentStep: request.nextCurrentStep,
      completedAt: request.completedAt,
    };
    const action: WorkflowActionRecord = {
      id: `action-${this.actions.length + 1}`,
      instanceId: instance.id,
      step: request.expectedCurrentStep,
      actorId: request.actorId,
      action: request.action,
      comment: request.comment,
      actedAt: request.actedAt,
    };
    this.actions.push(action);
    this.snapshots.set(instance.id, { definition: snapshot.definition, instance });
    return { instance, action };
  }
}

const baseDefinition: WorkflowProcessDefinition = {
  name: "invoice.approval",
  version: 1,
  objectType: "Invoice",
  steps: [{
    name: "finance",
    approver: { type: "role", role: "Finance", permission: "accounting.post" },
  }],
};

function identity(tenantId: string, userId: string, permissions: string[]) {
  return new IdentityService(() => ({
    tenantId,
    userId,
    sessionId: "session-1",
    isPlatformAdmin: false,
    permissions,
  }));
}

function harness(permissions = ["accounting.post", "settings.manage"]) {
  const store = new MemoryWorkflowStore();
  const auditActions: string[] = [];
  const eventTypes: string[] = [];
  const events = new InMemoryEventBus();
  for (const type of ["workflow.started", "workflow.approved", "workflow.rejected", "workflow.completed"] as const) {
    events.subscribe(type, () => { eventTypes.push(type); });
  }
  let tick = 0;
  const service = new WorkflowService({
    store,
    audit: new AuditService({ append: (event) => { auditActions.push(event.action); } }),
    events,
    now: () => new Date(`2026-07-18T00:00:0${tick++}.000Z`),
  });
  const context: WorkflowActionContext = {
    tenantId: "tenant-1",
    actorUserId: "user-1",
    identity: identity("tenant-1", "user-1", permissions),
  };
  return { auditActions, context, eventTypes, service, store };
}

describe("durable WorkflowService engine", () => {
  it("starts and approves a one-role workflow through completion", async () => {
    const { auditActions, context, eventTypes, service, store } = harness();
    const started = await service.start(baseDefinition, { objectType: "Invoice", objectId: "invoice-1" }, context);
    expect(started).toMatchObject({ status: "ACTIVE", currentStep: 0, startedBy: "user-1" });

    const completed = await service.approve(started.id, context, "  Approved for issue  ");
    expect(completed).toMatchObject({ status: "COMPLETED", currentStep: 0 });
    expect(completed.completedAt).toEqual(new Date("2026-07-18T00:00:01.000Z"));
    expect(store.actions).toEqual([expect.objectContaining({
      step: 0, actorId: "user-1", action: "APPROVE", comment: "Approved for issue",
    })]);
    expect(eventTypes).toEqual(["workflow.started", "workflow.approved", "workflow.completed"]);
    expect(auditActions).toEqual(["workflow.started", "workflow.approved", "workflow.completed"]);
  });

  it("rejects the active step and terminates without a completed event", async () => {
    const { auditActions, context, eventTypes, service, store } = harness();
    const started = await service.start(baseDefinition, { objectType: "Invoice", objectId: "invoice-2" }, context);
    const rejected = await service.reject(started.id, context, "Budget owner declined");
    expect(rejected.status).toBe("REJECTED");
    expect(store.actions[0]).toMatchObject({ action: "REJECT", step: 0 });
    expect(eventTypes).toEqual(["workflow.started", "workflow.rejected"]);
    expect(auditActions).toEqual(["workflow.started", "workflow.rejected"]);
  });

  it("advances sequential role steps one at a time", async () => {
    const { context, service, store } = harness();
    const definition: WorkflowProcessDefinition = {
      ...baseDefinition,
      name: "invoice.sequential",
      steps: [
        baseDefinition.steps[0],
        { name: "owner", approver: { type: "role", role: "Owner", permission: "settings.manage" } },
      ],
    };
    const started = await service.start(definition, { objectType: "Invoice", objectId: "invoice-3" }, context);
    const advanced = await service.approve(started.id, context);
    expect(advanced).toMatchObject({ status: "ACTIVE", currentStep: 1 });
    const completed = await service.approve(started.id, context);
    expect(completed).toMatchObject({ status: "COMPLETED", currentStep: 1 });
    expect(store.actions.map((action) => action.step)).toEqual([0, 1]);
  });

  it("lets an in-flight instance finish after its definition is deactivated", async () => {
    const { context, service, store } = harness();
    const started = await service.start(baseDefinition, { objectType: "Invoice", objectId: "deactivated" }, context);
    const snapshot = store.snapshots.get(started.id)!;
    store.snapshots.set(started.id, {
      ...snapshot,
      definition: { ...snapshot.definition, active: false },
    });
    await expect(service.approve(started.id, context)).resolves.toMatchObject({ status: "COMPLETED" });
  });

  it("adds an amount-threshold step only when amount is strictly greater", async () => {
    const definition: WorkflowProcessDefinition = {
      ...baseDefinition,
      name: "invoice.threshold",
      steps: [
        baseDefinition.steps[0],
        {
          name: "high-value-owner",
          approver: { type: "role", role: "Owner", permission: "settings.manage" },
          condition: { type: "amount-threshold", operator: "gt", amount: "100000000000000000000.99" },
        },
      ],
    };
    const low = harness();
    const lowContext = { ...low.context, amount: "100000000000000000000.990" };
    const lowStarted = await low.service.start(definition, { objectType: "Invoice", objectId: "low" }, lowContext);
    await expect(low.service.approve(lowStarted.id, lowContext)).resolves.toMatchObject({ status: "COMPLETED" });

    const high = harness();
    const highContext = { ...high.context, amount: "100000000000000000001.00" };
    const highStarted = await high.service.start(definition, { objectType: "Invoice", objectId: "high" }, highContext);
    await expect(high.service.approve(highStarted.id, highContext)).resolves.toMatchObject({ status: "ACTIVE", currentStep: 1 });
    await expect(high.service.approve(highStarted.id, highContext)).resolves.toMatchObject({ status: "COMPLETED" });
  });

  it("fails closed when threshold context is missing", async () => {
    const { context, service } = harness();
    const definition: WorkflowProcessDefinition = {
      ...baseDefinition,
      steps: [{
        ...baseDefinition.steps[0],
        condition: { type: "amount-threshold", operator: "gt", amount: "10.00" },
      }],
    };
    await expect(service.start(definition, { objectType: "Invoice", objectId: "missing-amount" }, context))
      .rejects.toBeInstanceOf(WorkflowConditionContextError);
  });

  it("denies an actor who lacks the permission named by the step", async () => {
    const { context, service, store } = harness(["accounting.read"]);
    const started = await service.start(baseDefinition, { objectType: "Invoice", objectId: "invoice-4" }, context);
    await expect(service.approve(started.id, context)).rejects.toBeInstanceOf(WorkflowPermissionDeniedError);
    expect(store.actions).toEqual([]);
    expect((await store.getInstance("tenant-1", started.id))?.instance.status).toBe("ACTIVE");
  });

  it("returns a tenant-safe unknown-instance error across tenant boundaries", async () => {
    const { context, service } = harness();
    const started = await service.start(baseDefinition, { objectType: "Invoice", objectId: "invoice-5" }, context);
    const otherTenant = {
      ...context,
      tenantId: "tenant-2",
      actorUserId: "user-2",
      identity: identity("tenant-2", "user-2", ["accounting.post"]),
    };
    await expect(service.approve(started.id, otherTenant)).rejects.toBeInstanceOf(WorkflowInstanceNotFoundError);
  });

  it("completes a conditionally empty plan at start and validates definition/object shape", async () => {
    const { auditActions, context, eventTypes, service } = harness();
    const immediate = await service.start(
      { ...baseDefinition, name: "no-steps", steps: [] },
      { objectType: "Invoice", objectId: "invoice-6" },
      context,
    );
    expect(immediate.status).toBe("COMPLETED");
    expect(eventTypes).toEqual(["workflow.started", "workflow.completed"]);
    expect(auditActions).toEqual(["workflow.started", "workflow.completed"]);

    await expect(service.start(
      { ...baseDefinition, steps: [baseDefinition.steps[0], baseDefinition.steps[0]] },
      { objectType: "Invoice", objectId: "invoice-7" },
      context,
    )).rejects.toBeInstanceOf(InvalidWorkflowDefinitionError);
    await expect(service.start(
      baseDefinition,
      { objectType: "Payment", objectId: "payment-1" },
      context,
    )).rejects.toBeInstanceOf(InvalidWorkflowDefinitionError);
  });

  it("fails closed for malformed durable definitions and missing object identity", async () => {
    const { context, service } = harness();
    const invalid: WorkflowProcessDefinition[] = [
      { ...baseDefinition, name: " " },
      { ...baseDefinition, version: 0 },
      { ...baseDefinition, objectType: " " },
      { ...baseDefinition, active: false },
      { ...baseDefinition, steps: [{ ...baseDefinition.steps[0], name: " " }] },
      { ...baseDefinition, steps: [{ ...baseDefinition.steps[0], approver: { type: "role", role: " ", permission: "accounting.post" } }] },
      { ...baseDefinition, steps: [{ ...baseDefinition.steps[0], approver: { type: "role", role: "Finance", permission: " " } }] },
      { ...baseDefinition, steps: [{
        ...baseDefinition.steps[0],
        condition: { type: "unsupported", operator: "gt", amount: "10" },
      }] } as unknown as WorkflowProcessDefinition,
      { ...baseDefinition, steps: [{
        ...baseDefinition.steps[0],
        condition: { type: "amount-threshold", operator: "gt", amount: "not-money" },
      }] },
    ];
    for (const [index, definition] of invalid.entries()) {
      await expect(service.start(
        definition,
        { objectType: definition.objectType, objectId: `invalid-${index}` },
        context,
      )).rejects.toBeInstanceOf(InvalidWorkflowDefinitionError);
    }
    await expect(service.start(baseDefinition, { objectType: "Invoice", objectId: " " }, context))
      .rejects.toBeInstanceOf(InvalidWorkflowDefinitionError);
  });

  it("rejects mismatched identities, terminal repeats, context drift and oversized comments", async () => {
    const { context, service, store } = harness();
    await expect(service.start(
      baseDefinition,
      { objectType: "Invoice", objectId: "identity-mismatch" },
      { ...context, actorUserId: "different-user" },
    )).rejects.toBeInstanceOf(WorkflowIdentityMismatchError);

    const completed = await service.start(baseDefinition, { objectType: "Invoice", objectId: "completed" }, context);
    await service.approve(completed.id, context);
    await expect(service.approve(completed.id, context)).rejects.toBeInstanceOf(WorkflowStateConflictError);

    const conditionalDefinition: WorkflowProcessDefinition = {
      ...baseDefinition,
      steps: [{
        ...baseDefinition.steps[0],
        condition: { type: "amount-threshold", operator: "gt", amount: "10.00" },
      }],
    };
    const highContext = { ...context, amount: "10.01" };
    const conditional = await service.start(
      conditionalDefinition,
      { objectType: "Invoice", objectId: "context-drift" },
      highContext,
    );
    await expect(service.approve(conditional.id, { ...context, amount: "10.00" }))
      .rejects.toBeInstanceOf(WorkflowStateConflictError);

    const commentInstance = await service.start(
      baseDefinition,
      { objectType: "Invoice", objectId: "long-comment" },
      context,
    );
    await expect(service.approve(commentInstance.id, context, "x".repeat(1001)))
      .rejects.toBeInstanceOf(WorkflowStateConflictError);
    expect(store.actions.filter((action) => action.instanceId === commentInstance.id)).toEqual([]);
  });

  it("preserves the reference runner errors and requires engine dependencies for durable calls", async () => {
    const runner = new WorkflowService();
    runner.register({ name: "once", run: () => "ok" });
    expect(() => runner.register({ name: "once", run: () => "again" }))
      .toThrow(WorkflowAlreadyRegisteredError);
    await expect(runner.run("unknown", {}, { tenantId: "tenant-1", actorUserId: "user-1" }))
      .rejects.toBeInstanceOf(WorkflowNotFoundError);
    await expect(runner.start(baseDefinition, { objectType: "Invoice", objectId: "invoice" }, harness().context))
      .rejects.toBeInstanceOf(WorkflowEngineNotConfiguredError);
  });
});
