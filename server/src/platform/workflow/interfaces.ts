import type { WorkflowDefinition, WorkflowExecutionContext, WorkflowResult } from "./types.js";

export interface WorkflowRunnerContract {
  register<TInput, TResult>(definition: WorkflowDefinition<TInput, TResult>): void;
  run<TInput, TResult>(name: string, input: TInput, context: WorkflowExecutionContext): Promise<WorkflowResult<TResult>>;
}
