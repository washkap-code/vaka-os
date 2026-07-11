export const PLATFORM_KERNEL_VERSION = "1.0" as const;

export type PlatformModuleName =
  | "identity"
  | "audit"
  | "events"
  | "workflow"
  | "notifications"
  | "documents"
  | "search"
  | "metadata"
  | "shared"
  | "container";
