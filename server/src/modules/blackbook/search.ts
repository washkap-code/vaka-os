import { and, asc, desc, eq, or, sql, type SQLWrapper } from "drizzle-orm";
import { db, schema } from "../../lib.js";

export const STRUCTURED_BLACKBOOK_SEARCH_TYPES = [
  "government_organisation",
  "government_service",
] as const;

export type StructuredBlackBookSearchType = typeof STRUCTURED_BLACKBOOK_SEARCH_TYPES[number];

export type StructuredBlackBookSearchDocument =
  | {
    id: string;
    entityType: "government_organisation";
    name: string;
    acronym: string | null;
    orgType: string;
    country: string;
    review_due: boolean;
  }
  | {
    id: string;
    entityType: "government_service";
    name: string;
    category: string;
    organisationId: string;
    organisationName: string;
    country: string;
    review_due: boolean;
  };

export interface StructuredBlackBookSearchHit {
  id: string;
  entityType: StructuredBlackBookSearchType;
  title: string;
  document: StructuredBlackBookSearchDocument;
  score: number;
  object: {
    key: string;
    version: string;
    labelKey: string;
    fallbackLabel: string;
    navigation: { section: string; recordView: string };
  };
}

function reviewDueSql(verifiedAt: SQLWrapper) {
  return sql<boolean>`${verifiedAt} IS NULL OR ${verifiedAt} < (CURRENT_DATE - INTERVAL '1 year')::date`;
}

export async function searchStructuredBlackBook(input: {
  types: readonly StructuredBlackBookSearchType[];
  country: string;
  normalizedQuery: string;
  terms: readonly string[];
  limit: number;
}): Promise<StructuredBlackBookSearchHit[]> {
  const hits: StructuredBlackBookSearchHit[] = [];
  if (input.types.includes("government_organisation")) {
    const score = sql<number>`CASE
      WHEN lower(${schema.govOrganisations.name}) = ${input.normalizedQuery} THEN 100
      WHEN lower(coalesce(${schema.govOrganisations.acronym}, '')) = ${input.normalizedQuery} THEN 95
      WHEN position(${input.normalizedQuery} in lower(${schema.govOrganisations.name})) = 1 THEN 80
      WHEN position(${input.normalizedQuery} in lower(${schema.govOrganisations.name})) > 0 THEN 60
      ELSE 40 END`;
    const rows = await db.select({
      id: schema.govOrganisations.id,
      name: schema.govOrganisations.name,
      acronym: schema.govOrganisations.acronym,
      orgType: schema.govOrganisations.orgType,
      country: schema.govOrganisations.country,
      reviewDue: reviewDueSql(schema.govOrganisations.verifiedAt),
      score,
    }).from(schema.govOrganisations).where(and(
      eq(schema.govOrganisations.country, input.country),
      eq(schema.govOrganisations.status, "active"),
      ...input.terms.map((term) => or(
        sql<boolean>`position(${term} in lower(${schema.govOrganisations.name})) > 0`,
        sql<boolean>`position(${term} in lower(coalesce(${schema.govOrganisations.acronym}, ''))) > 0`,
        sql<boolean>`position(${term} in lower(coalesce(${schema.govOrganisations.description}, ''))) > 0`,
      )!),
    )).orderBy(desc(score), asc(schema.govOrganisations.name), asc(schema.govOrganisations.id))
      .limit(input.limit);
    hits.push(...rows.map((row) => ({
      id: row.id,
      entityType: "government_organisation" as const,
      title: row.name,
      document: {
        id: row.id,
        entityType: "government_organisation" as const,
        name: row.name,
        acronym: row.acronym,
        orgType: row.orgType,
        country: row.country,
        review_due: row.reviewDue,
      },
      score: row.score,
      object: {
        key: "governmentOrganisation",
        version: "1",
        labelKey: "metadata.objects.governmentOrganisation.label",
        fallbackLabel: "Government organisation",
        navigation: { section: "blackbook", recordView: "organisation" },
      },
    })));
  }

  if (input.types.includes("government_service")) {
    const score = sql<number>`CASE
      WHEN lower(${schema.govServices.name}) = ${input.normalizedQuery} THEN 100
      WHEN position(${input.normalizedQuery} in lower(${schema.govServices.name})) = 1 THEN 80
      WHEN position(${input.normalizedQuery} in lower(${schema.govServices.name})) > 0 THEN 60
      ELSE 40 END`;
    const rows = await db.select({
      id: schema.govServices.id,
      name: schema.govServices.name,
      category: schema.govServices.category,
      organisationId: schema.govOrganisations.id,
      organisationName: schema.govOrganisations.name,
      country: schema.govOrganisations.country,
      reviewDue: reviewDueSql(schema.govServices.verifiedAt),
      score,
    }).from(schema.govServices).innerJoin(
      schema.govOrganisations,
      eq(schema.govOrganisations.id, schema.govServices.orgId),
    ).where(and(
      eq(schema.govOrganisations.country, input.country),
      eq(schema.govOrganisations.status, "active"),
      ...input.terms.map((term) => or(
        sql<boolean>`position(${term} in lower(${schema.govServices.name})) > 0`,
        sql<boolean>`position(${term} in lower(coalesce(${schema.govServices.description}, ''))) > 0`,
        sql<boolean>`position(${term} in lower(${schema.govServices.category})) > 0`,
        sql<boolean>`position(${term} in lower(${schema.govOrganisations.name})) > 0`,
      )!),
    )).orderBy(desc(score), asc(schema.govServices.name), asc(schema.govServices.id))
      .limit(input.limit);
    hits.push(...rows.map((row) => ({
      id: row.id,
      entityType: "government_service" as const,
      title: row.name,
      document: {
        id: row.id,
        entityType: "government_service" as const,
        name: row.name,
        category: row.category,
        organisationId: row.organisationId,
        organisationName: row.organisationName,
        country: row.country,
        review_due: row.reviewDue,
      },
      score: row.score,
      object: {
        key: "governmentService",
        version: "1",
        labelKey: "metadata.objects.governmentService.label",
        fallbackLabel: "Government service",
        navigation: { section: "blackbook", recordView: "service" },
      },
    })));
  }
  return hits;
}
