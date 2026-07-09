import { NextResponse } from "next/server";

import { readJsonFile, writeJsonFile } from "@/lib/json-store";
import type { Candle, CandleCache, CandlesResponse } from "@/types/candles";

export const runtime = "nodejs";

const CANDLES_CACHE_FILE = "candles-cache.json";
const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_CANDLE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_CANDLES = 72;

function normalizeSymbol(symbol: string | null): string {
  return (symbol ?? "").toUpperCase().replace(/[^A-Z=]/g, "").trim();
}

function toYahooSymbol(symbol: string): string {
  if (symbol.endsWith("=X")) {
    return symbol;
  }

  if (symbol.length === 6) {
    return `${symbol}=X`;
  }

  return symbol;
}

function parseCandles(payload: {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
        }>;
      };
    }>;
  };
}): Candle[] {
  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];

  const open = quote?.open ?? [];
  const high = quote?.high ?? [];
  const low = quote?.low ?? [];
  const close = quote?.close ?? [];

  const candles: Candle[] = [];

  for (let index = 0; index < timestamps.length; index += 1) {
    const time = timestamps[index];
    const o = open[index];
    const h = high[index];
    const l = low[index];
    const c = close[index];

    if (
      !Number.isFinite(time) ||
      !Number.isFinite(o) ||
      !Number.isFinite(h) ||
      !Number.isFinite(l) ||
      !Number.isFinite(c)
    ) {
      continue;
    }

    candles.push({
      time,
      open: o as number,
      high: h as number,
      low: l as number,
      close: c as number,
    });
  }

  return candles;
}

function limitToThreeDays(candles: Candle[]): Candle[] {
  if (candles.length === 0) {
    return candles;
  }

  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const latestTimeMs = sorted[sorted.length - 1].time * 1000;
  const lowerBoundMs = latestTimeMs - MAX_CANDLE_WINDOW_MS;

  const withinWindow = sorted.filter((candle) => candle.time * 1000 >= lowerBoundMs);

  if (withinWindow.length <= MAX_CANDLES) {
    return withinWindow;
  }

  return withinWindow.slice(-MAX_CANDLES);
}

async function fetchHourlyCandles(symbol: string): Promise<Candle[]> {
  const yahooSymbol = toYahooSymbol(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=60m&range=1mo`;

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
    throw new Error("Failed to fetch 1-hour candles from free market data provider.");
  }

  const payload = (await response.json()) as {
    chart?: {
      error?: { description?: string } | null;
    };
  };

  const candles = parseCandles(payload as never);

  if (payload.chart?.error?.description) {
    throw new Error(payload.chart.error.description);
  }

  if (candles.length === 0) {
    throw new Error("No candle data available for this symbol.");
  }

  return candles;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = normalizeSymbol(url.searchParams.get("symbol"));

  if (!symbol) {
    return NextResponse.json({ error: "Symbol is required." }, { status: 400 });
  }

  const now = Date.now();
  const cache = await readJsonFile<CandleCache>(CANDLES_CACHE_FILE, {});
  const cached = cache[symbol];

  if (cached && new Date(cached.expiresAt).getTime() > now) {
    const limitedCandles = limitToThreeDays(cached.candles);

    const response: CandlesResponse = {
      symbol,
      interval: "1h",
      source: "cache",
      stale: false,
      fetchedAt: cached.fetchedAt,
      candles: limitedCandles,
    };

    return NextResponse.json(response);
  }

  try {
    const candles = limitToThreeDays(await fetchHourlyCandles(symbol));
    const fetchedAt = new Date().toISOString();

    cache[symbol] = {
      fetchedAt,
      expiresAt: new Date(now + CACHE_TTL_MS).toISOString(),
      candles,
    };

    await writeJsonFile(CANDLES_CACHE_FILE, cache);

    const response: CandlesResponse = {
      symbol,
      interval: "1h",
      source: "api",
      stale: false,
      fetchedAt,
      candles,
    };

    return NextResponse.json(response);
  } catch (error) {
    if (cached) {
      const limitedCandles = limitToThreeDays(cached.candles);

      const response: CandlesResponse = {
        symbol,
        interval: "1h",
        source: "stale-cache",
        stale: true,
        fetchedAt: cached.fetchedAt,
        candles: limitedCandles,
      };

      return NextResponse.json(response);
    }

    const message = error instanceof Error ? error.message : "Could not load candle data.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
