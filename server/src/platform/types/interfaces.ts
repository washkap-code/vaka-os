import type { TenantScoped } from "./types.js";

export interface PlatformTypesServiceContract {
  requireNonEmpty(value: string, field: string): string;
  requireTenantScope<T extends TenantScoped>(value: T, tenantId: string): T;
}
