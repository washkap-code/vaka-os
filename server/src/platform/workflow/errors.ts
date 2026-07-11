export class WorkflowAlreadyRegisteredError extends Error {
  constructor(name: string) {
    super(`Workflow is already registered: ${name}`);
    this.name = "WorkflowAlreadyRegisteredError";
  }
}

export class WorkflowNotFoundError extends Error {
  constructor(name: string) {
    super(`Workflow is not registered: ${name}`);
    this.name = "WorkflowNotFoundError";
  }
}
