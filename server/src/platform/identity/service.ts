import { IdentityContextMissingError, TenantContextMissingError } from "./errors.js";
import type { IdentityContextProvider, IdentityServiceContract } from "./interfaces.js";
import type { IdentityContext, Permission, TenantId } from "./types.js";

export class IdentityService implements IdentityServiceContract {
  constructor(private readonly provider: IdentityContextProvider) {}

  context(): IdentityContext | null { return this.provider(); }

  requireTenant(): TenantId {
    const context = this.provider();
    if (!context) throw new IdentityContextMissingError();
    if (!context.tenantId) throw new TenantContextMissingError();
    return context.tenantId;
  }

  hasPermission(permission: Permission): boolean {
    return this.provider()?.permissions.includes(permission) ?? false;
  }
}
