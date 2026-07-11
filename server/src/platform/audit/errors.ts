export class InvalidAuditEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAuditEventError";
  }
}
