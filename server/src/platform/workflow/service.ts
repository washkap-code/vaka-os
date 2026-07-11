import { WorkflowAlreadyRegisteredError, WorkflowNotFoundError } from "./errors.js";
import type { WorkflowRunnerContract } from "./interfaces.js";
import type { WorkflowDefinition, WorkflowExecutionContext, WorkflowResult } from "./types.js";

export class WorkflowService implements WorkflowRunnerContract {
  private readonly definitions = new Map<string, WorkflowDefinition<unknown, unknown>>();

  register<TInput, TResult>(definition: WorkflowDefinition<TInput, TResult>): void {
    if (this.definitions.has(definition.name)) throw new WorkflowAlreadyRegisteredError(definition.name);
    this.definitions.set(definition.name, definition as WorkflowDefinition<unknown, unknown>);
  }

  async run<TInput, TResult>(name: string, input: TInput, context: WorkflowExecutionContext): Promise<WorkflowResult<TResult>> {
    const definition = this.definitions.get(name) as WorkflowDefinition<TInput, TResult> | undefined;
    if (!definition) throw new WorkflowNotFoundError(name);
    return { workflow: name, result: await definition.run(input, context) };
  }
}
