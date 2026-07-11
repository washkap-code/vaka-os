import type { IdentityContext, Permission, TenantId } from "./types.js";

export interface IdentityServiceContract {
  context(): IdentityContext | null;
  requireTenant(): TenantId;
  hasPermission(permission: Permission): boolean;
}

export type IdentityContextProvider = () => IdentityContext | null;
