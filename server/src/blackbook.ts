// ============================================================================
// PB-001 — Black Book registry: versioned, governed platform content.
//
// The registry holds GLOBAL reference data (government organisations,
// regulators, licences, compliance events…) imported from the human-reviewed
// seed package under knowledge-system/10-country-packs/<country>/black-book.
// It is NOT tenant data: the only write path is the platform import endpoint
// (platform.settings.manage + step-up, audited to platform_audit_logs), and
// tenant reads ship dark behind the `blackbook.directory` feature flag.
//
// The import implements the "PB-001 import validation" contract in the seed
// package's schema.md: the FULL batch is rejected when any check fails, and a
// failed import leaves the existing registry unchanged (single transaction).
// Every accepted change is versioned: entry rows carry the current payload,
// immutable blackbook_entry_versions rows carry the history, and every run is
// recorded with its dataset revision.
//
// Content displayed from this registry must always show `sources` and
// `lastReviewed` — the seed is a directory, not professional advice.
// ============================================================================
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { badRequest, db, notFound, schema } from "./lib.js";

export const BLACKBOOK_CATEGORIES = [
  "government_organisation", "regulator", "local_authority", "utility",
  "tender_portal", "business_association", "licence_type", "compliance_event", "service",
] as const;
export type BlackbookCategory = (typeof BLACKBOOK_CATEGORIES)[number];

const AUTHORITY_CATEGORIES: readonly BlackbookCategory[] = [
  "government_organisation", "regulator", "local_authority",
];
const CADENCES = ["ONCE", "MONTHLY", "QUARTERLY", "ANNUAL", "OTHER"] as const;

// Field whitelists (schema.md check 10 — no unknown field is silently accepted).
const DIRECTORY_FIELDS = new Set([
  "id", "name", "category", "parentId", "website", "phones", "emails",
  "physicalAddress", "city", "services", "verified", "sources", "lastReviewed", "notes",
]);
const LICENCE_FIELDS = new Set([
  "id", "name", "category", "issuingAuthorityId", "appliesTo", "requiredDocuments",
  "statutoryBasis", "renewalFrequency", "typicalProcessingTime", "officialFormUrl",
  "verified", "sources", "lastReviewed", "notes",
]);
const LICENCE_REQUIRED = [
  "issuingAuthorityId", "appliesTo", "requiredDocuments", "statutoryBasis",
  "renewalFrequency", "typicalProcessingTime", "officialFormUrl", "notes",
];
const EVENT_FIELDS = new Set([
  "id", "name", "category", "licenceTypeId", "authorityId", "cadence", "dueRule",
  "verified", "sources", "lastReviewed",
]);

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isHttps = (value: unknown): value is string =>
  typeof value === "string" && /^https:\/\/\S+$/.test(value);
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");
const isValidIsoDate = (value: unknown): boolean => {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

export type BlackbookRecord = Record<string, unknown> & {
  id: string; name: string; category: BlackbookCategory;
  verified: boolean; sources: string[]; lastReviewed: string;
};
export type BlackbookDataset = Partial<Record<BlackbookCategory, unknown>>;

export const importRequestSchema = z.object({
  countryCode: z.string().trim().regex(/^[A-Z]{2}$/, "countryCode must be an ISO 3166-1 alpha-2 code"),
  datasetRevision: z.string().trim().min(1).max(200),
  dataset: z.record(z.string(), z.unknown()),
});

// ---------------------------------------------------------------------------
// Validation — schema.md "PB-001 import validation" checks 1–8 and 10.
// (Check 9 — deadline substantiation — is the human content-review gate.)
// ---------------------------------------------------------------------------
export function validateDataset(dataset: BlackbookDataset): {
  errors: string[]; records: BlackbookRecord[];
} {
  const errors: string[] = [];
  const records: BlackbookRecord[] = [];

  const unknownCategories = Object.keys(dataset)
    .filter((key) => !(BLACKBOOK_CATEGORIES as readonly string[]).includes(key));
  for (const key of unknownCategories) errors.push(`Unknown dataset category "${key}"`);

  for (const category of BLACKBOOK_CATEGORIES) {
    const batch = dataset[category];
    if (batch === undefined) continue; // a revision may omit whole categories
    if (!Array.isArray(batch)) {
      errors.push(`Category "${category}" must be a JSON array`);
      continue;
    }
    for (const raw of batch) {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        errors.push(`Category "${category}" contains a non-object record`);
        continue;
      }
      records.push(raw as BlackbookRecord);
    }
  }
  if (errors.length) return { errors, records: [] };

  const byId = new Map<string, BlackbookRecord>();
  const fileCategory = new Map<string, BlackbookCategory>();
  for (const category of BLACKBOOK_CATEGORIES) {
    const batch = dataset[category];
    if (!Array.isArray(batch)) continue;
    for (const raw of batch as BlackbookRecord[]) {
      const id = raw.id;
      if (typeof id !== "string" || !ID_PATTERN.test(id)) {
        errors.push(`Record in "${category}" has a missing or non-kebab-case id (${JSON.stringify(id)})`);
        continue;
      }
      if (byId.has(id)) errors.push(`Duplicate id "${id}" — IDs must be globally unique`);
      byId.set(id, raw);
      fileCategory.set(id, category);
    }
  }

  for (const [id, record] of byId) {
    const where = `"${id}"`;
    const category = fileCategory.get(id)!;

    // Check 2 — required base fields.
    if (typeof record.name !== "string" || !record.name.trim()) errors.push(`${where}: missing name`);
    if (typeof record.verified !== "boolean") errors.push(`${where}: missing boolean verified`);
    if (!isStringArray(record.sources)) errors.push(`${where}: sources must be a string array`);
    if (!isValidIsoDate(record.lastReviewed)) errors.push(`${where}: lastReviewed must be a valid ISO calendar date`);

    // Check 3 — category matches enum and containing file.
    if (record.category !== category) {
      errors.push(`${where}: category "${String(record.category)}" does not match its file "${category}"`);
    }

    // Check 5 — verified records need at least one official HTTPS source.
    if (record.verified === true && (!isStringArray(record.sources) || !record.sources.some(isHttps))) {
      errors.push(`${where}: verified record must cite at least one HTTPS source`);
    }
    if (isStringArray(record.sources)) {
      for (const source of record.sources) {
        if (!isHttps(source)) errors.push(`${where}: source "${source}" is not an absolute HTTPS URL`);
      }
    }

    // Check 10 — unknown fields are rejected; per-contract required keys exist.
    const allowed = category === "licence_type" ? LICENCE_FIELDS
      : category === "compliance_event" ? EVENT_FIELDS : DIRECTORY_FIELDS;
    for (const key of Object.keys(record)) {
      if (!allowed.has(key)) errors.push(`${where}: unknown field "${key}" is not accepted (schema change requires review)`);
    }

    // Checks 4 (references), 7, 8 — per-category contracts.
    const resolvesTo = (refId: unknown, cats: readonly BlackbookCategory[], label: string) => {
      if (typeof refId !== "string") { errors.push(`${where}: ${label} must be a string id`); return; }
      const target = fileCategory.get(refId);
      if (!target) errors.push(`${where}: ${label} "${refId}" does not resolve`);
      else if (!cats.includes(target)) errors.push(`${where}: ${label} "${refId}" must reference one of: ${cats.join(", ")}`);
    };

    if (category === "licence_type") {
      for (const key of LICENCE_REQUIRED) {
        if (!(key in record)) errors.push(`${where}: licence record missing required field "${key}"`);
      }
      resolvesTo(record.issuingAuthorityId, AUTHORITY_CATEGORIES, "issuingAuthorityId");
      if (!Array.isArray(record.appliesTo)) errors.push(`${where}: appliesTo must be an array`);
      if (!Array.isArray(record.requiredDocuments)) errors.push(`${where}: requiredDocuments must be an array`);
      if (!(CADENCES as readonly string[]).includes(record.renewalFrequency as string)) {
        errors.push(`${where}: renewalFrequency "${String(record.renewalFrequency)}" is not in ${CADENCES.join("/")}`);
      }
    } else if (category === "compliance_event") {
      resolvesTo(record.authorityId, AUTHORITY_CATEGORIES, "authorityId");
      if (record.licenceTypeId !== undefined) resolvesTo(record.licenceTypeId, ["licence_type"], "licenceTypeId");
      if (!(CADENCES as readonly string[]).includes(record.cadence as string)) {
        errors.push(`${where}: cadence "${String(record.cadence)}" is not in ${CADENCES.join("/")}`);
      }
      if (typeof record.dueRule !== "string" || !record.dueRule.trim()) errors.push(`${where}: missing dueRule`);
    } else {
      if (record.parentId !== undefined) resolvesTo(record.parentId, BLACKBOOK_CATEGORIES, "parentId");
      if (record.services !== undefined) {
        if (!isStringArray(record.services)) errors.push(`${where}: services must be a string array`);
        else for (const serviceId of record.services) resolvesTo(serviceId, ["service"], "services entry");
      }
    }
  }

  return { errors, records: [...byId.values()] };
}

// ---------------------------------------------------------------------------
// Import — all-or-nothing; versioned; audited to platform_audit_logs.
// ---------------------------------------------------------------------------
const stableStringify = (value: unknown): string => JSON.stringify(sortKeys(value));
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.keys(value as object).sort()
      .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]));
  }
  return value;
}

export async function importDataset(opts: {
  actorUserId: string; countryCode: string; datasetRevision: string; dataset: BlackbookDataset;
}) {
  const { errors, records } = validateDataset(opts.dataset);
  if (errors.length) {
    throw badRequest(`Black Book import rejected — the registry is unchanged. ${errors.length} validation error(s): ${errors.slice(0, 20).join("; ")}${errors.length > 20 ? "; …" : ""}`);
  }
  if (!records.length) throw badRequest("Black Book import rejected — the dataset contains no records");

  return db.transaction(async (tx) => {
    const existing = await tx.select().from(schema.blackbookEntries)
      .where(eq(schema.blackbookEntries.countryCode, opts.countryCode));
    const existingByKey = new Map(existing.map((entry) => [entry.entryKey, entry]));

    let created = 0, updated = 0, unchanged = 0;
    const [run] = await tx.insert(schema.blackbookImportRuns).values({
      countryCode: opts.countryCode, datasetRevision: opts.datasetRevision,
      importedBy: opts.actorUserId, recordCount: records.length,
      createdCount: 0, updatedCount: 0, unchangedCount: 0,
    }).returning();

    for (const record of records) {
      const current = existingByKey.get(record.id);
      const payloadJson = stableStringify(record);
      if (current && stableStringify(current.payload) === payloadJson) { unchanged += 1; continue; }

      if (!current) {
        const [entry] = await tx.insert(schema.blackbookEntries).values({
          countryCode: opts.countryCode, entryKey: record.id, category: record.category,
          name: record.name, payload: record, verified: record.verified,
          sources: record.sources, lastReviewed: record.lastReviewed,
        }).returning();
        await tx.insert(schema.blackbookEntryVersions).values({
          entryId: entry.id, version: 1, payload: record, verified: record.verified,
          sources: record.sources, lastReviewed: record.lastReviewed, importRunId: run.id,
        });
        created += 1;
      } else {
        const nextVersion = current.currentVersion + 1;
        await tx.update(schema.blackbookEntries).set({
          category: record.category, name: record.name, payload: record,
          verified: record.verified, sources: record.sources,
          lastReviewed: record.lastReviewed, currentVersion: nextVersion,
          status: "ACTIVE", updatedAt: new Date(),
        }).where(eq(schema.blackbookEntries.id, current.id));
        await tx.insert(schema.blackbookEntryVersions).values({
          entryId: current.id, version: nextVersion, payload: record, verified: record.verified,
          sources: record.sources, lastReviewed: record.lastReviewed, importRunId: run.id,
        });
        updated += 1;
      }
    }

    await tx.update(schema.blackbookImportRuns).set({
      createdCount: created, updatedCount: updated, unchangedCount: unchanged,
    }).where(eq(schema.blackbookImportRuns.id, run.id));

    await tx.insert(schema.platformAuditLogs).values({
      userId: opts.actorUserId, action: "platform_blackbook.imported",
      metadata: {
        countryCode: opts.countryCode, datasetRevision: opts.datasetRevision,
        recordCount: records.length, created, updated, unchanged, importRunId: run.id,
      },
    });

    return { importRunId: run.id, recordCount: records.length, created, updated, unchanged };
  });
}

export async function listImportRuns(countryCode?: string) {
  const conditions = countryCode ? [eq(schema.blackbookImportRuns.countryCode, countryCode)] : [];
  return db.select().from(schema.blackbookImportRuns)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(schema.blackbookImportRuns.createdAt)).limit(100);
}

// ---------------------------------------------------------------------------
// Tenant reads (behind the `blackbook.directory` flag; summaries only in
// lists, full payload + provenance on the detail view).
// ---------------------------------------------------------------------------
export const listEntriesQuerySchema = z.object({
  category: z.enum(BLACKBOOK_CATEGORIES).optional(),
  q: z.string().trim().min(1).max(120).optional(),
  country: z.string().trim().regex(/^[A-Z]{2}$/).default("ZW"),
});

export async function listEntries(query: z.infer<typeof listEntriesQuerySchema>) {
  const conditions = [
    eq(schema.blackbookEntries.countryCode, query.country),
    eq(schema.blackbookEntries.status, "ACTIVE"),
  ];
  if (query.category) conditions.push(eq(schema.blackbookEntries.category, query.category));
  if (query.q) {
    const needle = `%${query.q.replace(/[%_\\]/g, "\\$&")}%`;
    conditions.push(or(
      ilike(schema.blackbookEntries.name, needle),
      ilike(schema.blackbookEntries.entryKey, needle),
      sql<boolean>`${schema.blackbookEntries.payload}::text ILIKE ${needle}`,
    )!);
  }
  return db.select({
    key: schema.blackbookEntries.entryKey,
    category: schema.blackbookEntries.category,
    name: schema.blackbookEntries.name,
    verified: schema.blackbookEntries.verified,
    lastReviewed: schema.blackbookEntries.lastReviewed,
    currentVersion: schema.blackbookEntries.currentVersion,
  }).from(schema.blackbookEntries).where(and(...conditions))
    .orderBy(schema.blackbookEntries.category, schema.blackbookEntries.name).limit(500);
}

export async function getEntry(country: string, key: string) {
  const [entry] = await db.select().from(schema.blackbookEntries).where(and(
    eq(schema.blackbookEntries.countryCode, country),
    eq(schema.blackbookEntries.entryKey, key),
    eq(schema.blackbookEntries.status, "ACTIVE"),
  ));
  if (!entry) throw notFound("Black Book entry not found");
  const versions = await db.select({
    version: schema.blackbookEntryVersions.version,
    lastReviewed: schema.blackbookEntryVersions.lastReviewed,
    verified: schema.blackbookEntryVersions.verified,
    createdAt: schema.blackbookEntryVersions.createdAt,
  }).from(schema.blackbookEntryVersions)
    .where(eq(schema.blackbookEntryVersions.entryId, entry.id))
    .orderBy(desc(schema.blackbookEntryVersions.version)).limit(50);
  return {
    key: entry.entryKey, category: entry.category, name: entry.name,
    payload: entry.payload, verified: entry.verified, sources: entry.sources,
    lastReviewed: entry.lastReviewed, currentVersion: entry.currentVersion,
    updatedAt: entry.updatedAt, versions,
    notice: "Directory information, not professional advice. Confirm current requirements with the authority via the cited sources.",
  };
}
