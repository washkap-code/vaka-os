export class DuplicateServiceError extends Error {
  constructor() {
    super("A service is already registered for this token");
    this.name = "DuplicateServiceError";
  }
}

export class MissingServiceError extends Error {
  constructor() {
    super("No service is registered for this token");
    this.name = "MissingServiceError";
  }
}
