export class IdentityContextMissingError extends Error {
  constructor() {
    super("An authenticated identity context is required");
    this.name = "IdentityContextMissingError";
  }
}

export class TenantContextMissingError extends Error {
  constructor() {
    super("A tenant context is required for this operation");
    this.name = "TenantContextMissingError";
  }
}
