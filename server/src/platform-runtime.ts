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
  findNotificationDuplicate, persistNotification, PLATFORM_NOTIFICATION_SCOPE,
} from "./notifications.js";
import { createConfiguredEmailTransport } from "./email-transport.js";
import { applicationLogger, logEvent } from "./observability.js";
import { InMemoryEventBus } from "./platform/events/service.js";
import { SearchService } from "./platform/search/service.js";
import { PostgresSearchProvider, subscribeSearchIndex, type SearchApplicationAdapter } from "./search.js";
import { MetadataService } from "./platform/metadata/service.js";
import { MetadataRegistry } from "./platform/metadata/registry.js";
import type { MetadataProvider, MetadataRegistryContract } from "./platform/metadata/interfaces.js";
import { CanonicalMetadataProvider } from "./metadata.js";
import { CustomerTimelineProjector, subscribeCustomerTimeline, type CustomerTimelineProjectorContract } from "./customer-timeline.js";
import { LowStockAlertCoordinator, subscribeLowStockAlerts, type LowStockAlertCoordinatorContract } from "./low-stock-alerts.js";
import { DocumentService } from "./platform/documents/service.js";
import type { DocumentServiceContract, DocumentStore } from "./platform/documents/interfaces.js";
import { PostgresDocumentStore } from "./documents.js";
import {
  ProcurementApprovalNotifier, subscribeProcurementApprovalNotifications,
  type ProcurementApprovalNotifierContract,
} from "./procurement-notifications.js";
import { ApprovalService } from "./platform/workflow/approvals.js";
import { FeatureFlagService } from "./platform/features/service.js";
import type { FeatureFlagAuditRecorder, FeatureFlagStore } from "./platform/features/types.js";
import { postgresFeatureFlagStore, recordFeatureFlagAudit } from "./feature-flags-store.js";
import { subscribeTaskAutomation } from "./tasks.js";

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

export const EVENT_BUS: ServiceToken<InMemoryEventBus> =
  createServiceToken("platform.events.bus");

export const SEARCH_SERVICE: ServiceToken<SearchService> =
  createServiceToken("platform.search.service");

export const METADATA_SERVICE: ServiceToken<MetadataService> =
  createServiceToken("platform.metadata.service");

export const METADATA_REGISTRY: ServiceToken<MetadataRegistryContract> =
  createServiceToken("platform.metadata.registry");

export const DOCUMENT_SERVICE: ServiceToken<DocumentServiceContract> =
  createServiceToken("platform.documents.service");

export const FEATURE_FLAG_SERVICE: ServiceToken<FeatureFlagService> =
  createServiceToken("platform.features.service");

export const APPROVAL_SERVICE: ServiceToken<ApprovalService> =
  createServiceToken("platform.workflow.approvals");

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
  eventSubscriberError?: (error: unknown, eventType: string) => void;
  searchAdapter?: SearchApplicationAdapter;
  metadataProvider?: MetadataProvider;
  /** Override the canonical schema registry (tests or a future composition root). */
  metadataRegistry?: MetadataRegistryContract;
  customerTimelineProjector?: CustomerTimelineProjectorContract;
  lowStockAlertCoordinator?: LowStockAlertCoordinatorContract;
  documentStore?: DocumentStore;
  procurementApprovalNotifier?: ProcurementApprovalNotifierContract;
  /** Override the feature-flag store/audit (tests). Defaults to Postgres + audit_logs. */
  featureFlagStore?: FeatureFlagStore;
  featureFlagAuditRecorder?: FeatureFlagAuditRecorder;
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

  const featureFlagService = new FeatureFlagService(
    options.featureFlagStore ?? postgresFeatureFlagStore,
    options.featureFlagAuditRecorder ?? recordFeatureFlagAudit,
  );
  kernel.container.registerValue(FEATURE_FLAG_SERVICE, featureFlagService);

  kernel.container.registerFactory(APPROVAL_SERVICE, () => new ApprovalService());

  kernel.container.registerFactory(NOTIFICATION_SERVICE, () => {
    const persist = options.notificationWriter ?? persistNotification;
    const recordAudit: NotificationAuditRecorder = options.notificationAuditRecorder
      ?? (async (request, delivery) => {
        const action = delivery.status === "failed"
          ? "notification.failed"
          : delivery.transmitted ? "notification.sent" : "notification.accepted";
        const metadata = {
          channel: request.channel,
          template: request.template,
          status: delivery.status ?? "accepted",
          transmitted: delivery.transmitted ?? false,
          deduplicated: delivery.deduplicated ?? false,
          correlationId: request.correlationId ?? request.id,
        };
        if (request.tenantId === PLATFORM_NOTIFICATION_SCOPE) {
          await db.insert(schema.platformAuditLogs).values({
            userId: request.actorUserId,
            action: `platform_${action}`,
            metadata: { ...metadata, messageId: delivery.requestId },
          });
          return;
        }
        await kernel.container.get(AUDIT_SERVICE).record({
          tenantId: request.tenantId,
          actorUserId: request.actorUserId,
          action,
          entityType: "notification",
          entityId: delivery.requestId,
          metadata,
        });
      });
    return new NotificationService({
      EMAIL: emailGateway(options.emailTransport ?? createConfiguredEmailTransport(), persist),
      IN_APP: inAppGateway(persist),
      SMS: noopGateway("SMS", persist),
      WHATSAPP: noopGateway("WHATSAPP", persist),
    }, options.notificationDedupeLookup ?? findNotificationDuplicate, recordAudit);
  });

  kernel.container.registerFactory(EVENT_BUS, () => new InMemoryEventBus((error, event) => {
    if (options.eventSubscriberError) {
      options.eventSubscriberError(error, event.type);
      return;
    }
    logEvent("event.subscriber_failed", {
      eventType: event.type,
      errorType: error instanceof Error ? error.name : "UnknownError",
    }, "error", applicationLogger);
  }));

  kernel.container.registerValue(
    METADATA_REGISTRY,
    options.metadataRegistry ?? new MetadataRegistry(),
  );

  const metadataService = new MetadataService(options.metadataProvider ?? new CanonicalMetadataProvider());
  kernel.container.registerValue(METADATA_SERVICE, metadataService);

  kernel.container.registerFactory(DOCUMENT_SERVICE, () =>
    new DocumentService(options.documentStore ?? new PostgresDocumentStore()),
  );

  const searchAdapter = options.searchAdapter ?? new PostgresSearchProvider(metadataService, featureFlagService);
  kernel.container.registerValue(SEARCH_SERVICE, new SearchService(searchAdapter));
  subscribeSearchIndex(kernel.container.get(EVENT_BUS), searchAdapter);
  subscribeCustomerTimeline(kernel.container.get(EVENT_BUS), options.customerTimelineProjector ?? new CustomerTimelineProjector());
  subscribeLowStockAlerts(
    kernel.container.get(EVENT_BUS),
    options.lowStockAlertCoordinator ?? new LowStockAlertCoordinator(kernel.container.get(NOTIFICATION_SERVICE)),
  );
  subscribeProcurementApprovalNotifications(
    kernel.container.get(EVENT_BUS),
    options.procurementApprovalNotifier ?? new ProcurementApprovalNotifier(kernel.container.get(NOTIFICATION_SERVICE)),
  );
  // PW-003: opt-in task automation (no rule row = disabled; never financial).
  subscribeTaskAutomation(kernel.container.get(EVENT_BUS));

  return kernel;
}

let defaultKernel: PlatformKernel | null = null;

/** Lazily constructed process-wide kernel bound to the application database. */
export function platformKernel(): PlatformKernel {
  if (!defaultKernel) defaultKernel = buildPlatformKernel();
  return defaultKernel;
}
