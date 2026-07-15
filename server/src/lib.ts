// ============================================================================
// VAKA PLATFORM — core library
// db client, typed errors, money math, RBAC permission catalogue,
// audit logging, per-tenant document numbering.
// ============================================================================
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "./db/schema.js";
import { databaseUrl } from "./config.js";

export const pool = new Pool({
  connectionString: databaseUrl(),
  max: 20,
});
export const db = drizzle(pool, { schema });
export type DB = NodePgDatabase<typeof schema> | Parameters<Parameters<NodePgDatabase<typeof schema>["transaction"]>[0]>[0];
export { schema };

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
export class AppError extends Error {
  constructor(public status: number, message: string, public code = "APP_ERROR") {
    super(message);
  }
}
export const badRequest = (m: string) => new AppError(400, m, "BAD_REQUEST");
export const unauthorized = (m = "Unauthorized") => new AppError(401, m, "UNAUTHORIZED");
export const forbidden = (m = "Forbidden") => new AppError(403, m, "FORBIDDEN");
export const notFound = (m = "Not found") => new AppError(404, m, "NOT_FOUND");
export const conflict = (m: string) => new AppError(409, m, "CONFLICT");

// ---------------------------------------------------------------------------
// Idempotency — stable fingerprints prevent same-key/different-payload replays.
// ---------------------------------------------------------------------------
const stableValue = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = stableValue((value as Record<string, unknown>)[key]);
      return acc;
    }, {});
  }
  return value;
};

export const payloadFingerprint = (payload: Record<string, unknown>): string =>
  createHash("sha256").update(JSON.stringify(stableValue(payload))).digest("hex");

export const normalizeIdempotencyKey = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const key = value.trim();
  return key.length ? key : null;
};

export const requireIdempotencyKey = (value: unknown): string => {
  const key = normalizeIdempotencyKey(value);
  if (!key) throw badRequest("Idempotency-Key is required for this financial action");
  if (key.length < 8 || key.length > 120) throw badRequest("Idempotency-Key must be between 8 and 120 characters");
  return key;
};

export const assertIdempotencyFingerprint = (
  stored: string | null | undefined,
  current: string,
  action = "financial action",
) => {
  if (stored !== current) throw conflict(`Idempotency key was already used with different ${action} details`);
};

// ---------------------------------------------------------------------------
// Money math — all monetary arithmetic in integer cents to avoid float drift.
// Values move to/from Postgres NUMERIC as strings.
// ---------------------------------------------------------------------------
export const toCents = (v: string | number): bigint => {
  const s = typeof v === "number" ? v.toFixed(2) : Number(v).toFixed(2);
  const neg = s.startsWith("-");
  const [i, f = "00"] = s.replace("-", "").split(".");
  const cents = BigInt(i) * 100n + BigInt(f.padEnd(2, "0").slice(0, 2));
  return neg ? -cents : cents;
};
export const fromCents = (c: bigint): string => {
  const neg = c < 0n;
  const abs = neg ? -c : c;
  return `${neg ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
};
/** multiply money by a decimal rate (e.g. currency conversion, tax) with round-half-up */
export const mulRate = (cents: bigint, rateStr: string): bigint => {
  // rate to 6dp fixed
  const r = Math.round(Number(rateStr) * 1_000_000);
  const prod = cents * BigInt(r);
  const div = 1_000_000n;
  const half = div / 2n;
  return (prod >= 0n ? prod + half : prod - half) / div;
};

// ---------------------------------------------------------------------------
// RBAC permission catalogue
// ---------------------------------------------------------------------------
export const PERMISSIONS = [
  "crm.read", "crm.write",
  "accounting.read", "accounting.post",
  "inventory.read", "inventory.write",
  "procurement.read", "procurement.request", "procurement.write",
  "procurement.approve", "procurement.receive",
  "reports.read",
  "billing.manage",
  "users.manage",
  "settings.manage",
  "imports.create", "imports.approve",
  "bank_accounts.read", "bank_accounts.configure",
  "bank_statements.import", "bank_transactions.read", "bank_transactions.match",
  "bank_reconciliation.prepare", "bank_reconciliation.approve",
  "payroll.read", "payroll.manage", "payroll.post",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const DEFAULT_ROLES: { name: string; permissions: Permission[] }[] = [
  { name: "Owner", permissions: [...PERMISSIONS] },
  { name: "Admin", permissions: [...PERMISSIONS] },
  { name: "Accountant", permissions: [
    "accounting.read", "accounting.post", "reports.read", "crm.read", "inventory.read",
    "procurement.read",
    "bank_accounts.read", "bank_transactions.read", "bank_transactions.match",
    "bank_reconciliation.prepare",
    "payroll.read", "payroll.manage", "payroll.post",
  ] },
  { name: "Sales", permissions: ["crm.read", "crm.write", "accounting.read", "inventory.read"] },
  { name: "Stock Controller", permissions: [
    "inventory.read", "inventory.write", "crm.read",
    "procurement.read", "procurement.request", "procurement.write", "procurement.receive",
  ] },
  { name: "Procurement Officer", permissions: [
    "procurement.read", "procurement.request", "procurement.write", "procurement.receive",
  ] },
  { name: "Procurement Approver", permissions: ["procurement.read", "procurement.approve"] },
  { name: "Staff", permissions: ["crm.read", "inventory.read"] },
];

// ---------------------------------------------------------------------------
// Audit logging — mandatory on money, stock, permissions, lifecycle events
// ---------------------------------------------------------------------------
export async function audit(
  tx: DB, tenantId: string, userId: string | null, action: string,
  entityType: string, entityId?: string, metadata?: unknown,
) {
  await tx.insert(schema.auditLogs).values({
    tenantId, userId, action, entityType,
    entityId: entityId ?? null, metadata: (metadata as object) ?? null,
  });
}

// ---------------------------------------------------------------------------
// Per-tenant sequential document numbers (invoice/PO/payment) — race-safe via
// row lock inside the caller's transaction. Numbers are immutable once issued.
// ---------------------------------------------------------------------------
export async function nextDocNumber(tx: DB, tenantId: string, key: string, prefix: string): Promise<string> {
  const rows = await tx.execute(sql`
    INSERT INTO number_sequences (tenant_id, key, prefix, next_val)
    VALUES (${tenantId}, ${key}, ${prefix}, 2)
    ON CONFLICT (tenant_id, key)
    DO UPDATE SET next_val = number_sequences.next_val + 1
    RETURNING prefix, next_val - 1 AS val
  `);
  const r: any = (rows as any).rows[0];
  return `${r.prefix}-${String(r.val).padStart(5, "0")}`;
}

// tiny helper: today at UTC midnight
export const now = () => new Date();
