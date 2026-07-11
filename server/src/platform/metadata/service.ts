import { InvalidMetadataError } from "./errors.js";
import type { MetadataProvider, MetadataServiceContract } from "./interfaces.js";
import type { MetadataDefinition, MetadataRecord, MetadataValue } from "./types.js";

export class MetadataService implements MetadataServiceContract {
  constructor(private readonly provider: MetadataProvider) {}

  definitions(entityType: string, tenantId: string): Promise<readonly MetadataDefinition[]> {
    if (!entityType.trim() || !tenantId.trim()) throw new InvalidMetadataError("entityType and tenantId are required");
    return this.provider.definitions(entityType, tenantId);
  }

  read(record: Pick<MetadataRecord, "tenantId" | "entityType" | "entityId">): Promise<MetadataRecord | null> {
    this.validateIdentity(record);
    return this.provider.read(record);
  }

  write(record: MetadataRecord): Promise<MetadataRecord> {
    this.validateIdentity(record);
    return this.provider.write(record);
  }

  value(record: MetadataRecord, key: string): MetadataValue | undefined {
    this.validateIdentity(record);
    return record.values[key];
  }

  private validateIdentity(record: Pick<MetadataRecord, "tenantId" | "entityType" | "entityId">): void {
    if (!record.tenantId.trim() || !record.entityType.trim() || !record.entityId.trim()) {
      throw new InvalidMetadataError("tenantId, entityType, and entityId are required");
    }
  }
}
