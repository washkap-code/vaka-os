// ============================================================================
// PLATFORM RUNTIME — composition root (Mission P1-002).
//
// Binds the Platform Kernel contracts introduced in P1-001 to the existing
// application implementations:
//
//   IdentityServiceContract  ←  auth middleware snapshot (server/src/auth.ts)
//   AuditServiceContract     ←  audit_logs table         (server/src/lib.ts)
//
// No call sites are migrated here. Existing routes keep using the legacy
// helpers; new modules resolve services from the kernel container instead.
// ============================================================================
import { db, schema } from "./lib.js";
import { createPlatformKernel, PlatformKernel } from "./platform/index.js";
import { createServiceToken } from "./platform/container/service.js";
import type { ServiceToken } from "./platform/container/types.js";
import { AuditService } from "./platform/audit/service.js";
import { createAuditSink, type AuditRowWriter } from "./platform/audit/adapters/audit-sink.js";
import { IdentityService } from "./platform/identity/service.js";
import { identityServiceForAuth, type AuthSnapshot } from "./platform/identity/adapters/auth-context.js";
import { LocalisationService } from "./platform/localisation/service.js";
import type { CountryPack } from "./platform/localisation/types.js";
import { ZIMBABWE } from "./countries/zw.js";
import { NotificationService } from "./platform/notifications/service.js";
import { emailGateway } from "./platform/notifications/adapters/email-gateway.js";
import { inAppGateway } from "./platform/notifications/adapters/in-app-gateway.js";
import { noopGateway } from "./platform/notifications/adapters/noop-gateway.js";
import type {
  EmailTransport, NotificationAuditRecorder, NotificationDedupeLookup, NotificationWriter,
} from "./platform/notifications/index.js";
import {
  createHttpEmailTransport, findNotificationDuplicate, persistNotification,
} from "./notifications.js";

/** Produces a request-scoped IdentityService from an auth middleware snapshot. */
export interface RequestIdentityFactory {
  for(auth: AuthSnapshot | null | undefined): IdentityService;
}

export const AUDIT_SERVICE: ServiceToken<AuditService> =
  createServiceToken("platform.audit.service");

export const IDENTITY_FACTORY: ServiceToken<RequestIdentityFactory> =
  createServiceToken("platform.identity.request-factory");

export const LOCALISATION_SERVICE: ServiceToken<LocalisationService> =
  createServiceToken("platform.localisation.service");

export const NOTIFICATION_SERVICE: ServiceToken<NotificationService> =
  createServiceToken("platform.notifications.service");

/** Country packs registered by default. Zimbabwe is the launch market. */
export const DEFAULT_COUNTRY_PACKS: readonly CountryPack[] = [ZIMBABWE];

export interface PlatformKernelOptions {
  /** Override the audit writer (tests). Defaults to the application database. */
  auditWriter?: AuditRowWriter;
  /** Override the registered country packs (tests). Defaults to DEFAULT_COUNTRY_PACKS. */
  countryPacks?: readonly CountryPack[];
  /** Notification adapter overrides keep tests and future providers transport-neutral. */
  emailTransport?: EmailTransport;
  notificationWriter?: NotificationWriter;
  notificationDedupeLookup?: NotificationDedupeLookup;
  notificationAuditRecorder?: NotificationAuditRecorder;
}

/**
 * Build a fully composed Platform Kernel for this application.
 * Idempotent per call: each invocation returns an isolated kernel.
 */
export function buildPlatformKernel(options: PlatformKernelOptions = {}): PlatformKernel {
  const kernel = createPlatformKernel();

  const writeAuditRow: AuditRowWriter =
    options.auditWriter ??
    (async (row) => {
      await db.insert(schema.auditLogs).values(row);
    });

  kernel.container.registerFactory(AUDIT_SERVICE, () =>
    new AuditService(createAuditSink(writeAuditRow)),
  );

  kernel.container.registerValue<RequestIdentityFactory>(IDENTITY_FACTORY, {
    for: (auth) => identityServiceForAuth(auth),
  });

  const countryPacks = options.countryPacks ?? DEFAULT_COUNTRY_PACKS;
  kernel.container.registerFactory(LOCALISATION_SERVICE, () =>
    new LocalisationService(countryPacks),
  );

  kernel.container.registerFactory(NOTIFICATION_SERVICE, () => {
    const persist = options.notificationWriter ?? persistNotification;
    const recordAudit: NotificationAuditRecorder = options.notificationAuditRecorder
      ?? (async (request, delivery) => kernel.container.get(AUDIT_SERVICE).record({
        tenantId: request.tenantId,
        actorUserId: request.actorUserId,
        action: delivery.status === "failed"
          ? "notification.failed"
          : delivery.transmitted ? "notification.sent" : "notification.accepted",
        entityType: "notification",
        entityId: delivery.requestId,
        metadata: {
          channel: request.channel,
          template: request.template,
          status: delivery.status ?? "accepted",
          transmitted: delivery.transmitted ?? false,
          deduplicated: delivery.deduplicated ?? false,
        },
      }));
    return new NotificationService({
      EMAIL: emailGateway(options.emailTransport ?? createHttpEmailTransport(), persist),
      IN_APP: inAppGateway(persist),
      SMS: noopGateway("SMS", persist),
      WHATSAPP: noopGateway("WHATSAPP", persist),
    }, options.notificationDedupeLookup ?? findNotificationDuplicate, recordAudit);
  });

  return kernel;
}

let defaultKernel: PlatformKernel | null = null;

/** Lazily constructed process-wide kernel bound to the application database. */
export function platformKernel(): PlatformKernel {
  if (!defaultKernel) defaultKernel = buildPlatformKernel();
  return defaultKernel;
}
