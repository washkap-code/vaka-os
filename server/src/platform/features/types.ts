// ============================================================================
// FEATURE FLAG CONTRACT (Mission FLAG-001)
//
// The build-dark model (Master Build Plan Part II §15): every post-launch
// module ships default-OFF behind a per-tenant flag from this closed
// catalogue. Unknown keys fail closed — rejected on write, disabled on read.
// Flags are availability switches only; entitlement/billing semantics arrive
// with PS-001 and map onto these keys.
// ============================================================================

export const FEATURE_CATALOGUE = [
  { key: "workflow.centre", label: "Workflow & Task Centre", programme: "PW" },
  { key: "documents.workspace", label: "Documents Workspace", programme: "PD" },
  { key: "network.directory", label: "Business Network & Directory", programme: "PN" },
  { key: "network.marketplace", label: "Marketplace", programme: "PN" },
  { key: "blackbook.directory", label: "Black Book", programme: "PB" },
  { key: "mail.hub", label: "Mail & Communications Hub", programme: "P7" },
  { key: "migration.hub", label: "Migration Hub", programme: "PM" },
  { key: "verify.centre", label: "VAKA Verify", programme: "PV" },
  { key: "store.catalogue", label: "VAKA Store", programme: "PS" },
  { key: "intelligence.advisors", label: "VAKA Intelligence Advisors", programme: "P8" },
  { key: "capital.centre", label: "VAKA Capital", programme: "PC" },
  { key: "developer.api", label: "Developer Platform API", programme: "PX" },
] as const;

export type FeatureKey = (typeof FEATURE_CATALOGUE)[number]["key"];

export const FEATURE_KEYS: readonly FeatureKey[] =
  FEATURE_CATALOGUE.map((feature) => feature.key);

export const isFeatureKey = (value: string): value is FeatureKey =>
  (FEATURE_KEYS as readonly string[]).includes(value);

export interface TenantFeatureState {
  key: FeatureKey;
  label: string;
  programme: string;
  enabled: boolean;
  note: string | null;
  updatedAt: string | null;
}

export interface SetFeatureFlagInput {
  tenantId: string;
  key: FeatureKey;
  enabled: boolean;
  note: string;
  actorUserId: string;
}

/** Persistence contract — implemented over Postgres in the application layer. */
export interface FeatureFlagStore {
  /** Rows that exist for a tenant (missing row = OFF). */
  list(tenantId: string): Promise<{ featureKey: string; enabled: boolean; note: string | null; updatedAt: Date }[]>;
  /** Idempotent upsert of one flag row. */
  upsert(input: SetFeatureFlagInput): Promise<void>;
}

/** Audit hook — every toggle records evidence on the target tenant. */
export type FeatureFlagAuditRecorder = (input: SetFeatureFlagInput) => Promise<void>;
