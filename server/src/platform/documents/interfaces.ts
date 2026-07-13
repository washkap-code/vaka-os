import type { DocumentAccessContext, DocumentDescriptor, DocumentId, DocumentPayload } from "./types.js";

export interface DocumentStore {
  put(payload: DocumentPayload, context: DocumentAccessContext): Promise<DocumentDescriptor>;
  get(id: DocumentId, context: DocumentAccessContext): Promise<DocumentPayload | null>;
}

export interface DocumentServiceContract {
  put(payload: DocumentPayload, context: DocumentAccessContext): Promise<DocumentDescriptor>;
  get(id: DocumentId, context: DocumentAccessContext): Promise<DocumentPayload | null>;
}
