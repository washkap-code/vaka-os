export type MetadataScalar = string | number | boolean | null;
export type MetadataValue = MetadataScalar | MetadataScalar[];

export interface MetadataDefinition {
  key: string;
  valueType: "string" | "number" | "boolean" | "date" | "choice";
  required?: boolean;
  choices?: readonly string[];
}

export interface MetadataRecord {
  tenantId: string;
  entityType: string;
  entityId: string;
  values: Record<string, MetadataValue>;
}
