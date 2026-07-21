import { UnknownMetadataObjectError } from "../metadata/errors.js";
import type { MetadataRegistryContract } from "../metadata/interfaces.js";
import type { IdentityServiceContract } from "../identity/interfaces.js";
import {
  AIContextBoundaryError, AIObjectNotFoundError, AIObjectUnavailableError,
  AIPermissionDeniedError,
} from "./errors.js";
import type { AIContextReader } from "./interfaces.js";
import type {
  AIContextRecord, AIContextValue, AIEvidenceDraft, AIObjectRef, BuiltAIContext,
} from "./types.js";

const READ_PERMISSIONS: Readonly<Record<string, string>> = Object.freeze({
  Company: "settings.manage",
  Customer: "crm.read",
  Supplier: "inventory.read",
  Invoice: "accounting.read",
  Payment: "accounting.read",
  Product: "inventory.read",
  Employee: "payroll.read",
  User: "users.manage",
});

function normaliseValue(value: unknown): AIContextValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "number"
    || typeof value === "boolean") return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (Array.isArray(value) && value.every((item) =>
    item === null || ["string", "number", "boolean"].includes(typeof item))) {
    return value as AIContextValue;
  }
  return undefined;
}

function evidenceSnippet(fields: Readonly<Record<string, AIContextValue>>): string {
  return JSON.stringify(fields).slice(0, 2_000);
}

export class ContextAssemblyService {
  constructor(
    private readonly identity: IdentityServiceContract,
    private readonly metadata: MetadataRegistryContract,
    private readonly reader: AIContextReader,
  ) {}

  async buildContext(
    userId: string,
    tenantId: string,
    objectRefs: readonly AIObjectRef[],
  ): Promise<BuiltAIContext> {
    const identity = this.identity.context();
    if (!identity || !identity.userId || identity.userId !== userId
      || !identity.tenantId || identity.tenantId !== tenantId) {
      throw new AIContextBoundaryError("AI context must match the authenticated user and tenant");
    }
    if (!objectRefs.length) throw new AIContextBoundaryError("At least one object reference is required");

    const authorised = objectRefs.map((objectRef) => {
      if (!objectRef.objectType.trim() || !objectRef.objectId.trim()) {
        throw new AIContextBoundaryError("Object type and object id are required");
      }
      let definition;
      try {
        definition = this.metadata.getObject(objectRef.objectType);
      } catch (error) {
        if (error instanceof UnknownMetadataObjectError) {
          throw new AIObjectUnavailableError(objectRef.objectType);
        }
        throw error;
      }
      if (!definition.aiVisible) throw new AIObjectUnavailableError(definition.name);
      const permission = READ_PERMISSIONS[definition.name];
      if (!permission) throw new AIObjectUnavailableError(definition.name);
      if (!this.identity.hasPermission(permission)) throw new AIPermissionDeniedError(permission);
      return {
        objectRef: { objectType: definition.name, objectId: objectRef.objectId },
        fieldNames: definition.fields.filter((field) => field.aiReadable).map((field) => field.name),
      };
    });

    const records = await Promise.all(authorised.map(async ({ objectRef, fieldNames }) => {
      const source = await this.reader.readObject(tenantId, objectRef);
      if (!source) throw new AIObjectNotFoundError(objectRef.objectType);
      const fields: Record<string, AIContextValue> = {};
      for (const fieldName of fieldNames) {
        const value = normaliseValue(source[fieldName]);
        if (value !== undefined) fields[fieldName] = value;
      }
      return Object.freeze({
        ...objectRef,
        fields: Object.freeze(fields),
      }) satisfies AIContextRecord;
    }));

    const evidence: AIEvidenceDraft[] = records.map((record) => Object.freeze({
      objectType: record.objectType,
      objectId: record.objectId,
      fieldNames: Object.freeze(Object.keys(record.fields)),
      snippet: evidenceSnippet(record.fields),
    }));
    return Object.freeze({
      records: Object.freeze(records),
      evidence: Object.freeze(evidence),
    });
  }
}
