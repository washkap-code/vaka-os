import type { SearchQuery, SearchResponse, SearchScope } from "./types.js";

export interface SearchProvider {
  search<TDocument>(query: SearchQuery, scope: SearchScope): Promise<SearchResponse<TDocument>>;
}

export interface SearchServiceContract {
  search<TDocument>(query: SearchQuery, scope: SearchScope): Promise<SearchResponse<TDocument>>;
}
