export interface QuoteResponse {
  symbol: string;
  price: number;
  fetchedAt: string;
  source: "api" | "cache" | "stale-cache";
  stale: boolean;
}

export interface QuoteCacheEntry {
  price: number;
  fetchedAt: string;
  expiresAt: string;
}

export type QuoteCache = Record<string, QuoteCacheEntry>;
