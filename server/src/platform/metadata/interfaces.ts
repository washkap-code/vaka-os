import type { MetadataDefinition, MetadataObjectDefinition, MetadataRecord, MetadataValue } from "./types.js";

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
