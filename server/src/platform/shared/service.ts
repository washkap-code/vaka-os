import type { Clock, IdentifierGenerator, Logger, SharedServiceContract } from "./interfaces.js";
import type { JsonObject } from "./types.js";

const systemClock: Clock = { now: () => new Date() };
const systemIdentifiers: IdentifierGenerator = { next: () => crypto.randomUUID() };
const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export class SharedService implements SharedServiceContract {
  constructor(
    private readonly clock: Clock = systemClock,
    private readonly identifiers: IdentifierGenerator = systemIdentifiers,
    private readonly logger: Logger = silentLogger,
  ) {}

  now(): Date { return this.clock.now(); }
  nextId(): string { return this.identifiers.next(); }
  logInfo(message: string, metadata?: JsonObject): void { this.logger.info(message, metadata); }
}
