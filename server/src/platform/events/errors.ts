export class InvalidPlatformEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPlatformEventError";
  }
}
