"use client";

import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  CandlestickSeries,
  createChart,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
} from "lightweight-charts";

import type { CandlesResponse } from "@/types/candles";

interface HourlyCandlesChartProps {
  symbol: string;
  isDark: boolean;
  isTakeProfitLocked: boolean;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  onEntryChange: (price: number) => void;
  onStopLossChange: (price: number) => void;
  onTakeProfitChange: (price: number) => void;
}

interface CandleViewData {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface OverlayPositionState {
  entryY: number | null;
  stopLossY: number | null;
  takeProfitY: number | null;
}

function toChartData(payload: CandlesResponse): CandleViewData[] {
  return payload.candles.map((candle) => ({
    time: candle.time as UTCTimestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  }));
}

function getPriceStep(symbol: string) {
  return symbol.endsWith("JPY") ? 0.001 : 0.00001;
}

function roundToStep(value: number, step: number) {
  return Math.round(value / step) * step;
}

export function HourlyCandlesChart({
  symbol,
  isDark,
  isTakeProfitLocked,
  entryPrice,
  stopLossPrice,
  takeProfitPrice,
  onEntryChange,
  onStopLossChange,
  onTakeProfitChange,
}: HourlyCandlesChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartMountRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const dragTargetRef = useRef<"entry" | "sl" | "tp" | null>(null);
  const onEntryChangeRef = useRef(onEntryChange);
  const stopLossPriceRef = useRef(stopLossPrice);
  const takeProfitPriceRef = useRef(takeProfitPrice);
  const onStopLossChangeRef = useRef(onStopLossChange);
  const onTakeProfitChangeRef = useRef(onTakeProfitChange);
  const [, forceOverlayRender] = useReducer((value: number) => value + 1, 0);

  const [candles, setCandles] = useState<CandleViewData[]>([]);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [overlayPositions, setOverlayPositions] = useState<OverlayPositionState>({
    entryY: null,
    stopLossY: null,
    takeProfitY: null,
  });

  const normalizedSymbol = useMemo(() => symbol.toUpperCase().trim(), [symbol]);
  const priceStep = useMemo(() => getPriceStep(normalizedSymbol), [normalizedSymbol]);
  const priceDigits = normalizedSymbol.endsWith("JPY") ? 3 : 5;

  useEffect(() => {
    onEntryChangeRef.current = onEntryChange;
  }, [onEntryChange]);

  useEffect(() => {
    stopLossPriceRef.current = stopLossPrice;
  }, [stopLossPrice]);

  useEffect(() => {
    takeProfitPriceRef.current = takeProfitPrice;
  }, [takeProfitPrice]);

  useEffect(() => {
    onStopLossChangeRef.current = onStopLossChange;
  }, [onStopLossChange]);

  useEffect(() => {
    onTakeProfitChangeRef.current = onTakeProfitChange;
  }, [onTakeProfitChange]);

  useEffect(() => {
    const container = containerRef.current;
    const mount = chartMountRef.current;

    if (!container || !mount) {
      return;
    }

    const chart = createChart(mount, {
      width: container.clientWidth,
      height: container.clientHeight,
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: false,
        horzTouchDrag: false,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: false,
        axisDoubleClickReset: false,
        mouseWheel: false,
        pinch: false,
      },
      layout: {
        background: { color: isDark ? "#0f172a" : "#ffffff" },
        textColor: isDark ? "#cbd5e1" : "#334155",
      },
      grid: {
        vertLines: { color: isDark ? "#334155" : "#e2e8f0" },
        horzLines: { color: isDark ? "#334155" : "#e2e8f0" },
      },
      rightPriceScale: {
        borderColor: isDark ? "#475569" : "#cbd5e1",
      },
      timeScale: {
        borderColor: isDark ? "#475569" : "#cbd5e1",
      },
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#16a34a",
      downColor: "#dc2626",
      borderVisible: false,
      wickUpColor: "#16a34a",
      wickDownColor: "#dc2626",
    });

    candlestickSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.03,
        bottom: 0.03,
      },
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    const resizeObserver = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth });
      forceOverlayRender();
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      dragTargetRef.current = null;
      container.style.cursor = "default";
      document.body.style.cursor = "default";
    };
  }, [forceOverlayRender, isDark]);

  useEffect(() => {
    if (!chartRef.current) {
      return;
    }

    chartRef.current.applyOptions({
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: false,
        horzTouchDrag: false,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: false,
        axisDoubleClickReset: false,
        mouseWheel: false,
        pinch: false,
      },
      layout: {
        background: { color: isDark ? "#0f172a" : "#ffffff" },
        textColor: isDark ? "#cbd5e1" : "#334155",
      },
      grid: {
        vertLines: { color: isDark ? "#334155" : "#e2e8f0" },
        horzLines: { color: isDark ? "#334155" : "#e2e8f0" },
      },
      rightPriceScale: {
        borderColor: isDark ? "#475569" : "#cbd5e1",
      },
      timeScale: {
        borderColor: isDark ? "#475569" : "#cbd5e1",
      },
    });

    forceOverlayRender();
  }, [forceOverlayRender, isDark]);

  useEffect(() => {
    const loadCandles = async () => {
      if (!normalizedSymbol) {
        setCandles([]);
        setError("");
        setStatus("");
        return;
      }

      setLoading(true);
      setError("");

      try {
        const response = await fetch(`/api/candles?symbol=${encodeURIComponent(normalizedSymbol)}`);
        const payload = (await response.json()) as CandlesResponse | { error?: string };

        if (!response.ok) {
          throw new Error("error" in payload ? payload.error : "Could not load candles.");
        }

        const candlesPayload = payload as CandlesResponse;
        setCandles(toChartData(candlesPayload));

        const sourceLabel =
          candlesPayload.source === "api"
            ? "API"
            : candlesPayload.source === "cache"
              ? "cache"
              : "stale cache";

        setStatus(`1h candles from ${sourceLabel} at ${new Date(candlesPayload.fetchedAt).toLocaleString()}`);
      } catch (chartError) {
        const message = chartError instanceof Error ? chartError.message : "Could not load candles.";
        setError(message);
        setStatus("");
        setCandles([]);
      } finally {
        setLoading(false);
      }
    };

    void loadCandles();
  }, [normalizedSymbol]);

  useEffect(() => {
    if (!seriesRef.current) {
      return;
    }

    seriesRef.current.setData(candles);

    chartRef.current?.timeScale().fitContent();
  }, [candles, forceOverlayRender, stopLossPrice, takeProfitPrice]);

  useEffect(() => {
    const series = seriesRef.current;

    if (!series) {
      return;
    }

    setOverlayPositions({
      entryY: (() => {
        const coordinate = series.priceToCoordinate(entryPrice);
        return typeof coordinate === "number" && Number.isFinite(coordinate) ? coordinate : null;
      })(),
      stopLossY: (() => {
        const coordinate = series.priceToCoordinate(stopLossPrice);
        return typeof coordinate === "number" && Number.isFinite(coordinate) ? coordinate : null;
      })(),
      takeProfitY: (() => {
        const coordinate = series.priceToCoordinate(takeProfitPrice);
        return typeof coordinate === "number" && Number.isFinite(coordinate) ? coordinate : null;
      })(),
    });
  }, [candles, entryPrice, stopLossPrice, takeProfitPrice, isDark]);

  const getCoordinateForPrice = (price: number) => {
    const series = seriesRef.current;

    if (!series) {
      return null;
    }

    const coordinate = series.priceToCoordinate(price);

    return typeof coordinate === "number" && Number.isFinite(coordinate) ? coordinate : null;
  };

  const startDrag = (target: "entry" | "sl" | "tp", event: ReactPointerEvent<HTMLButtonElement>) => {
    if (target === "tp" && isTakeProfitLocked) {
      return;
    }

    const container = containerRef.current;
    const series = seriesRef.current;

    if (!container || !series) {
      return;
    }

    dragTargetRef.current = target;
    container.style.cursor = "ns-resize";
    document.body.style.cursor = "ns-resize";

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is optional here.
    }

    event.preventDefault();
    event.stopPropagation();
  };

  const applyDragPrice = (target: "entry" | "sl" | "tp", clientY: number) => {
    const container = containerRef.current;
    const series = seriesRef.current;

    if (!container || !series) {
      return;
    }

    const rect = container.getBoundingClientRect();
    const y = Math.min(Math.max(clientY - rect.top, 0), rect.height);
    const price = series.coordinateToPrice(y);

    if (typeof price !== "number" || !Number.isFinite(price)) {
      return;
    }

    const nextPrice = roundToStep(price, priceStep);

    if (target === "entry") {
      onEntryChangeRef.current(nextPrice);
      return;
    }

    if (target === "sl") {
      onStopLossChangeRef.current(nextPrice);
      return;
    }

    onTakeProfitChangeRef.current(nextPrice);
  };

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!dragTargetRef.current) {
        return;
      }

      event.preventDefault();
      applyDragPrice(dragTargetRef.current, event.clientY);
    };

    const onPointerUp = () => {
      dragTargetRef.current = null;
      if (containerRef.current) {
        containerRef.current.style.cursor = "default";
      }
      document.body.style.cursor = "default";
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [applyDragPrice]);

  const entryY = overlayPositions.entryY ?? getCoordinateForPrice(entryPrice);
  const stopLossY = overlayPositions.stopLossY ?? getCoordinateForPrice(stopLossPrice);
  const takeProfitY = overlayPositions.takeProfitY ?? getCoordinateForPrice(takeProfitPrice);

  const priceChipClass = isDark
    ? "border-slate-600 bg-slate-950/90 text-slate-100 shadow-black/20"
    : "border-white/80 bg-white/90 text-slate-800 shadow-slate-200";

  const lineBaseClass = "absolute inset-x-0 h-12 -translate-y-1/2 border-0 bg-transparent p-0 text-left sm:h-9";
  const lineBandBaseClass = "absolute inset-x-0 top-1/2 h-px -translate-y-1/2";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">1H Candles</h2>
        <span className="text-xs text-slate-500">{normalizedSymbol || "No symbol"}</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">Optimized mode: cached 1-hour candles to minimize API usage.</p>

      {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
      {status ? <p className="mt-3 text-xs text-slate-500">{status}</p> : null}
      {loading ? <p className="mt-3 text-sm text-slate-500">Loading candles...</p> : null}
      <p className="mt-2 text-xs text-slate-500">
        Drag the Entry, SL, and TP handles over the chart. TP follows SL automatically while locked.
      </p>

      <div ref={containerRef} className="relative mt-4 h-[320px] w-full overflow-hidden rounded-lg border border-slate-200">
        <div ref={chartMountRef} className="absolute inset-0 z-0" />
        <div className="pointer-events-none absolute inset-0 z-10">
          {entryY !== null ? (
            <button
              type="button"
              className={`${lineBaseClass} cursor-ns-resize text-left`}
              style={{ top: `${entryY}px`, pointerEvents: "auto" }}
              onPointerDown={(event) => startDrag("entry", event)}
              aria-label={`Adjust entry price to ${entryPrice.toFixed(priceDigits)}`}
            >
              <span className={lineBandBaseClass} style={{ backgroundColor: "rgba(148,163,184,0.95)", boxShadow: "0 0 0 1px rgba(255,255,255,0.7)" }} />
              <span className="absolute left-3 top-1/2 flex -translate-y-1/2 items-center gap-2 rounded-full border border-slate-300 bg-slate-100/90 px-3 py-1 text-[11px] font-semibold text-slate-600 shadow-sm">
                <span>Entry</span>
                <span className={priceChipClass}>{entryPrice.toFixed(priceDigits)}</span>
                <span className="h-2.5 w-2.5 rounded-full bg-slate-500 shadow-sm" />
              </span>
            </button>
          ) : null}

          {stopLossY !== null ? (
            <button
              type="button"
              className={`${lineBaseClass} cursor-ns-resize text-left`}
              style={{ top: `${stopLossY}px`, pointerEvents: "auto" }}
              onPointerDown={(event) => startDrag("sl", event)}
              aria-label={`Adjust stop loss to ${stopLossPrice.toFixed(priceDigits)}`}
            >
              <span className={lineBandBaseClass} style={{ backgroundColor: "rgba(220,38,38,0.98)", boxShadow: "0 0 0 1px rgba(255,255,255,0.85)" }} />
              <span className="absolute left-3 top-1/2 flex -translate-y-1/2 items-center gap-2 rounded-full border border-rose-500/30 bg-white/90 px-3 py-1 text-[11px] font-semibold text-rose-700 shadow-md">
                <span>SL</span>
                <span className={priceChipClass}>{stopLossPrice.toFixed(priceDigits)}</span>
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500 shadow-sm" />
              </span>
            </button>
          ) : null}

          {takeProfitY !== null ? (
            <button
              type="button"
              className={`${lineBaseClass} ${isTakeProfitLocked ? "cursor-not-allowed" : "cursor-ns-resize"} text-left`}
              style={{ top: `${takeProfitY}px`, pointerEvents: isTakeProfitLocked ? "none" : "auto" }}
              onPointerDown={(event) => startDrag("tp", event)}
              aria-disabled={isTakeProfitLocked}
              aria-label={`Adjust take profit to ${takeProfitPrice.toFixed(priceDigits)}`}
            >
              <span className={lineBandBaseClass} style={{ backgroundColor: "rgba(34,197,94,0.98)", boxShadow: "0 0 0 1px rgba(255,255,255,0.85)" }} />
              <span className="absolute left-3 top-1/2 flex -translate-y-1/2 items-center gap-2 rounded-full border border-emerald-500/30 bg-white/90 px-3 py-1 text-[11px] font-semibold text-emerald-700 shadow-md">
                <span>TP</span>
                <span className={priceChipClass}>{takeProfitPrice.toFixed(priceDigits)}</span>
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-sm" />
                {isTakeProfitLocked ? <span className="text-[10px] uppercase tracking-wide text-emerald-600">Locked</span> : null}
              </span>
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
