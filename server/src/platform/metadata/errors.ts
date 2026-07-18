export class InvalidMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMetadataError";
  }
}

export class InvalidMetadataRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMetadataRegistryError";
  }
}

export class UnknownMetadataObjectError extends Error {
  constructor(name: string) {
    super(`Unknown metadata object: ${name}`);
    this.name = "UnknownMetadataObjectError";
  }
}
