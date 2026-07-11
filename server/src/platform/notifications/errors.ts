export class InvalidNotificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidNotificationError";
  }
}
