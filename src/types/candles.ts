export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface CandlesResponse {
  symbol: string;
  interval: "1h";
  source: "api" | "cache" | "stale-cache";
  stale: boolean;
  fetchedAt: string;
  candles: Candle[];
}

export interface CandleCacheEntry {
  fetchedAt: string;
  expiresAt: string;
  candles: Candle[];
}

export type CandleCache = Record<string, CandleCacheEntry>;
