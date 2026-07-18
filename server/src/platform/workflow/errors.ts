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

export class WorkflowEngineNotConfiguredError extends Error {
  constructor() {
    super("Workflow engine dependencies are not configured");
    this.name = "WorkflowEngineNotConfiguredError";
  }
}

export class InvalidWorkflowDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWorkflowDefinitionError";
  }
}

export class WorkflowIdentityMismatchError extends Error {
  constructor() {
    super("Workflow actor identity does not match the requested tenant and user");
    this.name = "WorkflowIdentityMismatchError";
  }
}

export class WorkflowPermissionDeniedError extends Error {
  constructor(permission: string) {
    super(`Workflow step requires the '${permission}' permission`);
    this.name = "WorkflowPermissionDeniedError";
  }
}

export class WorkflowInstanceNotFoundError extends Error {
  constructor(instanceId: string) {
    super(`Workflow instance was not found: ${instanceId}`);
    this.name = "WorkflowInstanceNotFoundError";
  }
}

export class WorkflowStateConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowStateConflictError";
  }
}

export class WorkflowConditionContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowConditionContextError";
  }
}
