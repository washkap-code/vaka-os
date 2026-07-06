// ============================================================================
// VAKA PLATFORM — core library
// db client, typed errors, money math, RBAC permission catalogue,
// audit logging, per-tenant document numbering.
// ============================================================================
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
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
  "reports.read",
  "billing.manage",
  "users.manage",
  "settings.manage",
  "imports.create", "imports.approve",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const DEFAULT_ROLES: { name: string; permissions: Permission[] }[] = [
  { name: "Owner", permissions: [...PERMISSIONS] },
  { name: "Admin", permissions: [...PERMISSIONS] },
  { name: "Accountant", permissions: ["accounting.read", "accounting.post", "reports.read", "crm.read", "inventory.read"] },
  { name: "Sales", permissions: ["crm.read", "crm.write", "accounting.read", "inventory.read"] },
  { name: "Stock Controller", permissions: ["inventory.read", "inventory.write", "crm.read"] },
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
