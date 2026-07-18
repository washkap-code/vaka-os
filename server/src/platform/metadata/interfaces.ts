import type {
  FieldDefinition,
  MetadataDefinition,
  MetadataObjectDefinition,
  MetadataRecord,
  MetadataValidationResult,
  MetadataValue,
  ObjectDefinition,
  RelationshipDefinition,
} from "./types.js";

export interface MetadataProvider {
  objects(tenantId: string): Promise<readonly MetadataObjectDefinition[]>;
  object(entityType: string, tenantId: string): Promise<MetadataObjectDefinition | null>;
  definitions(entityType: string, tenantId: string): Promise<readonly MetadataDefinition[]>;
  read(record: Pick<MetadataRecord, "tenantId" | "entityType" | "entityId">): Promise<MetadataRecord | null>;
  write(record: MetadataRecord): Promise<MetadataRecord>;
}

export interface MetadataServiceContract {
  objects(tenantId: string): Promise<readonly MetadataObjectDefinition[]>;
  object(entityType: string, tenantId: string): Promise<MetadataObjectDefinition | null>;
  definitions(entityType: string, tenantId: string): Promise<readonly MetadataDefinition[]>;
  read(record: Pick<MetadataRecord, "tenantId" | "entityType" | "entityId">): Promise<MetadataRecord | null>;
  write(record: MetadataRecord): Promise<MetadataRecord>;
  value(record: MetadataRecord, key: string): MetadataValue | undefined;
}

export interface MetadataRegistryContract {
  getObject(name: string): ObjectDefinition;
  getFields(name: string): readonly FieldDefinition[];
  getRelationships(name: string): readonly RelationshipDefinition[];
  listObjects(domain?: string): readonly ObjectDefinition[];
  validate(objectName: string, payload: unknown): MetadataValidationResult;
}
