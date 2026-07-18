import { randomUUID } from "node:crypto";
import { badRequest, conflict, notFound } from "../../lib.js";
import type { AuditServiceContract } from "../../platform/audit/interfaces.js";
import type { EventBusContract } from "../../platform/events/interfaces.js";
import type { MetadataRegistryContract } from "../../platform/metadata/interfaces.js";
import { SearchService } from "../../platform/search/service.js";
import type { WorkflowEngineContract } from "../../platform/workflow/interfaces.js";
import type { WorkflowProcessDefinition } from "../../platform/workflow/types.js";
import { NetworkDirectorySearchProvider, PostgresNetworkStore, type OwnProfileRecord } from "./store.js";
import type {
  BusinessProfileInput, DirectoryFilters, DirectoryProfile, NetworkRequestContext,
  PublicProfileSnapshot,
} from "./types.js";

export const BUSINESS_PROFILE_REVIEW_WORKFLOW: WorkflowProcessDefinition = {
  name: "business-profile.publish.review",
  version: 1,
  objectType: "BusinessProfile",
  active: true,
  steps: [{
    name: "review-public-profile",
    approver: { type: "role", role: "Owner", permission: "settings.manage" },
  }],
};

export interface NetworkServiceDependencies {
  store: PostgresNetworkStore;
  metadata: MetadataRegistryContract;
  workflow: WorkflowEngineContract;
  audit: AuditServiceContract;
  events: EventBusContract;
  autoApprove: boolean;
  now?: () => Date;
}

function slugify(value: string): string {
  return value.normalize("NFKD").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: unknown; cause?: unknown };
  return candidate.code === "23505" || isUniqueViolation(candidate.cause);
}

function publicSnapshot(record: OwnProfileRecord): PublicProfileSnapshot {
  const profile = record.profile;
  if (!profile || !profile.description || !profile.industryPrimary) {
    throw badRequest("Business profile is incomplete");
  }
  const exposeContact = profile.showContact;
  return {
    slug: profile.slug,
    name: profile.name,
    displayName: profile.name,
    tagline: profile.tagline,
    description: profile.description,
    industryPrimary: profile.industryPrimary,
    industrySecondary: profile.industrySecondaryJson,
    categories: [profile.industryPrimary, ...profile.industrySecondaryJson],
    country: profile.country,
    countryCode: profile.country,
    region: profile.region,
    city: profile.city,
    address: profile.addressJson,
    ...(exposeContact ? {
      phone: profile.phone,
      contactPhone: profile.phone,
      emailPublic: profile.emailPublic,
      contactEmail: profile.emailPublic,
    } : {}),
    website: profile.website,
    logoDocumentId: profile.logoDocumentId,
    coverDocumentId: profile.coverDocumentId,
    foundedYear: profile.foundedYear,
    employeeBand: profile.employeeBand,
    capabilities: record.capabilities,
    acceptEnquiries: profile.acceptEnquiries,
  };
}

function ownResponse(record: OwnProfileRecord) {
  const profile = record.profile;
  if (!profile) {
    return {
      exists: false,
      status: "draft" as const,
      publishedAt: null,
      staleSincePublish: false,
      company: record.company,
      profile: null,
      capabilities: [],
      draft: {
        displayName: record.company.legalName,
        tagline: null,
        description: null,
        categories: [],
        city: null,
        countryCode: record.company.country,
        website: null,
        contactEmail: null,
        contactPhone: null,
        showContact: false,
        acceptEnquiries: false,
      },
      publishedSnapshot: null,
    };
  }
  return {
    exists: true,
    status: profile.status,
    publishedAt: profile.publishedAt,
    staleSincePublish: profile.status === "published"
      && profile.publishedAt !== null && profile.updatedAt > profile.publishedAt,
    company: record.company,
    profile: {
      id: profile.id,
      companyId: profile.companyId,
      slug: profile.slug,
      name: profile.name,
      tagline: profile.tagline,
      description: profile.description,
      industryPrimary: profile.industryPrimary,
      industrySecondary: profile.industrySecondaryJson,
      country: profile.country,
      region: profile.region,
      city: profile.city,
      address: profile.addressJson,
      phone: profile.phone,
      emailPublic: profile.emailPublic,
      website: profile.website,
      logoDocumentId: profile.logoDocumentId,
      coverDocumentId: profile.coverDocumentId,
      foundedYear: profile.foundedYear,
      employeeBand: profile.employeeBand,
      visibility: profile.visibility,
      acceptEnquiries: profile.acceptEnquiries,
    },
    capabilities: record.capabilities,
    draft: {
      displayName: profile.name,
      tagline: profile.tagline,
      description: profile.description,
      categories: [profile.industryPrimary, ...profile.industrySecondaryJson].filter(Boolean),
      city: profile.city,
      countryCode: profile.country,
      website: profile.website,
      contactEmail: profile.emailPublic,
      contactPhone: profile.phone,
      showContact: profile.showContact,
      acceptEnquiries: profile.acceptEnquiries,
    },
    publishedSnapshot: profile.publishedSnapshot,
  };
}

export class NetworkService {
  private readonly now: () => Date;

  constructor(private readonly dependencies: NetworkServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async getOwnProfile(tenantId: string) {
    try {
      return ownResponse(await this.dependencies.store.getOwn(tenantId));
    } catch (error) {
      if (error instanceof Error && error.message === "Company not found") throw notFound("Company not found");
      throw error;
    }
  }

  async saveOwnProfile(context: NetworkRequestContext, input: BusinessProfileInput) {
    const current = await this.dependencies.store.getOwn(context.tenantId);
    if (current.profile?.status === "pending_review") {
      throw conflict("A profile pending review cannot be edited");
    }
    if (current.profile?.status === "suspended") {
      throw conflict("A suspended profile cannot be edited");
    }
    const candidate = input.slug ?? current.profile?.slug ?? slugify(current.company.subdomain);
    const slug = candidate.length >= 3 ? candidate : `business-${context.tenantId.slice(0, 8)}`;
    let profile;
    try {
      profile = await this.dependencies.store.save(context.tenantId, context.actorUserId, input, slug);
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("Business profile slug or company profile already exists");
      throw error;
    }
    await this.dependencies.audit.record({
      tenantId: context.tenantId,
      actorUserId: context.actorUserId,
      action: current.profile ? "business_profile.updated" : "business_profile.created",
      entityType: "business_profile",
      entityId: profile.id,
      metadata: { slug: profile.slug, status: profile.status },
    });
    return ownResponse(await this.dependencies.store.getOwn(context.tenantId));
  }

  async publishOwnProfile(context: NetworkRequestContext) {
    const current = await this.dependencies.store.getOwn(context.tenantId);
    const profile = current.profile;
    if (!profile) throw badRequest("Save your business profile before publishing it");
    if (profile.status === "pending_review") throw conflict("Business profile is already pending review");
    if (profile.status === "suspended") throw conflict("A suspended business profile cannot be published");
    const validation = this.dependencies.metadata.validate("BusinessProfile", {
      companyId: profile.companyId,
      slug: profile.slug,
      name: profile.name,
      description: profile.description,
      industryPrimary: profile.industryPrimary,
      country: profile.country,
      phone: profile.showContact ? profile.phone : null,
      emailPublic: profile.showContact ? profile.emailPublic : null,
      website: profile.website,
    });
    if (!validation.valid) {
      throw badRequest(validation.errors.map((error) => error.message).join("; "));
    }

    await this.dependencies.store.markPending(context.tenantId, profile.id);
    await this.dependencies.audit.record({
      tenantId: context.tenantId,
      actorUserId: context.actorUserId,
      action: "business_profile.submitted",
      entityType: "business_profile",
      entityId: profile.id,
      metadata: { status: "pending_review" },
    });
    const workflow = await this.dependencies.workflow.start(
      BUSINESS_PROFILE_REVIEW_WORKFLOW,
      { objectType: "BusinessProfile", objectId: profile.id },
      context,
    );
    if (!this.dependencies.autoApprove) {
      return ownResponse(await this.dependencies.store.getOwn(context.tenantId));
    }
    const completed = await this.dependencies.workflow.approve(
      workflow.id,
      context,
      "Automatically approved by configured moderation policy",
    );
    if (completed.status !== "COMPLETED") throw conflict("Business profile review did not complete");

    const pending = await this.dependencies.store.getOwn(context.tenantId);
    const snapshot = publicSnapshot(pending);
    const publishedAt = this.now();
    const published = await this.dependencies.store.markPublished(
      context.tenantId,
      profile.id,
      context.actorUserId,
      snapshot,
      publishedAt,
    );
    await this.dependencies.audit.record({
      tenantId: context.tenantId,
      actorUserId: context.actorUserId,
      action: "business_profile.published",
      entityType: "business_profile",
      entityId: profile.id,
      metadata: { slug: published.slug, workflowInstanceId: workflow.id },
    });
    await this.dependencies.events.publish({
      id: `profile.published:${workflow.id}`,
      type: "profile.published",
      tenantId: context.tenantId,
      actorUserId: context.actorUserId,
      occurredAt: publishedAt,
      payload: { profileId: profile.id, companyId: profile.companyId, slug: profile.slug },
    });
    return ownResponse(await this.dependencies.store.getOwn(context.tenantId));
  }

  async unpublishOwnProfile(context: NetworkRequestContext) {
    const current = await this.dependencies.store.getOwn(context.tenantId);
    if (!current.profile) throw notFound("Business profile not found");
    try {
      await this.dependencies.store.unpublish(context.tenantId, current.profile.id);
    } catch (error) {
      if (error instanceof Error && error.message === "Profile is not published") {
        throw conflict("Business profile is not published");
      }
      throw error;
    }
    await this.dependencies.audit.record({
      tenantId: context.tenantId,
      actorUserId: context.actorUserId,
      action: "business_profile.unpublished",
      entityType: "business_profile",
      entityId: current.profile.id,
      metadata: { slug: current.profile.slug },
    });
    return ownResponse(await this.dependencies.store.getOwn(context.tenantId));
  }

  async searchDirectory(filters: DirectoryFilters, viewer: { tenantId: string; actorUserId: string }) {
    const search = new SearchService(new NetworkDirectorySearchProvider(filters));
    const response = await search.search<DirectoryProfile>({
      text: filters.q ?? "*",
      limit: filters.pageSize,
    }, {
      tenantId: viewer.tenantId,
      actorUserId: viewer.actorUserId,
    });
    return response.results.map((result) => result.document);
  }

  async getDirectoryProfileBySlug(
    slug: string,
    viewer: { tenantId: string; actorUserId: string },
  ): Promise<DirectoryProfile> {
    const profile = await this.dependencies.store.getPublicBySlug(slug);
    if (!profile) throw notFound("Business profile not found");
    await this.recordProfileView(profile, viewer);
    return profile;
  }

  async getDirectoryProfileById(
    id: string,
    viewer: { tenantId: string; actorUserId: string },
  ): Promise<DirectoryProfile> {
    const profile = await this.dependencies.store.getPublicById(id);
    if (!profile) throw notFound("Business profile not found");
    await this.recordProfileView(profile, viewer);
    return profile;
  }

  private async recordProfileView(
    profile: DirectoryProfile,
    viewer: { tenantId: string; actorUserId: string },
  ): Promise<void> {
    const view = await this.dependencies.store.recordView(profile.id, viewer.tenantId);
    await this.dependencies.audit.record({
      tenantId: viewer.tenantId,
      actorUserId: viewer.actorUserId,
      action: "business_profile.viewed",
      entityType: "business_profile",
      entityId: profile.id,
      occurredAt: view.viewedAt,
      metadata: { viewId: view.id, slug: profile.slug },
    });
    await this.dependencies.events.publish({
      id: `profile.viewed:${view.id || randomUUID()}`,
      type: "profile.viewed",
      tenantId: viewer.tenantId,
      actorUserId: viewer.actorUserId,
      occurredAt: view.viewedAt,
      payload: { profileId: profile.id, viewerTenantId: viewer.tenantId },
    });
  }
}
