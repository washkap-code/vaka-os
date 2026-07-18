import {
  InvalidWorkflowDefinitionError, WorkflowAlreadyRegisteredError,
  WorkflowConditionContextError, WorkflowEngineNotConfiguredError,
  WorkflowIdentityMismatchError, WorkflowInstanceNotFoundError,
  WorkflowPermissionDeniedError, WorkflowStateConflictError, WorkflowNotFoundError,
} from "./errors.js";
import type {
  WorkflowEngineContract, WorkflowEngineDependencies, WorkflowRunnerContract,
} from "./interfaces.js";
import type {
  WorkflowActionContext, WorkflowDefinition, WorkflowExecutionContext,
  WorkflowInstance, WorkflowProcessDefinition, WorkflowResult,
  WorkflowStepDefinition,
} from "./types.js";

const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;

function decimalParts(value: string): { coefficient: bigint; scale: number } {
  const normalised = value.trim();
  if (!DECIMAL_PATTERN.test(normalised)) {
    throw new WorkflowConditionContextError(`Workflow amount must be a non-negative decimal: ${value}`);
  }
  const [whole, fraction = ""] = normalised.split(".");
  return { coefficient: BigInt(`${whole}${fraction}`), scale: fraction.length };
}

function decimalGreaterThan(left: string, right: string): boolean {
  const a = decimalParts(left);
  const b = decimalParts(right);
  const scale = Math.max(a.scale, b.scale);
  const scaledA = a.coefficient * (10n ** BigInt(scale - a.scale));
  const scaledB = b.coefficient * (10n ** BigInt(scale - b.scale));
  return scaledA > scaledB;
}

function validateDefinition(definition: WorkflowProcessDefinition): void {
  if (!definition.name.trim()) throw new InvalidWorkflowDefinitionError("Workflow name is required");
  if (!Number.isInteger(definition.version) || definition.version < 1) {
    throw new InvalidWorkflowDefinitionError("Workflow version must be a positive integer");
  }
  if (!definition.objectType.trim()) throw new InvalidWorkflowDefinitionError("Workflow object type is required");
  if (definition.active === false) throw new InvalidWorkflowDefinitionError("Inactive workflows cannot be started");
  const names = new Set<string>();
  for (const step of definition.steps) {
    const name = step.name.trim();
    if (!name) throw new InvalidWorkflowDefinitionError("Workflow step name is required");
    if (names.has(name)) throw new InvalidWorkflowDefinitionError(`Duplicate workflow step: ${name}`);
    names.add(name);
    if (step.approver.type !== "role" || !step.approver.role.trim()) {
      throw new InvalidWorkflowDefinitionError(`Workflow step '${name}' requires one approver role`);
    }
    if (!step.approver.permission.trim()) {
      throw new InvalidWorkflowDefinitionError(`Workflow step '${name}' requires a permission`);
    }
    if (step.condition) {
      if (step.condition.type !== "amount-threshold" || step.condition.operator !== "gt") {
        throw new InvalidWorkflowDefinitionError(`Workflow step '${name}' has an unsupported condition`);
      }
      try {
        decimalParts(step.condition.amount);
      } catch {
        throw new InvalidWorkflowDefinitionError(`Workflow step '${name}' has an invalid amount threshold`);
      }
    }
  }
}

function assertContextIdentity(context: WorkflowActionContext): void {
  const identity = context.identity.context();
  if (!identity || identity.userId !== context.actorUserId || identity.tenantId !== context.tenantId) {
    throw new WorkflowIdentityMismatchError();
  }
}

function stepApplies(step: WorkflowStepDefinition, context: WorkflowActionContext): boolean {
  if (!step.condition) return true;
  if (context.amount === undefined) {
    throw new WorkflowConditionContextError(
      `Workflow step '${step.name}' requires an exact amount in the action context`,
    );
  }
  return decimalGreaterThan(context.amount, step.condition.amount);
}

function nextApplicableStep(
  steps: readonly WorkflowStepDefinition[],
  afterIndex: number,
  context: WorkflowActionContext,
): number | null {
  for (let index = afterIndex + 1; index < steps.length; index += 1) {
    if (stepApplies(steps[index], context)) return index;
  }
  return null;
}

function normaliseComment(comment?: string): string | null {
  const value = comment?.trim() ?? "";
  if (value.length > 1000) throw new WorkflowStateConflictError("Workflow comments cannot exceed 1000 characters");
  return value || null;
}

export class WorkflowService implements WorkflowRunnerContract, WorkflowEngineContract {
  private readonly definitions = new Map<string, WorkflowDefinition<unknown, unknown>>();
  private readonly now: () => Date;

  constructor(private readonly engine?: WorkflowEngineDependencies) {
    this.now = engine?.now ?? (() => new Date());
  }

  register<TInput, TResult>(definition: WorkflowDefinition<TInput, TResult>): void {
    if (this.definitions.has(definition.name)) throw new WorkflowAlreadyRegisteredError(definition.name);
    this.definitions.set(definition.name, definition as WorkflowDefinition<unknown, unknown>);
  }

  async run<TInput, TResult>(
    name: string,
    input: TInput,
    context: WorkflowExecutionContext,
  ): Promise<WorkflowResult<TResult>> {
    const definition = this.definitions.get(name) as WorkflowDefinition<TInput, TResult> | undefined;
    if (!definition) throw new WorkflowNotFoundError(name);
    return { workflow: name, result: await definition.run(input, context) };
  }

  private dependencies(): WorkflowEngineDependencies {
    if (!this.engine) throw new WorkflowEngineNotConfiguredError();
    return this.engine;
  }

  async start(
    definition: WorkflowProcessDefinition,
    objectRef: { objectType: string; objectId: string },
    context: WorkflowActionContext,
  ): Promise<WorkflowInstance> {
    const dependencies = this.dependencies();
    assertContextIdentity(context);
    validateDefinition(definition);
    if (!objectRef.objectId.trim()) throw new InvalidWorkflowDefinitionError("Workflow object id is required");
    if (objectRef.objectType !== definition.objectType) {
      throw new InvalidWorkflowDefinitionError(
        `Workflow object type '${objectRef.objectType}' does not match '${definition.objectType}'`,
      );
    }

    const startedAt = this.now();
    const firstStep = nextApplicableStep(definition.steps, -1, context);
    const completesImmediately = firstStep === null;
    const snapshot = await dependencies.store.createInstance({
      tenantId: context.tenantId,
      definition,
      objectRef,
      status: completesImmediately ? "COMPLETED" : "ACTIVE",
      currentStep: firstStep ?? 0,
      startedBy: context.actorUserId,
      startedAt,
      completedAt: completesImmediately ? startedAt : null,
    });
    const { instance } = snapshot;
    await dependencies.audit.record({
      tenantId: context.tenantId,
      actorUserId: context.actorUserId,
      action: "workflow.started",
      entityType: "workflow_instance",
      entityId: instance.id,
      occurredAt: startedAt,
      metadata: {
        definitionId: instance.definitionId,
        workflowName: snapshot.definition.name,
        workflowVersion: snapshot.definition.version,
        objectType: instance.objectType,
        objectId: instance.objectId,
        currentStep: instance.currentStep,
      },
    });
    await dependencies.events.publish({
      id: `workflow.started:${instance.id}`,
      type: "workflow.started",
      tenantId: context.tenantId,
      actorUserId: context.actorUserId,
      occurredAt: startedAt,
      payload: {
        instanceId: instance.id,
        definitionId: instance.definitionId,
        workflowName: snapshot.definition.name,
        objectType: instance.objectType,
        objectId: instance.objectId,
        currentStep: instance.currentStep,
        status: instance.status,
      },
    });
    if (completesImmediately) await this.recordCompleted(snapshot.definition.name, instance, context, startedAt);
    return instance;
  }

  async approve(instanceId: string, context: WorkflowActionContext, comment?: string): Promise<WorkflowInstance> {
    return this.decide(instanceId, "APPROVE", context, comment);
  }

  async reject(instanceId: string, context: WorkflowActionContext, comment?: string): Promise<WorkflowInstance> {
    return this.decide(instanceId, "REJECT", context, comment);
  }

  private async decide(
    instanceId: string,
    action: "APPROVE" | "REJECT",
    context: WorkflowActionContext,
    comment?: string,
  ): Promise<WorkflowInstance> {
    const dependencies = this.dependencies();
    assertContextIdentity(context);
    const snapshot = await dependencies.store.getInstance(context.tenantId, instanceId);
    if (!snapshot) throw new WorkflowInstanceNotFoundError(instanceId);
    validateDefinition({
      name: snapshot.definition.name,
      version: snapshot.definition.version,
      objectType: snapshot.definition.objectType,
      steps: snapshot.definition.steps,
      active: snapshot.definition.active,
    });
    if (snapshot.instance.status !== "ACTIVE") {
      throw new WorkflowStateConflictError(`Workflow instance is already ${snapshot.instance.status}`);
    }
    const step = snapshot.definition.steps[snapshot.instance.currentStep];
    if (!step || !stepApplies(step, context)) {
      throw new WorkflowStateConflictError("Workflow current step does not match its definition and context");
    }
    if (!context.identity.hasPermission(step.approver.permission)) {
      throw new WorkflowPermissionDeniedError(step.approver.permission);
    }

    const actedAt = this.now();
    const nextStep = action === "APPROVE"
      ? nextApplicableStep(snapshot.definition.steps, snapshot.instance.currentStep, context)
      : null;
    const nextStatus = action === "REJECT" ? "REJECTED" : nextStep === null ? "COMPLETED" : "ACTIVE";
    const result = await dependencies.store.applyTransition({
      tenantId: context.tenantId,
      instanceId,
      expectedCurrentStep: snapshot.instance.currentStep,
      nextCurrentStep: nextStep ?? snapshot.instance.currentStep,
      nextStatus,
      completedAt: nextStatus === "ACTIVE" ? null : actedAt,
      actorId: context.actorUserId,
      action,
      comment: normaliseComment(comment),
      actedAt,
    });
    const eventAction = action === "APPROVE" ? "workflow.approved" : "workflow.rejected";
    await dependencies.audit.record({
      tenantId: context.tenantId,
      actorUserId: context.actorUserId,
      action: eventAction,
      entityType: "workflow_instance",
      entityId: instanceId,
      occurredAt: actedAt,
      metadata: {
        workflowName: snapshot.definition.name,
        objectType: result.instance.objectType,
        objectId: result.instance.objectId,
        step: result.action.step,
        stepName: step.name,
        nextStep: result.instance.currentStep,
        status: result.instance.status,
        comment: result.action.comment,
      },
    });
    await dependencies.events.publish({
      id: `${eventAction}:${instanceId}:${result.action.step}`,
      type: eventAction,
      tenantId: context.tenantId,
      actorUserId: context.actorUserId,
      occurredAt: actedAt,
      payload: {
        instanceId,
        definitionId: result.instance.definitionId,
        workflowName: snapshot.definition.name,
        objectType: result.instance.objectType,
        objectId: result.instance.objectId,
        step: result.action.step,
        stepName: step.name,
        currentStep: result.instance.currentStep,
        status: result.instance.status,
      },
    });
    if (result.instance.status === "COMPLETED") {
      await this.recordCompleted(snapshot.definition.name, result.instance, context, actedAt);
    }
    return result.instance;
  }

  private async recordCompleted(
    workflowName: string,
    instance: WorkflowInstance,
    context: WorkflowActionContext,
    occurredAt: Date,
  ): Promise<void> {
    const dependencies = this.dependencies();
    await dependencies.audit.record({
      tenantId: context.tenantId,
      actorUserId: context.actorUserId,
      action: "workflow.completed",
      entityType: "workflow_instance",
      entityId: instance.id,
      occurredAt,
      metadata: {
        workflowName,
        objectType: instance.objectType,
        objectId: instance.objectId,
        currentStep: instance.currentStep,
      },
    });
    await dependencies.events.publish({
      id: `workflow.completed:${instance.id}`,
      type: "workflow.completed",
      tenantId: context.tenantId,
      actorUserId: context.actorUserId,
      occurredAt,
      payload: {
        instanceId: instance.id,
        definitionId: instance.definitionId,
        workflowName,
        objectType: instance.objectType,
        objectId: instance.objectId,
        currentStep: instance.currentStep,
        status: instance.status,
      },
    });
  }
}
