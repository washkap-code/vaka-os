import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "../../lib.js";
import type { SearchProvider } from "../../platform/search/interfaces.js";
import type { SearchQuery, SearchResponse, SearchResult, SearchScope } from "../../platform/search/types.js";
import type {
  BusinessProfileInput, DirectoryFilters, DirectoryProfile, ProfileCapabilityInput,
  PublicProfileSnapshot,
} from "./types.js";

type ProfileRow = typeof schema.businessProfiles.$inferSelect;

export interface OwnProfileRecord {
  profile: ProfileRow | null;
  capabilities: ProfileCapabilityInput[];
  company: {
    legalName: string;
    registrationNumber: string | null;
    country: string;
    verificationStatus: "verified" | "unverified";
  };
}

interface PublicProjectionRow {
  id: string;
  snapshot: unknown;
  publishedAt: Date | null;
  legalName: string;
  registrationNumber: string | null;
  verified: boolean;
  score?: number;
}

function publicDocument(row: PublicProjectionRow): DirectoryProfile {
  if (!row.publishedAt || !row.snapshot || typeof row.snapshot !== "object" || Array.isArray(row.snapshot)) {
    throw new Error("Published profile projection is invalid");
  }
  return {
    id: row.id,
    ...(row.snapshot as PublicProfileSnapshot),
    publishedAt: row.publishedAt,
    legalName: row.legalName,
    registrationNumber: row.registrationNumber,
    verificationStatus: row.verified ? "verified" : "unverified",
  };
}

export class PostgresNetworkStore {
  async getOwn(tenantId: string): Promise<OwnProfileRecord> {
    const [company] = await db.select({
      legalName: schema.tenants.companyName,
      registrationNumber: schema.tenants.registrationNumber,
      country: schema.tenants.countryCode,
      verified: sql<boolean>`EXISTS (
        SELECT 1 FROM "verification_badges" badge
        WHERE badge."tenant_id" = ${schema.tenants.id}
          AND badge."expires_at" > current_date
      )`,
    }).from(schema.tenants).where(eq(schema.tenants.id, tenantId));
    if (!company) throw new Error("Company not found");
    const [profile] = await db.select().from(schema.businessProfiles).where(and(
      eq(schema.businessProfiles.tenantId, tenantId),
      eq(schema.businessProfiles.companyId, tenantId),
    ));
    const capabilities = profile
      ? await db.select({ category: schema.profileCapabilities.category, name: schema.profileCapabilities.name })
          .from(schema.profileCapabilities)
          .where(eq(schema.profileCapabilities.profileId, profile.id))
          .orderBy(asc(schema.profileCapabilities.category), asc(schema.profileCapabilities.name))
      : [];
    return {
      profile: profile ?? null,
      capabilities,
      company: {
        legalName: company.legalName,
        registrationNumber: company.registrationNumber,
        country: company.country,
        verificationStatus: company.verified ? "verified" : "unverified",
      },
    };
  }

  async save(tenantId: string, userId: string, input: BusinessProfileInput, slug: string): Promise<ProfileRow> {
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(schema.businessProfiles).where(and(
        eq(schema.businessProfiles.tenantId, tenantId),
        eq(schema.businessProfiles.companyId, tenantId),
      )).for("update");
      const categories = [input.industryPrimary, ...input.industrySecondary].filter(
        (value): value is string => Boolean(value),
      );
      const values = {
        companyId: tenantId,
        slug,
        name: input.name,
        displayName: input.name,
        tagline: input.tagline,
        description: input.description,
        industryPrimary: input.industryPrimary,
        industrySecondaryJson: input.industrySecondary,
        categories,
        country: input.country,
        countryCode: input.country,
        region: input.region,
        city: input.city,
        addressJson: input.address,
        phone: input.phone,
        contactPhone: input.phone,
        emailPublic: input.emailPublic,
        contactEmail: input.emailPublic,
        website: input.website,
        logoDocumentId: input.logoDocumentId,
        coverDocumentId: input.coverDocumentId,
        foundedYear: input.foundedYear,
        employeeBand: input.employeeBand,
        visibility: input.visibility,
        showContact: input.showContact,
        acceptEnquiries: input.acceptEnquiries,
        updatedAt: new Date(),
      };
      const [profile] = existing
        ? await tx.update(schema.businessProfiles).set(values)
            .where(eq(schema.businessProfiles.id, existing.id)).returning()
        : await tx.insert(schema.businessProfiles).values({
            ...values,
            tenantId,
            createdBy: userId,
          }).returning();
      if (existing) {
        await tx.delete(schema.profileCapabilities)
          .where(eq(schema.profileCapabilities.profileId, existing.id));
      }
      if (input.capabilities.length) {
        await tx.insert(schema.profileCapabilities).values(input.capabilities.map((capability) => ({
          profileId: profile.id,
          category: capability.category,
          name: capability.name,
        })));
      }
      return profile;
    });
  }

  async markPending(tenantId: string, profileId: string): Promise<ProfileRow> {
    const [profile] = await db.update(schema.businessProfiles).set({
      status: "pending_review",
      publishedSnapshot: null,
      publishedAt: null,
      publishedBy: null,
      updatedAt: new Date(),
    }).where(and(
      eq(schema.businessProfiles.id, profileId),
      eq(schema.businessProfiles.tenantId, tenantId),
    )).returning();
    if (!profile) throw new Error("Profile not found");
    return profile;
  }

  async markPublished(
    tenantId: string,
    profileId: string,
    userId: string,
    snapshot: PublicProfileSnapshot,
    publishedAt: Date,
  ): Promise<ProfileRow> {
    const [profile] = await db.update(schema.businessProfiles).set({
      status: "published",
      publishedSnapshot: snapshot,
      publishedAt,
      publishedBy: userId,
      updatedAt: publishedAt,
    }).where(and(
      eq(schema.businessProfiles.id, profileId),
      eq(schema.businessProfiles.tenantId, tenantId),
      eq(schema.businessProfiles.status, "pending_review"),
    )).returning();
    if (!profile) throw new Error("Profile is not pending review");
    return profile;
  }

  async unpublish(tenantId: string, profileId: string): Promise<ProfileRow> {
    const [profile] = await db.update(schema.businessProfiles).set({
      status: "draft",
      publishedSnapshot: null,
      publishedAt: null,
      publishedBy: null,
      updatedAt: new Date(),
    }).where(and(
      eq(schema.businessProfiles.id, profileId),
      eq(schema.businessProfiles.tenantId, tenantId),
      eq(schema.businessProfiles.status, "published"),
    )).returning();
    if (!profile) throw new Error("Profile is not published");
    return profile;
  }

  async getPublicBySlug(slug: string): Promise<DirectoryProfile | null> {
    const p = schema.businessProfiles;
    const [row] = await db.select({
      id: p.id,
      snapshot: p.publishedSnapshot,
      publishedAt: p.publishedAt,
      legalName: schema.tenants.companyName,
      registrationNumber: schema.tenants.registrationNumber,
      verified: sql<boolean>`EXISTS (
        SELECT 1 FROM "verification_badges" badge
        WHERE badge."tenant_id" = ${schema.tenants.id}
          AND badge."expires_at" > current_date
      )`,
    }).from(p).innerJoin(schema.tenants, eq(schema.tenants.id, p.companyId)).where(and(
      eq(p.status, "published"),
      eq(p.visibility, "public"),
      isNotNull(p.publishedSnapshot),
      sql`${p.publishedSnapshot}->>'slug' = ${slug}`,
    ));
    return row ? publicDocument(row) : null;
  }

  async getPublicById(id: string): Promise<DirectoryProfile | null> {
    const p = schema.businessProfiles;
    const [row] = await db.select({
      id: p.id,
      snapshot: p.publishedSnapshot,
      publishedAt: p.publishedAt,
      legalName: schema.tenants.companyName,
      registrationNumber: schema.tenants.registrationNumber,
      verified: sql<boolean>`EXISTS (
        SELECT 1 FROM "verification_badges" badge
        WHERE badge."tenant_id" = ${schema.tenants.id}
          AND badge."expires_at" > current_date
      )`,
    }).from(p).innerJoin(schema.tenants, eq(schema.tenants.id, p.companyId)).where(and(
      eq(p.id, id),
      eq(p.status, "published"),
      eq(p.visibility, "public"),
      isNotNull(p.publishedSnapshot),
    ));
    return row ? publicDocument(row) : null;
  }

  async recordView(profileId: string, viewerTenantId: string | null): Promise<{ id: string; viewedAt: Date }> {
    const [view] = await db.insert(schema.profileViews).values({ profileId, viewerTenantId }).returning({
      id: schema.profileViews.id,
      viewedAt: schema.profileViews.viewedAt,
    });
    return view;
  }
}

/**
 * Dedicated cross-tenant provider. Its projection contains only the frozen
 * public snapshot and three explicitly permitted live Company facts. No draft
 * column or tenant id is selected, so callers cannot widen the data boundary.
 */
export class NetworkDirectorySearchProvider implements SearchProvider {
  constructor(private readonly filters: DirectoryFilters) {}

  async search<TDocument>(query: SearchQuery, _scope: SearchScope): Promise<SearchResponse<TDocument>> {
    const p = schema.businessProfiles;
    const conditions = [
      eq(p.status, "published"),
      eq(p.visibility, "public"),
      isNotNull(p.publishedSnapshot),
    ];
    if (this.filters.industry) {
      conditions.push(sql`lower(${p.publishedSnapshot}->>'industryPrimary') = lower(${this.filters.industry})`);
    }
    if (this.filters.country) {
      conditions.push(sql`${p.publishedSnapshot}->>'country' = ${this.filters.country}`);
    }
    if (this.filters.region) {
      conditions.push(sql`(
        lower(coalesce(${p.publishedSnapshot}->>'region', '')) = lower(${this.filters.region})
        OR lower(coalesce(${p.publishedSnapshot}->>'city', '')) = lower(${this.filters.region})
      )`);
    }
    const searchVector = sql`to_tsvector('simple', concat_ws(' ',
      ${p.publishedSnapshot}->>'name',
      ${p.publishedSnapshot}->>'tagline',
      ${p.publishedSnapshot}->>'description',
      ${p.publishedSnapshot}->'capabilities'
    ))`;
    const searchQuery = sql`websearch_to_tsquery('simple', ${query.text})`;
    if (query.text !== "*") conditions.push(sql`${searchVector} @@ ${searchQuery}`);

    const rows = await db.select({
      id: p.id,
      snapshot: p.publishedSnapshot,
      publishedAt: p.publishedAt,
      legalName: schema.tenants.companyName,
      registrationNumber: schema.tenants.registrationNumber,
      verified: sql<boolean>`EXISTS (
        SELECT 1 FROM "verification_badges" badge
        WHERE badge."tenant_id" = ${schema.tenants.id}
          AND badge."expires_at" > current_date
      )`,
      score: query.text === "*" ? sql<number>`1` : sql<number>`ts_rank(${searchVector}, ${searchQuery})`,
    }).from(p).innerJoin(schema.tenants, eq(schema.tenants.id, p.companyId))
      .where(and(...conditions))
      .orderBy(query.text === "*" ? sql`${p.publishedSnapshot}->>'name'` : sql`ts_rank(${searchVector}, ${searchQuery}) DESC`, p.id)
      .limit(query.limit ?? this.filters.pageSize)
      .offset((this.filters.page - 1) * this.filters.pageSize);

    const results: SearchResult<DirectoryProfile>[] = rows.map((row) => {
      const document = publicDocument(row);
      return {
        id: row.id,
        entityType: "business-profile",
        title: document.name,
        document,
        score: row.score,
      };
    });
    return { results } as unknown as SearchResponse<TDocument>;
  }
}
