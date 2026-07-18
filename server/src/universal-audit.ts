import { sql } from "drizzle-orm";
import { badRequest, db, type DB } from "./lib.js";
import { CANONICAL_OBJECT_DEFINITIONS } from "./platform/metadata/definitions.js";
import type { ObjectDefinition } from "./platform/metadata/types.js";

export const UNIVERSAL_AUDIT_OBJECTS = [
  "Customer", "Supplier", "Invoice", "Payment", "Product", "Employee", "Company", "User",
] as const;

export type UniversalAuditObjectType = typeof UNIVERSAL_AUDIT_OBJECTS[number];
export type AuditActorType = "user" | "system" | "ai";
export type AuditRecordValue = Record<string, unknown>;

export interface UniversalAuditRecordInput {
  id?: string;
  tenantId: string;
  actorId: string | null;
  actorType: AuditActorType;
  action: string;
  objectType: UniversalAuditObjectType;
  objectId: string;
  before: AuditRecordValue | null;
  after: AuditRecordValue | null;
  source: string;
  ip?: string | null;
  occurredAt?: Date;
}

export interface AuditChainVerification {
  tenantId: string;
  valid: boolean;
  checked: number;
  brokenAt: string | null;
  reason: "empty" | "valid" | "hash_mismatch" | "missing_root" | "multiple_roots" | "broken_link" | "cycle_or_branch";
}

const definitions = new Map<string, ObjectDefinition>(
  CANONICAL_OBJECT_DEFINITIONS.map((definition) => [definition.name.toLowerCase(), definition]),
);

function normaliseJsonValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normaliseJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, normaliseJsonValue(item)]));
  }
  return value;
}

function equivalent(left: unknown, right: unknown): boolean {
  return JSON.stringify(normaliseJsonValue(left)) === JSON.stringify(normaliseJsonValue(right));
}

function objectDefinition(objectType: UniversalAuditObjectType): ObjectDefinition {
  const definition = definitions.get(objectType.toLowerCase());
  if (!definition) throw badRequest(`Unknown canonical audit object: ${objectType}`);
  return definition;
}

/**
 * Build a changed-fields-only before/after pair from the canonical registry.
 * Infrastructure columns and values outside the registered object contract are
 * never copied into universal audit evidence.
 */
export function canonicalAuditDiff(
  objectType: UniversalAuditObjectType,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): { before: AuditRecordValue | null; after: AuditRecordValue | null; changedFields: string[] } {
  const definition = objectDefinition(objectType);
  const changedFields = definition.fields
    .map((field) => field.name)
    .filter((name) => name !== "tenantId")
    .filter((name) => !equivalent(before?.[name], after?.[name]));

  const select = (record: Record<string, unknown> | null): AuditRecordValue | null => {
    if (!record) return null;
    return Object.fromEntries(changedFields
      .filter((name) => record[name] !== undefined)
      .map((name) => [name, normaliseJsonValue(record[name])]));
  };

  return { before: select(before), after: select(after), changedFields };
}

/** Append through the database function so tenant-chain serialization is atomic. */
export async function appendUniversalAudit(
  tx: DB,
  input: UniversalAuditRecordInput,
): Promise<void> {
  if (!input.tenantId.trim() || !input.action.trim() || !input.objectId.trim() || !input.source.trim()) {
    throw badRequest("Universal audit tenant, action, object and source are required");
  }
  if (input.actorType === "user" && !input.actorId) {
    throw badRequest("A user audit actor requires an actor id");
  }
  const before = input.before === null ? null : JSON.stringify(input.before);
  const after = input.after === null ? null : JSON.stringify(input.after);
  await tx.execute(sql`
    SELECT vaka_append_audit_log(
      ${input.id ?? null}::uuid,
      ${input.tenantId}::uuid,
      ${input.actorId}::uuid,
      ${input.actorType}::text,
      ${input.action}::text,
      ${input.objectType}::text,
      ${input.objectId}::text,
      ${before}::jsonb,
      ${after}::jsonb,
      ${input.source}::text,
      ${input.ip ?? null}::text,
      ${input.occurredAt ?? new Date()}::timestamptz
    )
  `);
}

/**
 * Transaction middleware for canonical CRUD paths. It snapshots only changed
 * registry fields and records no entry for a no-op update.
 */
export async function autoAuditMutation(
  tx: DB,
  input: Omit<UniversalAuditRecordInput, "before" | "after" | "source"> & {
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
  },
): Promise<boolean> {
  const diff = canonicalAuditDiff(input.objectType, input.before, input.after);
  if (!diff.changedFields.length) return false;
  await appendUniversalAudit(tx, {
    ...input,
    before: diff.before,
    after: diff.after,
    source: "auto",
  });
  return true;
}

export async function autoAuditContactRoles(
  tx: DB,
  input: {
    tenantId: string;
    actorId: string;
    action: "created" | "updated" | "deleted";
    objectId: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    ip?: string | null;
  },
): Promise<void> {
  const customer = input.before?.isCustomer === true || input.after?.isCustomer === true;
  const supplier = input.before?.isVendor === true || input.after?.isVendor === true;
  for (const objectType of [customer ? "Customer" : null, supplier ? "Supplier" : null] as const) {
    if (!objectType) continue;
    await autoAuditMutation(tx, {
      tenantId: input.tenantId,
      actorId: input.actorId,
      actorType: "user",
      action: `${objectType.toLowerCase()}.${input.action}`,
      objectType,
      objectId: input.objectId,
      before: input.before,
      after: input.after,
      ip: input.ip,
    });
  }
}

interface VerificationRow {
  id: string;
  hash: string;
  prev_hash: string | null;
  expected_hash: string;
}

/** Verify record hashes and that every row belongs to one unbranched tenant chain. */
export async function verifyAuditChain(tenantId: string): Promise<AuditChainVerification> {
  const result = await db.execute(sql`
    SELECT
      "id"::text,
      "hash",
      "prev_hash",
      encode(sha256(convert_to(
        COALESCE("prev_hash", '') || vaka_audit_record_content(
          "id", "tenant_id", "actor_id", "actor_type", "action", "object_type",
          "object_id", "before_json", "after_json", "source", "ip", "occurred_at"
        ), 'UTF8'
      )), 'hex') AS "expected_hash"
    FROM "audit_log"
    WHERE "tenant_id" = ${tenantId}::uuid
  `);
  const rows = (result as unknown as { rows: VerificationRow[] }).rows;
  if (!rows.length) {
    return { tenantId, valid: true, checked: 0, brokenAt: null, reason: "empty" };
  }

  const hashMismatch = rows.find((row) => row.hash !== row.expected_hash);
  if (hashMismatch) {
    return {
      tenantId, valid: false, checked: rows.length,
      brokenAt: hashMismatch.id, reason: "hash_mismatch",
    };
  }

  const roots = rows.filter((row) => row.prev_hash === null);
  if (!roots.length) {
    return { tenantId, valid: false, checked: rows.length, brokenAt: null, reason: "missing_root" };
  }
  if (roots.length > 1) {
    return { tenantId, valid: false, checked: rows.length, brokenAt: roots[1].id, reason: "multiple_roots" };
  }

  const byHash = new Map(rows.map((row) => [row.hash, row]));
  const brokenLink = rows.find((row) => row.prev_hash !== null && !byHash.has(row.prev_hash));
  if (brokenLink) {
    return { tenantId, valid: false, checked: rows.length, brokenAt: brokenLink.id, reason: "broken_link" };
  }

  const children = new Map<string, VerificationRow[]>();
  for (const row of rows) {
    if (!row.prev_hash) continue;
    const group = children.get(row.prev_hash) ?? [];
    group.push(row);
    children.set(row.prev_hash, group);
  }
  let current: VerificationRow | undefined = roots[0];
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    const next: VerificationRow[] = children.get(current.hash) ?? [];
    if (next.length > 1) {
      return { tenantId, valid: false, checked: rows.length, brokenAt: next[1].id, reason: "cycle_or_branch" };
    }
    current = next[0];
  }
  if (visited.size !== rows.length) {
    const unvisited = rows.find((row) => !visited.has(row.id));
    return { tenantId, valid: false, checked: rows.length, brokenAt: unvisited?.id ?? null, reason: "cycle_or_branch" };
  }
  return { tenantId, valid: true, checked: rows.length, brokenAt: null, reason: "valid" };
}
