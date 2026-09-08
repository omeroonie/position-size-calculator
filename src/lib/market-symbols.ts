const YAHOO_TICKER_OVERRIDES: Record<string, string> = {
  XAUUSD: "GC=F",
  XAGUSD: "SI=F",
  XTIUSD: "CL=F",
  US500: "^GSPC",
  US100: "^NDX",
  US30: "^DJI",
};

export function getYahooTickerOverride(symbol: string): string | null {
  return YAHOO_TICKER_OVERRIDES[symbol.toUpperCase().trim()] ?? null;
}
