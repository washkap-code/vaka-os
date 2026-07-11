import type { AuditEvent, AuditSink } from "./types.js";

export interface AuditServiceContract {
  record(event: AuditEvent): Promise<void>;
}

export type AuditSinkProvider = AuditSink;
