import { IdentityService } from "../service.js";
import type { IdentityContext } from "../types.js";

/**
 * Structural snapshot of the authenticated request state produced by the
 * legacy auth middleware (server/src/auth.ts — `AuthedRequest["auth"]`).
 *
 * Declared structurally so the platform layer never depends on Express or
 * the application auth module. Any object with these fields (including the
 * wider `AuthedRequest["auth"]` shape) is accepted.
 */
export interface AuthSnapshot {
  userId: string;
  tenantId: string | null;
  isPlatformAdmin: boolean;
  sessionId: string | null;
  permissions: readonly string[];
}

/**
 * Pure mapping from the legacy auth shape to the platform `IdentityContext`.
 *
 * Permissions are copied (not aliased) so a context can never be mutated
 * through the original auth object after the snapshot is taken.
 */
export function identityContextFromAuth(
  auth: AuthSnapshot | null | undefined,
): IdentityContext | null {
  if (!auth) return null;
  return {
    userId: auth.userId,
    tenantId: auth.tenantId,
    sessionId: auth.sessionId,
    isPlatformAdmin: auth.isPlatformAdmin,
    permissions: [...auth.permissions],
  };
}

/**
 * An `IdentityService` bound to a single request's auth snapshot.
 * The snapshot is captured once; later mutation of the source object
 * does not change the identity the service reports.
 */
export function identityServiceForAuth(
  auth: AuthSnapshot | null | undefined,
): IdentityService {
  const context = identityContextFromAuth(auth);
  return new IdentityService(() => context);
}
