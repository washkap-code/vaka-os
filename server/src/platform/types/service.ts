import { InvalidPlatformTypeError } from "./errors.js";
import type { PlatformTypesServiceContract } from "./interfaces.js";
import type { TenantScoped } from "./types.js";

export class PlatformTypesService implements PlatformTypesServiceContract {
  requireNonEmpty(value: string, field: string): string {
    const normalised = value.trim();
    if (!normalised) throw new InvalidPlatformTypeError(`${field} is required`);
    return normalised;
  }

  requireTenantScope<T extends TenantScoped>(value: T, tenantId: string): T {
    const expected = this.requireNonEmpty(tenantId, "tenantId");
    if (value.tenantId !== expected) throw new InvalidPlatformTypeError("Tenant scope does not match");
    return value;
  }
}
