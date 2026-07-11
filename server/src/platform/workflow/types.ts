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
