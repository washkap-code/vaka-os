import { InvalidDocumentError } from "./errors.js";
import type { DocumentServiceContract, DocumentStore } from "./interfaces.js";
import type { DocumentAccessContext, DocumentDescriptor, DocumentId, DocumentPayload } from "./types.js";

export class DocumentService implements DocumentServiceContract {
  constructor(private readonly store: DocumentStore) {}

  async put(payload: DocumentPayload, context: DocumentAccessContext): Promise<DocumentDescriptor> {
    if (!payload.descriptor.id.trim() || !payload.descriptor.tenantId.trim() || !context.tenantId.trim()) {
      throw new InvalidDocumentError("Document id and tenantId are required");
    }
    if (payload.descriptor.tenantId !== context.tenantId) throw new InvalidDocumentError("Document tenant scope does not match access context");
    if (!payload.descriptor.kind.trim() || !payload.descriptor.fileName.trim() || !payload.descriptor.mediaType.trim()) {
      throw new InvalidDocumentError("Document kind, fileName and mediaType are required");
    }
    if (payload.bytes.byteLength === 0) throw new InvalidDocumentError("Document payload cannot be empty");
    if (payload.descriptor.byteSize !== payload.bytes.byteLength) throw new InvalidDocumentError("Document byteSize does not match payload");
    return this.store.put(payload, context);
  }

  get(id: DocumentId, context: DocumentAccessContext): Promise<DocumentPayload | null> {
    if (!id.trim() || !context.tenantId.trim()) throw new InvalidDocumentError("Document id and tenantId are required");
    return this.store.get(id, context);
  }
}
