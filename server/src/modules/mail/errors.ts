export class MailConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailConfigurationError";
  }
}

export class MailProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailProtocolError";
  }
}
