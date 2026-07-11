export type DocumentId = string;

export interface DocumentDescriptor {
  id: DocumentId;
  tenantId: string;
  fileName: string;
  mediaType: string;
  byteSize: number;
  checksum?: string;
  createdAt: Date;
}

export interface DocumentPayload {
  descriptor: DocumentDescriptor;
  bytes: Uint8Array;
}

export interface DocumentAccessContext {
  tenantId: string;
  actorUserId: string | null;
}
