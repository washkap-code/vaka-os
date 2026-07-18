import type { IdentityServiceContract } from "../identity/interfaces.js";

export interface WorkflowExecutionContext {
  tenantId: string;
  actorUserId: string | null;
  correlationId?: string;
}

export interface WorkflowDefinition<TInput = unknown, TResult = unknown> {
  name: string;
  run(input: TInput, context: WorkflowExecutionContext): Promise<TResult> | TResult;
}

export interface WorkflowResult<TResult> {
  workflow: string;
  result: TResult;
}

export type WorkflowInstanceStatus = "ACTIVE" | "COMPLETED" | "REJECTED";
export type WorkflowAction = "APPROVE" | "REJECT";

export interface WorkflowRoleApprover {
  type: "role";
  /** Stable role/routing label. Permission enforcement remains authoritative. */
  role: string;
  permission: string;
}

export interface AmountThresholdCondition {
  type: "amount-threshold";
  operator: "gt";
  /** Exact decimal threshold. The engine never converts this value to Number. */
  amount: string;
}

export interface WorkflowStepDefinition {
  name: string;
  approver: WorkflowRoleApprover;
  condition?: AmountThresholdCondition;
}

/** Versioned durable workflow definition persisted in workflow_definitions. */
export interface WorkflowProcessDefinition {
  name: string;
  version: number;
  objectType: string;
  steps: readonly WorkflowStepDefinition[];
  active?: boolean;
}

export interface WorkflowObjectReference {
  objectType: string;
  objectId: string;
}

/**
 * Request-derived action context. The identity snapshot is required so the
 * engine—not its caller—enforces the permission named by the active step.
 */
export interface WorkflowActionContext extends Omit<WorkflowExecutionContext, "actorUserId"> {
  actorUserId: string;
  identity: IdentityServiceContract;
  /** Exact object amount used by amount-threshold conditions, when present. */
  amount?: string;
}

export interface StoredWorkflowDefinition {
  id: string;
  tenantId: string;
  name: string;
  version: number;
  objectType: string;
  steps: readonly WorkflowStepDefinition[];
  active: boolean;
}

export interface WorkflowInstance {
  id: string;
  tenantId: string;
  definitionId: string;
  objectType: string;
  objectId: string;
  status: WorkflowInstanceStatus;
  /** Zero-based index into the immutable definition steps. */
  currentStep: number;
  startedBy: string;
  startedAt: Date;
  completedAt: Date | null;
}

export interface WorkflowActionRecord {
  id: string;
  instanceId: string;
  step: number;
  actorId: string;
  action: WorkflowAction;
  comment: string | null;
  actedAt: Date;
}

export interface WorkflowInstanceSnapshot {
  definition: StoredWorkflowDefinition;
  instance: WorkflowInstance;
}

export interface WorkflowTransitionResult {
  instance: WorkflowInstance;
  action: WorkflowActionRecord;
}
