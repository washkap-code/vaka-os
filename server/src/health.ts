import { emailDeliveryConfig, type EmailDeliveryConfig } from "./config.js";
import { pool } from "./lib.js";

export const EXPECTED_MIGRATION = "0053_blackbook_core";

export interface ReadinessCheck {
  status: "pass" | "fail" | "not_required";
  critical: boolean;
  detail: string;
}

export interface ReadinessReport {
  status: "ready" | "not_ready";
  expectedMigration: string;
  checks: {
    database: ReadinessCheck;
    migrations: ReadinessCheck;
    smtp: ReadinessCheck;
  };
}

export interface ReadinessChecker {
  check(): Promise<ReadinessReport>;
}

type Query = (text: string) => Promise<{ rows: Record<string, unknown>[] }>;

const migrationStatusSql = `
  SELECT (
    to_regclass('public.migration_projects') IS NOT NULL
    AND to_regclass('public.directory_enquiries') IS NOT NULL
    AND to_regclass('public.document_approvals') IS NOT NULL
    AND to_regclass('public.gov_organisations') IS NOT NULL
    AND to_regclass('public.gov_contact_points') IS NOT NULL
    AND to_regclass('public.gov_services') IS NOT NULL
    AND to_regclass('public.blackbook_revisions') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'customer_timeline_events'
        AND column_name = 'created_at'
    )
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'customer_timeline_events'
        AND column_name = 'projected_at'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tenants'
        AND column_name = 'invoice_bank_currency' AND udt_name = 'currency'
    )
  ) AS current
`;

async function bounded<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Health check timed out")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function safeCheck(work: () => Promise<ReadinessCheck>, timeoutMs: number): Promise<ReadinessCheck> {
  try {
    return await bounded(work(), timeoutMs);
  } catch {
    return { status: "fail", critical: true, detail: "check failed" };
  }
}

export function createReadinessChecker(options: {
  query?: Query;
  emailConfig?: () => EmailDeliveryConfig;
  environment?: string;
  timeoutMs?: number;
} = {}): ReadinessChecker {
  const query = options.query ?? (async (text: string) => {
    const result = await pool.query(text);
    return { rows: result.rows as Record<string, unknown>[] };
  });
  const readEmailConfig = options.emailConfig ?? (() => emailDeliveryConfig());
  const environment = options.environment ?? process.env.NODE_ENV ?? "unknown";
  const timeoutMs = options.timeoutMs ?? 2_000;

  return {
    async check() {
      const database = safeCheck(async () => {
        await query("SELECT 1 AS ok");
        return { status: "pass", critical: true, detail: "connected" };
      }, timeoutMs);
      const migrations = safeCheck(async () => {
        const result = await query(migrationStatusSql);
        return result.rows[0]?.current === true
          ? { status: "pass", critical: true, detail: EXPECTED_MIGRATION }
          : { status: "fail", critical: true, detail: "schema version mismatch" };
      }, timeoutMs);
      const smtp = Promise.resolve().then<ReadinessCheck>(() => {
        try {
          const config = readEmailConfig();
          if (config.mode === "smtp") return { status: "pass", critical: true, detail: "configured" };
          return {
            status: "not_required",
            critical: false,
            detail: `${config.mode} transport (${environment})`,
          };
        } catch {
          return { status: "fail", critical: environment === "production", detail: "configuration invalid" };
        }
      });
      const checks = {
        database: await database,
        migrations: await migrations,
        smtp: await smtp,
      };
      const ready = Object.values(checks).every((check) => !check.critical || check.status !== "fail");
      return {
        status: ready ? "ready" : "not_ready",
        expectedMigration: EXPECTED_MIGRATION,
        checks,
      };
    },
  };
}
