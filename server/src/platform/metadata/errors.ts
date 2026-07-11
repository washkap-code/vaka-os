export class InvalidMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMetadataError";
  }
}
