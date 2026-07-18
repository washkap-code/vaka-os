import type { WorkflowDefinition, WorkflowExecutionContext, WorkflowResult } from "./types.js";
import type { AuditServiceContract } from "../audit/interfaces.js";
import type { EventBusContract } from "../events/interfaces.js";
import type {
  WorkflowAction, WorkflowActionContext, WorkflowInstance, WorkflowInstanceSnapshot,
  WorkflowInstanceStatus, WorkflowObjectReference, WorkflowProcessDefinition,
  WorkflowTransitionResult,
} from "./types.js";

export interface WorkflowRunnerContract {
  register<TInput, TResult>(definition: WorkflowDefinition<TInput, TResult>): void;
  run<TInput, TResult>(name: string, input: TInput, context: WorkflowExecutionContext): Promise<WorkflowResult<TResult>>;
}

export interface CreateWorkflowInstanceRequest {
  tenantId: string;
  definition: WorkflowProcessDefinition;
  objectRef: WorkflowObjectReference;
  status: WorkflowInstanceStatus;
  currentStep: number;
  startedBy: string;
  startedAt: Date;
  completedAt: Date | null;
}

export interface ApplyWorkflowTransitionRequest {
  tenantId: string;
  instanceId: string;
  expectedCurrentStep: number;
  nextCurrentStep: number;
  nextStatus: WorkflowInstanceStatus;
  completedAt: Date | null;
  actorId: string;
  action: WorkflowAction;
  comment: string | null;
  actedAt: Date;
}

/** Persistence is application-owned; the Platform engine remains DB-neutral. */
export interface WorkflowStoreContract {
  createInstance(request: CreateWorkflowInstanceRequest): Promise<WorkflowInstanceSnapshot>;
  getInstance(tenantId: string, instanceId: string): Promise<WorkflowInstanceSnapshot | null>;
  applyTransition(request: ApplyWorkflowTransitionRequest): Promise<WorkflowTransitionResult>;
}

export interface WorkflowEngineDependencies {
  store: WorkflowStoreContract;
  audit: AuditServiceContract;
  events: EventBusContract;
  now?: () => Date;
}

export interface WorkflowEngineContract {
  start(
    definition: WorkflowProcessDefinition,
    objectRef: WorkflowObjectReference,
    context: WorkflowActionContext,
  ): Promise<WorkflowInstance>;
  approve(instanceId: string, context: WorkflowActionContext, comment?: string): Promise<WorkflowInstance>;
  reject(instanceId: string, context: WorkflowActionContext, comment?: string): Promise<WorkflowInstance>;
}
