// ============================================================================
// WORKFLOW PERSISTENCE ADAPTER (P1-003)
//
// Keeps Drizzle out of the Platform workflow engine. A transaction-scoped
// adapter can join a domain transaction (invoice issue); the default adapter
// owns a short transaction for standalone workflow calls.
// ============================================================================
import { and, eq } from "drizzle-orm";
import { db, schema, type DB } from "./lib.js";
import { WorkflowStateConflictError } from "./platform/workflow/errors.js";
import type {
  ApplyWorkflowTransitionRequest, CreateWorkflowInstanceRequest, WorkflowStoreContract,
} from "./platform/workflow/interfaces.js";
import type {
  StoredWorkflowDefinition, WorkflowAction, WorkflowInstance,
  WorkflowInstanceSnapshot, WorkflowInstanceStatus, WorkflowTransitionResult,
} from "./platform/workflow/types.js";

type WorkflowDefinitionRow = typeof schema.workflowDefinitions.$inferSelect;
type WorkflowInstanceRow = typeof schema.workflowInstances.$inferSelect;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function definitionFromRow(row: WorkflowDefinitionRow): StoredWorkflowDefinition {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    version: row.version,
    objectType: row.objectType,
    steps: row.stepsJson,
    active: row.active,
  };
}

function instanceFromRow(row: WorkflowInstanceRow): WorkflowInstance {
  return {
    id: row.id,
    tenantId: row.tenantId,
    definitionId: row.definitionId,
    objectType: row.objectType,
    objectId: row.objectId,
    status: row.status as WorkflowInstanceStatus,
    currentStep: row.currentStep,
    startedBy: row.startedBy,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  };
}

export class PostgresWorkflowStore implements WorkflowStoreContract {
  constructor(private readonly scopedTransaction?: DB) {}

  private async write<T>(operation: (tx: DB) => Promise<T>): Promise<T> {
    if (this.scopedTransaction) return operation(this.scopedTransaction);
    return db.transaction(async (tx) => operation(tx));
  }

  async createInstance(request: CreateWorkflowInstanceRequest): Promise<WorkflowInstanceSnapshot> {
    return this.write(async (tx) => {
      const insertedDefinitions = await tx.insert(schema.workflowDefinitions).values({
        tenantId: request.tenantId,
        name: request.definition.name,
        version: request.definition.version,
        objectType: request.definition.objectType,
        stepsJson: [...request.definition.steps],
        active: request.definition.active ?? true,
      }).onConflictDoNothing({
        target: [
          schema.workflowDefinitions.tenantId,
          schema.workflowDefinitions.name,
          schema.workflowDefinitions.version,
        ],
      }).returning();
      const [storedDefinition] = insertedDefinitions.length
        ? insertedDefinitions
        : await tx.select().from(schema.workflowDefinitions).where(and(
          eq(schema.workflowDefinitions.tenantId, request.tenantId),
          eq(schema.workflowDefinitions.name, request.definition.name),
          eq(schema.workflowDefinitions.version, request.definition.version),
        ));
      if (!storedDefinition) throw new WorkflowStateConflictError("Workflow definition could not be persisted");
      if (
        !storedDefinition.active
        || storedDefinition.objectType !== request.definition.objectType
        || stableJson(storedDefinition.stepsJson) !== stableJson(request.definition.steps)
      ) {
        throw new WorkflowStateConflictError(
          `Workflow definition '${request.definition.name}' version ${request.definition.version} conflicts with stored metadata`,
        );
      }

      const insertedInstances = await tx.insert(schema.workflowInstances).values({
        tenantId: request.tenantId,
        definitionId: storedDefinition.id,
        objectType: request.objectRef.objectType,
        objectId: request.objectRef.objectId,
        status: request.status,
        currentStep: request.currentStep,
        startedBy: request.startedBy,
        startedAt: request.startedAt,
        completedAt: request.completedAt,
      }).onConflictDoNothing().returning();
      const [instance] = insertedInstances;
      if (!instance) {
        throw new WorkflowStateConflictError("An active workflow already exists for this object");
      }
      return { definition: definitionFromRow(storedDefinition), instance: instanceFromRow(instance) };
    });
  }

  async getInstance(tenantId: string, instanceId: string): Promise<WorkflowInstanceSnapshot | null> {
    const executor = this.scopedTransaction ?? db;
    const [instance] = await executor.select().from(schema.workflowInstances).where(and(
      eq(schema.workflowInstances.id, instanceId),
      eq(schema.workflowInstances.tenantId, tenantId),
    ));
    if (!instance) return null;
    const [definition] = await executor.select().from(schema.workflowDefinitions).where(and(
      eq(schema.workflowDefinitions.id, instance.definitionId),
      eq(schema.workflowDefinitions.tenantId, tenantId),
    ));
    if (!definition) throw new WorkflowStateConflictError("Workflow instance definition is unavailable");
    return { definition: definitionFromRow(definition), instance: instanceFromRow(instance) };
  }

  async applyTransition(request: ApplyWorkflowTransitionRequest): Promise<WorkflowTransitionResult> {
    return this.write(async (tx) => {
      const [instance] = await tx.update(schema.workflowInstances).set({
        status: request.nextStatus,
        currentStep: request.nextCurrentStep,
        completedAt: request.completedAt,
      }).where(and(
        eq(schema.workflowInstances.id, request.instanceId),
        eq(schema.workflowInstances.tenantId, request.tenantId),
        eq(schema.workflowInstances.status, "ACTIVE"),
        eq(schema.workflowInstances.currentStep, request.expectedCurrentStep),
      )).returning();
      if (!instance) throw new WorkflowStateConflictError("Workflow instance changed before this action was applied");
      const [action] = await tx.insert(schema.workflowActions).values({
        instanceId: request.instanceId,
        step: request.expectedCurrentStep,
        actorId: request.actorId,
        action: request.action,
        comment: request.comment,
        actedAt: request.actedAt,
      }).returning();
      return {
        instance: instanceFromRow(instance),
        action: {
          id: action.id,
          instanceId: action.instanceId,
          step: action.step,
          actorId: action.actorId,
          action: action.action as WorkflowAction,
          comment: action.comment,
          actedAt: action.actedAt,
        },
      };
    });
  }
}
