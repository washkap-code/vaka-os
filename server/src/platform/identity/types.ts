export type TenantId = string;
export type UserId = string;
export type SessionId = string;
export type Permission = string;

export interface IdentityContext {
  userId: UserId | null;
  tenantId: TenantId | null;
  sessionId: SessionId | null;
  isPlatformAdmin: boolean;
  permissions: readonly Permission[];
  correlationId?: string;
}
