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
  format: "uuid" | "text" | "enum" | "boolean" | "date" | "money" | "currency" | "string-list";
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
