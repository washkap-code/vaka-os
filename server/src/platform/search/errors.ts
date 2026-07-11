export class InvalidSearchQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSearchQueryError";
  }
}
