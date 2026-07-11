import { InvalidDocumentError } from "./errors.js";
import type { DocumentServiceContract, DocumentStore } from "./interfaces.js";
import type { DocumentAccessContext, DocumentDescriptor, DocumentId, DocumentPayload } from "./types.js";

export class DocumentService implements DocumentServiceContract {
  constructor(private readonly store: DocumentStore) {}

  async put(payload: DocumentPayload): Promise<DocumentDescriptor> {
    if (!payload.descriptor.id.trim() || !payload.descriptor.tenantId.trim()) throw new InvalidDocumentError("Document id and tenantId are required");
    if (payload.bytes.byteLength === 0) throw new InvalidDocumentError("Document payload cannot be empty");
    return this.store.put(payload);
  }

  get(id: DocumentId, context: DocumentAccessContext): Promise<DocumentPayload | null> {
    if (!id.trim() || !context.tenantId.trim()) throw new InvalidDocumentError("Document id and tenantId are required");
    return this.store.get(id, context);
  }
}
