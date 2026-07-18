export type MetadataScalar = string | number | boolean | null;
export type MetadataValue = MetadataScalar | MetadataScalar[];

export interface MetadataDefinition {
  key: string;
  valueType: "string" | "number" | "boolean" | "date" | "choice";
  required?: boolean;
  choices?: readonly string[];
}

export type MetadataClassification = "internal" | "confidential" | "restricted";
export type MetadataAiExposure = "allowed" | "excluded";

export interface MetadataFieldDefinition extends MetadataDefinition {
  sourceField: string;
  format: "uuid" | "text" | "enum" | "boolean" | "date" | "money" | "currency" | "integer" | "string-list";
  classification: MetadataClassification;
  labelKey: string;
  searchable: boolean;
  result: boolean;
  aiExposure: MetadataAiExposure;
}

export interface MetadataObjectDefinition {
  key: string;
  version: string;
  canonicalName: string;
  sourceTable: string;
  tenantScoped: true;
  surrogateNote: string | null;
  titleField: string;
  lifecycleField: string | null;
  readPermission: string | null;
  writePermission: string;
  labelKey: string;
  pluralLabelKey: string;
  fallbackLabel: string;
  fallbackPluralLabel: string;
  navigation: { section: string; recordView: string | null };
  searchable: boolean;
  aiContext: "future-read-only";
  fields: readonly MetadataFieldDefinition[];
}

export interface MetadataRecord {
  tenantId: string;
  entityType: string;
  entityId: string;
  values: Record<string, MetadataValue>;
}

/**
 * Canonical field shapes supported by the schema-backed registry.
 * Decimal values stay strings so metadata validation cannot introduce
 * floating-point financial arithmetic.
 */
export type MetadataFieldType =
  | "string"
  | "uuid"
  | "decimal"
  | "integer"
  | "boolean"
  | "date"
  | "datetime"
  | "string[]"
  | "json";

export interface FieldValidation {
  allowedValues?: readonly (string | number | boolean)[];
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxItems?: number;
  uniqueItems?: boolean;
}

export interface FieldDefinition {
  name: string;
  type: MetadataFieldType;
  required: boolean;
  unique: boolean;
  maxLength: number | null;
  /** Canonical registry object referenced by this field, when applicable. */
  lookup: string | null;
  validation: FieldValidation | null;
  classification: MetadataClassification;
  aiReadable: boolean;
  aiWritable: boolean;
  searchable: boolean;
  apiExposed: boolean;
}

export type RelationshipCardinality =
  | "one-to-one"
  | "one-to-many"
  | "many-to-one"
  | "many-to-many";

export interface RelationshipDefinition {
  name: string;
  target: string;
  cardinality: RelationshipCardinality;
  cascade: boolean;
}

export interface ObjectDefinition {
  name: string;
  parent: string | null;
  domain: string;
  fields: readonly FieldDefinition[];
  relationships: readonly RelationshipDefinition[];
  lifecycle: readonly string[];
  searchable: boolean;
  aiVisible: boolean;
  auditEnabled: boolean;
}

export type MetadataValidationCode =
  | "payload"
  | "unknown_field"
  | "required"
  | "type"
  | "max_length"
  | "validation"
  | "unique";

export interface MetadataValidationIssue {
  field: string;
  code: MetadataValidationCode;
  message: string;
}

export interface MetadataValidationResult {
  valid: boolean;
  errors: readonly MetadataValidationIssue[];
}
