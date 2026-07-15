// ============================================================================
// FLAG-001 — Postgres feature-flag store + audit recorder.
// Imported by the platform runtime (composition root). Keep this file free of
// platform-runtime imports to avoid a module cycle.
// ============================================================================
import { eq, sql } from "drizzle-orm";
import { audit, db, schema } from "./lib.js";
import type { FeatureFlagStore, SetFeatureFlagInput } from "./platform/features/types.js";

/** Missing row = OFF. */
export const postgresFeatureFlagStore: FeatureFlagStore = {
  async list(tenantId: string) {
    return db.select({
      featureKey: schema.tenantFeatureFlags.featureKey,
      enabled: schema.tenantFeatureFlags.enabled,
      note: schema.tenantFeatureFlags.note,
      updatedAt: schema.tenantFeatureFlags.updatedAt,
    }).from(schema.tenantFeatureFlags)
      .where(eq(schema.tenantFeatureFlags.tenantId, tenantId));
  },
  async upsert(input: SetFeatureFlagInput) {
    await db.insert(schema.tenantFeatureFlags).values({
      tenantId: input.tenantId,
      featureKey: input.key,
      enabled: input.enabled,
      note: input.note,
      updatedBy: input.actorUserId,
    }).onConflictDoUpdate({
      target: [schema.tenantFeatureFlags.tenantId, schema.tenantFeatureFlags.featureKey],
      set: {
        enabled: input.enabled,
        note: input.note,
        updatedBy: input.actorUserId,
        updatedAt: sql`now()`,
      },
    });
  },
};

/** Audit evidence on the target tenant for every toggle. */
export async function recordFeatureFlagAudit(input: SetFeatureFlagInput): Promise<void> {
  await audit(
    db, input.tenantId, input.actorUserId,
    input.enabled ? "platform.feature.enabled" : "platform.feature.disabled",
    "tenant_feature_flag", undefined,
    { featureKey: input.key, note: input.note },
  );
}
