import type { JsonObject } from "./types.js";

export interface Clock {
  now(): Date;
}

export interface IdentifierGenerator {
  next(): string;
}

export interface Logger {
  debug(message: string, metadata?: JsonObject): void;
  info(message: string, metadata?: JsonObject): void;
  warn(message: string, metadata?: JsonObject): void;
  error(message: string, metadata?: JsonObject): void;
}

export interface SharedServiceContract {
  now(): Date;
  nextId(): string;
  logInfo(message: string, metadata?: JsonObject): void;
}
