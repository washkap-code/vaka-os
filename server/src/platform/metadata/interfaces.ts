import type { MetadataDefinition, MetadataRecord, MetadataValue } from "./types.js";

export interface MetadataProvider {
  definitions(entityType: string, tenantId: string): Promise<readonly MetadataDefinition[]>;
  read(record: Pick<MetadataRecord, "tenantId" | "entityType" | "entityId">): Promise<MetadataRecord | null>;
  write(record: MetadataRecord): Promise<MetadataRecord>;
}

export interface MetadataServiceContract {
  definitions(entityType: string, tenantId: string): Promise<readonly MetadataDefinition[]>;
  read(record: Pick<MetadataRecord, "tenantId" | "entityType" | "entityId">): Promise<MetadataRecord | null>;
  write(record: MetadataRecord): Promise<MetadataRecord>;
  value(record: MetadataRecord, key: string): MetadataValue | undefined;
}
