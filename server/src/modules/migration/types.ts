import type { MetadataValidationIssue } from "../../platform/metadata/types.js";

export const MIGRATION_OBJECT_TYPES = ["Customer", "Supplier", "Product"] as const;
export type MigrationObjectType = typeof MIGRATION_OBJECT_TYPES[number];

export const DUPLICATE_POLICIES = ["skip", "update-existing", "create-anyway"] as const;
export type DuplicatePolicy = typeof DUPLICATE_POLICIES[number];

export const MIGRATION_JOB_STATUSES = [
  "uploaded", "mapped", "validated", "importing", "completed", "failed", "rolled_back",
] as const;
export type MigrationJobStatus = typeof MIGRATION_JOB_STATUSES[number];

export const MIGRATION_ROW_STATUSES = ["pending", "valid", "error", "imported", "skipped"] as const;
export type MigrationRowStatus = typeof MIGRATION_ROW_STATUSES[number];

export type CsvEncoding = "auto" | "utf8" | "utf16le" | "utf16be" | "windows1252";

export interface MigrationRowIssue {
  code: string;
  field: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface MigrationMappingState {
  headers: string[];
  columns: Record<string, string>;
  encoding: Exclude<CsvEncoding, "auto">;
  delimiter: string;
  lastFailure?: {
    stage: "import" | "rollback";
    message: string;
    at: string;
  };
}

export interface MappingSuggestion {
  column: string;
  field: string | null;
  score: number;
  reason: "exact" | "alias" | "fuzzy" | "none";
}

export interface ParsedCsvRow {
  rowNumber: number;
  raw: Record<string, string>;
}

export interface ParsedCsvDocument {
  headers: string[];
  rows: ParsedCsvRow[];
  delimiter: string;
}

export const metadataIssue = (value: MetadataValidationIssue): MigrationRowIssue => ({
  code: value.code,
  field: value.field,
  message: value.message,
});
