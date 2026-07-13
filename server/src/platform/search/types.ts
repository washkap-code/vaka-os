export interface SearchScope {
  tenantId: string;
  actorUserId: string | null;
  permissions?: readonly string[];
}

export interface SearchQuery {
  text: string;
  limit?: number;
  cursor?: string;
  entityTypes?: readonly string[];
}

export interface SearchResult<TDocument = unknown> {
  id: string;
  entityType: string;
  title: string;
  document: TDocument;
  score?: number;
  object?: {
    key: string;
    version: string;
    labelKey: string;
    fallbackLabel: string;
    navigation: { section: string; recordView: string | null };
  };
}

export interface SearchResponse<TDocument = unknown> {
  results: readonly SearchResult<TDocument>[];
  nextCursor?: string;
}
