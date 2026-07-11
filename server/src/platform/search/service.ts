import { InvalidSearchQueryError } from "./errors.js";
import type { SearchProvider, SearchServiceContract } from "./interfaces.js";
import type { SearchQuery, SearchResponse, SearchScope } from "./types.js";

export class SearchService implements SearchServiceContract {
  constructor(private readonly provider: SearchProvider) {}

  search<TDocument>(query: SearchQuery, scope: SearchScope): Promise<SearchResponse<TDocument>> {
    const text = query.text.trim();
    if (!text) throw new InvalidSearchQueryError("Search text is required");
    if (!scope.tenantId.trim()) throw new InvalidSearchQueryError("Search tenantId is required");
    const limit = query.limit === undefined ? 25 : Math.max(1, Math.min(query.limit, 100));
    return this.provider.search({ ...query, text, limit }, scope);
  }
}
