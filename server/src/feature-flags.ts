// ============================================================================
// FLAG-002 — Feature gating middleware and route-facing helpers.
//
// The build-dark rule: gated APIs fail closed with FEATURE_DISABLED; the web
// shell hides gated navigation, but the UI is never the security boundary.
// Toggles are platform-admin actions, step-up protected at the route, and
// audited on the target tenant (see feature-flags-store.ts).
// ============================================================================
import type { NextFunction, Response } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { AppError, db, schema } from "./lib.js";
import { FEATURE_FLAG_SERVICE, platformKernel } from "./platform-runtime.js";
import type { FeatureKey } from "./platform/features/types.js";
import { UnknownFeatureError } from "./platform/features/service.js";

export const featureNoteSchema = z.string().trim().min(3).max(500);

export const featureDisabled = () =>
  new AppError(403, "This feature is not enabled for your workspace", "FEATURE_DISABLED");

/** Gate an authenticated route behind a tenant feature flag. Fail closed. */
export function requireFeature(key: FeatureKey) {
  return (req: any, _res: Response, next: NextFunction) => {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) return next(featureDisabled());
    platformKernel().container.get(FEATURE_FLAG_SERVICE)
      .isEnabled(tenantId, key)
      .then((enabled) => next(enabled ? undefined : featureDisabled()))
      .catch(next);
  };
}

/** Enabled feature keys for the `/me` payload (never throws — fails to []). */
export async function enabledFeaturesFor(tenantId: string | null | undefined): Promise<string[]> {
  if (!tenantId) return [];
  try {
    return await platformKernel().container.get(FEATURE_FLAG_SERVICE).enabledFeatures(tenantId);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Platform-admin operations
// ---------------------------------------------------------------------------
async function assertTenantExists(tenantId: string): Promise<void> {
  const [tenant] = await db.select({ id: schema.tenants.id })
    .from(schema.tenants).where(eq(schema.tenants.id, tenantId));
  if (!tenant) throw new AppError(404, "Tenant not found", "NOT_FOUND");
}

export async function listTenantFeatures(tenantId: string) {
  await assertTenantExists(tenantId);
  return platformKernel().container.get(FEATURE_FLAG_SERVICE).tenantState(tenantId);
}

export async function setTenantFeature(opts: {
  tenantId: string; key: string; enabled: boolean; note: string; actorUserId: string;
}) {
  await assertTenantExists(opts.tenantId);
  featureNoteSchema.parse(opts.note);
  try {
    return await platformKernel().container.get(FEATURE_FLAG_SERVICE).setFlag({
      tenantId: opts.tenantId, key: opts.key, enabled: opts.enabled,
      note: opts.note, actorUserId: opts.actorUserId,
    });
  } catch (error) {
    if (error instanceof UnknownFeatureError) {
      throw new AppError(400, error.message, "BAD_REQUEST");
    }
    throw error;
  }
}
