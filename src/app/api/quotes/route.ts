import { NextResponse } from "next/server";

import { readJsonFile, writeJsonFile } from "@/lib/json-store";
import { getYahooTickerOverride } from "@/lib/market-symbols";
import type { QuoteCache, QuoteResponse } from "@/types/quotes";

export const runtime = "nodejs";

const QUOTES_CACHE_FILE = "quotes-cache.json";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function normalizeSymbol(symbol: string | null): string {
  return (symbol ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
}

function splitSymbol(symbol: string): { base: string; quote: string } | null {
  if (symbol.length !== 6) {
    return null;
  }

  return {
    base: symbol.slice(0, 3),
    quote: symbol.slice(3, 6),
  };
}

async function fetchRate(base: string, quote: string): Promise<number> {
  if (base === quote) {
    return 1;
  }

  const response = await fetch(`https://open.er-api.com/v6/latest/${base}`, {
    method: "GET",
    next: { revalidate: 0 },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch market rate from provider.");
  }

  const payload = (await response.json()) as {
    rates?: Record<string, number>;
  };

  const rate = payload.rates?.[quote];

  if (!rate || !Number.isFinite(rate)) {
    throw new Error("Requested pair is not available from the free provider.");
  }

  return rate;
}

async function fetchYahooPrice(yahooSymbol: string): Promise<number> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=1d`;

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    next: { revalidate: 0 },
    headers: {
      "User-Agent": "position-size-calculator/1.0",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch market price from provider.");
  }

  const payload = (await response.json()) as {
    chart?: {
      result?: Array<{ meta?: { regularMarketPrice?: number } }>;
      error?: { description?: string } | null;
    };
  };

  if (payload.chart?.error?.description) {
    throw new Error(payload.chart.error.description);
  }

  const price = payload.chart?.result?.[0]?.meta?.regularMarketPrice;

  if (!Number.isFinite(price)) {
    throw new Error("Requested symbol is not available from the market data provider.");
  }

  return price as number;
}

async function fetchPrice(yahooTicker: string | null, parsed: { base: string; quote: string } | null): Promise<number> {
  if (yahooTicker) {
    return fetchYahooPrice(yahooTicker);
  }

  if (parsed) {
    return fetchRate(parsed.base, parsed.quote);
  }

  throw new Error("Symbol must be a 6-letter FX pair like EURUSD, or a supported commodity/index symbol.");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = normalizeSymbol(url.searchParams.get("symbol"));
  const yahooTicker = getYahooTickerOverride(symbol);
  const parsed = yahooTicker ? null : splitSymbol(symbol);

  if (!yahooTicker && !parsed) {
    return NextResponse.json(
      {
        error: "Symbol must be a 6-letter FX pair like EURUSD, or a supported commodity/index symbol.",
      },
      { status: 400 }
    );
  }

  const now = Date.now();
  const cache = await readJsonFile<QuoteCache>(QUOTES_CACHE_FILE, {});
  const cachedEntry = cache[symbol];

  if (cachedEntry && new Date(cachedEntry.expiresAt).getTime() > now) {
    const response: QuoteResponse = {
      symbol,
      price: cachedEntry.price,
      fetchedAt: cachedEntry.fetchedAt,
      source: "cache",
      stale: false,
    };

    return NextResponse.json(response);
  }

  try {
    const price = await fetchPrice(yahooTicker, parsed);
    const fetchedAt = new Date().toISOString();

    cache[symbol] = {
      price,
      fetchedAt,
      expiresAt: new Date(now + CACHE_TTL_MS).toISOString(),
    };

    await writeJsonFile(QUOTES_CACHE_FILE, cache);

    const response: QuoteResponse = {
      symbol,
      price,
      fetchedAt,
      source: "api",
      stale: false,
    };

    return NextResponse.json(response);
  } catch (error) {
    if (cachedEntry) {
      const response: QuoteResponse = {
        symbol,
        price: cachedEntry.price,
        fetchedAt: cachedEntry.fetchedAt,
        source: "stale-cache",
        stale: true,
      };

      return NextResponse.json(response);
    }

    const message = error instanceof Error ? error.message : "Could not load market quote.";

    return NextResponse.json(
      {
        error: message,
      },
      { status: 502 }
    );
  }
}
