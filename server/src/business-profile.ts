// ============================================================================
// PN-001 — Opt-in public business profile (Business Network, Wave 1).
//
// The profile is derived from the canonical Company (the tenant) — it never
// duplicates statutory tenant data, it presents an owner-curated public face.
// Privacy model, in order of precedence:
//   1. Nothing is public by default: no row → nothing to show anywhere.
//   2. Editing never leaks: drafts and edits stay private until the tenant
//      OWNER explicitly publishes.
//   3. Publishing freezes an explicit snapshot (only the fields the owner
//      chose, contact details only when showContact is true). The directory
//      (PN-002) reads ONLY snapshots — never live rows, never tenant records.
//   4. Unpublishing removes the snapshot immediately.
// Every publish/unpublish is audited. The whole surface ships dark behind
// the `network.directory` feature flag and fails closed.
// ============================================================================
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { audit, badRequest, conflict, db, notFound, schema } from "./lib.js";

export const BUSINESS_CATEGORIES = [
  "agriculture", "construction", "education", "energy", "finance-and-insurance",
  "healthcare", "hospitality-and-tourism", "ict-and-telecoms", "logistics-and-transport",
  "manufacturing", "mining", "ngo-and-community", "professional-services",
  "real-estate", "retail-and-wholesale", "other",
] as const;

export const profileInputSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  tagline: z.string().trim().max(140).nullish(),
  description: z.string().trim().max(2000).nullish(),
  categories: z.array(z.enum(BUSINESS_CATEGORIES)).min(1).max(3),
  city: z.string().trim().max(80).nullish(),
  countryCode: z.string().trim().regex(/^[A-Z]{2}$/).default("ZW"),
  website: z.string().trim().url().startsWith("https://").max(300).nullish(),
  contactEmail: z.string().trim().email().max(200).nullish(),
  contactPhone: z.string().trim().regex(/^\+?[0-9 ()-]{5,25}$/).nullish(),
  showContact: z.boolean().default(false),
});
export type ProfileInput = z.infer<typeof profileInputSchema>;

async function findProfile(tenantId: string) {
  const [profile] = await db.select().from(schema.businessProfiles)
    .where(eq(schema.businessProfiles.tenantId, tenantId));
  return profile ?? null;
}

/** The tenant's own management view (never a public shape). */
export async function getMyProfile(tenantId: string) {
  const profile = await findProfile(tenantId);
  if (!profile) {
    // Sensible defaults from the canonical Company; nothing is persisted and
    // nothing is public until the tenant saves and the owner publishes.
    const [tenant] = await db.select({
      companyName: schema.tenants.companyName,
      countryCode: schema.tenants.countryCode,
    }).from(schema.tenants).where(eq(schema.tenants.id, tenantId));
    if (!tenant) throw notFound("Tenant not found");
    return {
      exists: false, status: "DRAFT" as const, publishedAt: null, staleSincePublish: false,
      draft: {
        displayName: tenant.companyName, tagline: null, description: null,
        categories: [], city: null, countryCode: tenant.countryCode,
        website: null, contactEmail: null, contactPhone: null, showContact: false,
      },
      publishedSnapshot: null,
    };
  }
  return {
    exists: true, status: profile.status as "DRAFT" | "PUBLISHED" | "UNPUBLISHED",
    publishedAt: profile.publishedAt,
    staleSincePublish: profile.status === "PUBLISHED"
      && profile.publishedAt !== null && profile.updatedAt > profile.publishedAt,
    draft: {
      displayName: profile.displayName, tagline: profile.tagline,
      description: profile.description, categories: profile.categories,
      city: profile.city, countryCode: profile.countryCode, website: profile.website,
      contactEmail: profile.contactEmail, contactPhone: profile.contactPhone,
      showContact: profile.showContact,
    },
    publishedSnapshot: profile.publishedSnapshot,
  };
}

/** Save the draft. Never touches the published snapshot (no silent leaks). */
export async function saveProfile(tenantId: string, userId: string, input: ProfileInput) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.businessProfiles)
      .where(eq(schema.businessProfiles.tenantId, tenantId)).for("update");
    const values = {
      displayName: input.displayName, tagline: input.tagline ?? null,
      description: input.description ?? null, categories: input.categories,
      city: input.city ?? null, countryCode: input.countryCode,
      website: input.website ?? null, contactEmail: input.contactEmail ?? null,
      contactPhone: input.contactPhone ?? null, showContact: input.showContact,
      updatedAt: new Date(),
    };
    const row = existing
      ? (await tx.update(schema.businessProfiles).set(values)
          .where(eq(schema.businessProfiles.id, existing.id)).returning())[0]
      : (await tx.insert(schema.businessProfiles).values({
          ...values, tenantId, createdBy: userId,
        }).returning())[0];
    await audit(tx, tenantId, userId, existing ? "business_profile.updated" : "business_profile.created",
      "business_profile", row.id, { displayName: input.displayName, categories: input.categories });
    return row;
  });
}

/** What the directory is allowed to see. Contact only when opted in. */
export function buildSnapshot(profile: {
  displayName: string; tagline: string | null; description: string | null;
  categories: unknown; city: string | null; countryCode: string;
  website: string | null; contactEmail: string | null; contactPhone: string | null;
  showContact: boolean;
}) {
  return {
    displayName: profile.displayName,
    tagline: profile.tagline,
    description: profile.description,
    categories: profile.categories,
    city: profile.city,
    countryCode: profile.countryCode,
    website: profile.website,
    ...(profile.showContact
      ? { contactEmail: profile.contactEmail, contactPhone: profile.contactPhone }
      : {}),
  };
}

/** Owner-only. Freezes the snapshot that PN-002 will serve. */
export async function publishProfile(tenantId: string, userId: string) {
  return db.transaction(async (tx) => {
    const [profile] = await tx.select().from(schema.businessProfiles)
      .where(eq(schema.businessProfiles.tenantId, tenantId)).for("update");
    if (!profile) throw badRequest("Save your business profile before publishing it");
    const categories = Array.isArray(profile.categories) ? profile.categories : [];
    if (!categories.length) throw badRequest("Choose at least one business category before publishing");
    const snapshot = buildSnapshot(profile as Parameters<typeof buildSnapshot>[0]);
    const now = new Date();
    const [updated] = await tx.update(schema.businessProfiles).set({
      status: "PUBLISHED", publishedSnapshot: snapshot, publishedAt: now,
      publishedBy: userId, updatedAt: now,
    }).where(eq(schema.businessProfiles.id, profile.id)).returning();
    await audit(tx, tenantId, userId, "business_profile.published", "business_profile", profile.id, {
      displayName: profile.displayName, showContact: profile.showContact,
      categories, republish: profile.status === "PUBLISHED",
    });
    return updated;
  });
}

// ---------------------------------------------------------------------------
// PN-002 — Business directory. Reads ONLY published snapshots. The queries
// below never select draft columns for other tenants: the projection is the
// snapshot JSON plus non-sensitive envelope fields, filtered to PUBLISHED.
// Tenant identity in results is the profile id (opaque), not the tenant id.
// ---------------------------------------------------------------------------
export const directoryQuerySchema = z.object({
  category: z.enum(BUSINESS_CATEGORIES).optional(),
  city: z.string().trim().min(1).max(80).optional(),
  q: z.string().trim().min(1).max(120).optional(),
  country: z.string().trim().regex(/^[A-Z]{2}$/).default("ZW"),
});

export async function searchDirectory(query: z.infer<typeof directoryQuerySchema>) {
  const p = schema.businessProfiles;
  const conditions = [eq(p.status, "PUBLISHED"), eq(p.countryCode, query.country)];
  if (query.category) {
    conditions.push(sql`${p.publishedSnapshot}->'categories' @> ${JSON.stringify([query.category])}::jsonb`);
  }
  if (query.city) {
    conditions.push(sql`lower(${p.publishedSnapshot}->>'city') = lower(${query.city})`);
  }
  if (query.q) {
    const needle = `%${query.q.replace(/[%_\\]/g, "\\$&")}%`;
    conditions.push(sql`(
      ${p.publishedSnapshot}->>'displayName' ILIKE ${needle}
      OR coalesce(${p.publishedSnapshot}->>'tagline', '') ILIKE ${needle}
      OR coalesce(${p.publishedSnapshot}->>'description', '') ILIKE ${needle}
    )`);
  }
  const rows = await db.select({
    id: p.id,
    snapshot: p.publishedSnapshot,
    publishedAt: p.publishedAt,
  }).from(p).where(and(...conditions))
    .orderBy(sql`${p.publishedSnapshot}->>'displayName'`).limit(200);
  return rows.map((row) => ({ id: row.id, publishedAt: row.publishedAt, ...(row.snapshot as object) }));
}

export async function getDirectoryProfile(profileId: string) {
  const [row] = await db.select({
    id: schema.businessProfiles.id,
    status: schema.businessProfiles.status,
    snapshot: schema.businessProfiles.publishedSnapshot,
    publishedAt: schema.businessProfiles.publishedAt,
  }).from(schema.businessProfiles).where(eq(schema.businessProfiles.id, profileId));
  if (!row || row.status !== "PUBLISHED" || !row.snapshot) throw notFound("Business profile not found");
  return { id: row.id, publishedAt: row.publishedAt, ...(row.snapshot as object) };
}

/** Owner-only. Immediately removes the public snapshot. */
export async function unpublishProfile(tenantId: string, userId: string) {
  return db.transaction(async (tx) => {
    const [profile] = await tx.select().from(schema.businessProfiles)
      .where(eq(schema.businessProfiles.tenantId, tenantId)).for("update");
    if (!profile) throw notFound("Business profile not found");
    if (profile.status !== "PUBLISHED") throw conflict("Business profile is not published");
    const [updated] = await tx.update(schema.businessProfiles).set({
      status: "UNPUBLISHED", publishedSnapshot: null, publishedAt: null,
      publishedBy: null, updatedAt: new Date(),
    }).where(eq(schema.businessProfiles.id, profile.id)).returning();
    await audit(tx, tenantId, userId, "business_profile.unpublished", "business_profile", profile.id, {
      displayName: profile.displayName,
    });
    return updated;
  });
}
