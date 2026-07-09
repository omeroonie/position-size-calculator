import { NextResponse } from "next/server";

import { readJsonFile, writeJsonFile } from "@/lib/json-store";
import type { QuoteCache, QuoteResponse } from "@/types/quotes";

export const runtime = "nodejs";

const QUOTES_CACHE_FILE = "quotes-cache.json";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function normalizeSymbol(symbol: string | null): string {
  return (symbol ?? "").toUpperCase().replace(/[^A-Z]/g, "").trim();
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = normalizeSymbol(url.searchParams.get("symbol"));

  const parsed = splitSymbol(symbol);

  if (!parsed) {
    return NextResponse.json(
      {
        error: "Symbol must be a 6-letter FX pair like EURUSD.",
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
    const price = await fetchRate(parsed.base, parsed.quote);
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
