import type { AuditEvent, AuditSink } from "../types.js";

/**
 * Exact row shape written by the legacy `audit()` helper
 * (server/src/lib.ts) into the `audit_logs` table.
 *
 * Parity with the legacy helper is guaranteed by test:
 * `tests/adapter-parity.test.ts`.
 */
export interface AuditLogRow {
  tenantId: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: object | null;
}

/** Pure mapping from a platform `AuditEvent` to the legacy `audit_logs` row shape. */
export function toAuditLogRow(event: AuditEvent): AuditLogRow {
  return {
    tenantId: event.tenantId,
    userId: event.actorUserId,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId ?? null,
    metadata: (event.metadata as object | null | undefined) ?? null,
  };
}

export type AuditRowWriter = (row: AuditLogRow) => Promise<void> | void;

/**
 * `AuditSink` that appends via an injected writer. The composition root
 * (server/src/platform-runtime.ts) binds the writer to the application
 * database; tests bind it to an in-memory capture. The platform layer
 * itself never takes a hard dependency on drizzle or `pg`.
 */
export function createAuditSink(write: AuditRowWriter): AuditSink {
  return {
    async append(event: AuditEvent): Promise<void> {
      await write(toAuditLogRow(event));
    },
  };
}
