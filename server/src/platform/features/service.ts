// ============================================================================
// FEATURE FLAG SERVICE (Mission FLAG-001) — kernel implementation.
// Fail closed everywhere: unknown key => disabled; missing row => disabled.
// ============================================================================
import {
  FEATURE_CATALOGUE, isFeatureKey,
  type FeatureFlagAuditRecorder, type FeatureFlagStore, type FeatureKey,
  type SetFeatureFlagInput, type TenantFeatureState,
} from "./types.js";

export class UnknownFeatureError extends Error {
  constructor(key: string) {
    super(`Unknown feature key: ${key}`);
  }
}

export class FeatureFlagService {
  constructor(
    private readonly store: FeatureFlagStore,
    private readonly recordAudit: FeatureFlagAuditRecorder,
  ) {}

  catalogue() {
    return FEATURE_CATALOGUE;
  }

  /** Enabled feature keys for a tenant (the `/me` payload). */
  async enabledFeatures(tenantId: string): Promise<FeatureKey[]> {
    const rows = await this.store.list(tenantId);
    return rows
      .filter((row) => row.enabled && isFeatureKey(row.featureKey))
      .map((row) => row.featureKey as FeatureKey);
  }

  /** Fail closed: unknown keys and missing rows are disabled. */
  async isEnabled(tenantId: string, key: string): Promise<boolean> {
    if (!isFeatureKey(key)) return false;
    const rows = await this.store.list(tenantId);
    return rows.some((row) => row.featureKey === key && row.enabled);
  }

  /** Full catalogue with per-tenant state (the platform-admin view). */
  async tenantState(tenantId: string): Promise<TenantFeatureState[]> {
    const rows = await this.store.list(tenantId);
    const byKey = new Map(rows.map((row) => [row.featureKey, row]));
    return FEATURE_CATALOGUE.map((feature) => {
      const row = byKey.get(feature.key);
      return {
        key: feature.key,
        label: feature.label,
        programme: feature.programme,
        enabled: row?.enabled ?? false,
        note: row?.note ?? null,
        updatedAt: row?.updatedAt?.toISOString() ?? null,
      };
    });
  }

  /** Validated, audited toggle. Throws UnknownFeatureError for keys outside the catalogue. */
  async setFlag(input: Omit<SetFeatureFlagInput, "key"> & { key: string }): Promise<TenantFeatureState[]> {
    if (!isFeatureKey(input.key)) throw new UnknownFeatureError(input.key);
    const validated: SetFeatureFlagInput = { ...input, key: input.key };
    await this.store.upsert(validated);
    await this.recordAudit(validated);
    return this.tenantState(input.tenantId);
  }
}
