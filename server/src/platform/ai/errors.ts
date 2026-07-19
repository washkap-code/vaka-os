export class AIContextBoundaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIContextBoundaryError";
  }
}

export class AIPermissionDeniedError extends Error {
  constructor(permission: string) {
    super(`Missing permission: ${permission}`);
    this.name = "AIPermissionDeniedError";
  }
}

export class AIObjectUnavailableError extends Error {
  constructor(objectType: string) {
    super(`${objectType} is not available to AI context`);
    this.name = "AIObjectUnavailableError";
  }
}

export class AIObjectNotFoundError extends Error {
  constructor(objectType: string) {
    super(`${objectType} not found`);
    this.name = "AIObjectNotFoundError";
  }
}

export class AIAgentUnavailableError extends Error {
  constructor(agentCode: string) {
    super(`AI agent is unavailable: ${agentCode}`);
    this.name = "AIAgentUnavailableError";
  }
}

export class AIProviderUnavailableError extends Error {
  constructor(message = "AI model provider is unavailable") {
    super(message);
    this.name = "AIProviderUnavailableError";
  }
}

export class AIProviderResponseError extends Error {
  constructor(message = "AI model provider returned an invalid response") {
    super(message);
    this.name = "AIProviderResponseError";
  }
}
