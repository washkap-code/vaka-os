export const BLACKBOOK_CATEGORIES = [
  "government_organisation",
  "regulator",
  "local_authority",
  "utility",
  "tender_portal",
  "business_association",
  "licence_type",
  "compliance_event",
  "service",
] as const;

export type BlackbookCategory = typeof BLACKBOOK_CATEGORIES[number];

export const BLACKBOOK_DETAIL_FIELDS = [
  "parentId",
  "website",
  "phones",
  "emails",
  "physicalAddress",
  "city",
  "services",
  "issuingAuthorityId",
  "appliesTo",
  "requiredDocuments",
  "statutoryBasis",
  "renewalFrequency",
  "typicalProcessingTime",
  "officialFormUrl",
  "licenceTypeId",
  "authorityId",
  "cadence",
  "dueRule",
  "notes",
] as const;

export type BlackbookDetailField = typeof BLACKBOOK_DETAIL_FIELDS[number];

export type BlackbookEntrySummary = {
  key: string;
  category: BlackbookCategory;
  name: string;
  verified: boolean;
  lastReviewed: string;
  currentVersion: number;
};

export type BlackbookEntryDetail = BlackbookEntrySummary & {
  payload: Record<string, unknown>;
  sources: string[];
  notice: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function category(value: unknown): value is BlackbookCategory {
  return typeof value === "string" && (BLACKBOOK_CATEGORIES as readonly string[]).includes(value);
}

function date(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseSummary(value: unknown): BlackbookEntrySummary | null {
  const candidate = record(value);
  if (!candidate || typeof candidate.key !== "string" || typeof candidate.name !== "string"
    || !category(candidate.category) || typeof candidate.verified !== "boolean"
    || !date(candidate.lastReviewed) || !Number.isInteger(candidate.currentVersion)) return null;
  return {
    key: candidate.key,
    category: candidate.category,
    name: candidate.name,
    verified: candidate.verified,
    lastReviewed: candidate.lastReviewed,
    currentVersion: candidate.currentVersion as number,
  };
}

export function parseBlackbookEntries(value: unknown): BlackbookEntrySummary[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseSummary).filter((entry): entry is BlackbookEntrySummary => entry !== null);
}

export function parseBlackbookEntry(value: unknown): BlackbookEntryDetail | null {
  const summary = parseSummary(value);
  const candidate = record(value);
  const payload = record(candidate?.payload);
  if (!summary || !candidate || !payload || !Array.isArray(candidate.sources)
    || !candidate.sources.every((source) => typeof source === "string")
    || typeof candidate.notice !== "string") return null;
  return {
    ...summary,
    payload,
    sources: candidate.sources as string[],
    notice: candidate.notice,
  };
}

function hasDisplayValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  return !Array.isArray(value) || value.length > 0;
}

export function blackbookDetailValues(payload: Record<string, unknown>): Array<{
  key: BlackbookDetailField;
  value: unknown;
}> {
  return BLACKBOOK_DETAIL_FIELDS.flatMap((key) =>
    hasDisplayValue(payload[key]) ? [{ key, value: payload[key] }] : []);
}
