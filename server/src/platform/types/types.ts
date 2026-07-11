export type Branded<T, Brand extends string> = T & { readonly __brand: Brand };

export interface TenantScoped {
  tenantId: string;
}

export type ServiceResult<T, E extends string = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };
