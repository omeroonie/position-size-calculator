"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type * as React from "react";

import { calculatePositionSize } from "@/lib/position-size";
import type { CalculatorSettings, TradeRecord } from "@/types/calculator";
import { CurrencyPairAutocomplete } from "@/components/currency-pair-autocomplete";
import type { QuoteResponse } from "@/types/quotes";
import { AccountSizeDropdown } from "@/components/account-size-dropdown";
import { HourlyCandlesChart } from "@/components/hourly-candles-chart";
import { Copy } from "lucide-react";

interface FormState {
  symbol: string;
  accountSize: number;
  riskPercent: number;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice?: number;
  pointValuePerLot: number;
  lotSizeUnits: number;
  notes: string;
}

interface PropFirmPreset {
  id: string;
  label: string;
  lotSizeUnits: number;
  pointValuePerLot: number;
}

type TakeProfitRatio = 1 | 2 | 3;

const defaultSettings: CalculatorSettings = {
  accountCurrency: "USD",
  defaultRiskPercent: 1,
  maxOpenRiskPercent: 5,
};

const defaultForm: FormState = {
  symbol: "EURUSD",
  accountSize: 10000,
  riskPercent: 1,
  entryPrice: 1.1,
  stopLossPrice: 1.095,
  takeProfitPrice: 1.11,
  pointValuePerLot: 100000,
  lotSizeUnits: 100000,
  notes: "",
};

const propFirmPresets: PropFirmPreset[] = [
  {
    id: "ftmo-forex",
    label: "FTMO Forex (Standard Lot)",
    lotSizeUnits: 100000,
    pointValuePerLot: 100000,
  },
  {
    id: "5ers-forex",
    label: "The5ers Forex (Standard Lot)",
    lotSizeUnits: 100000,
    pointValuePerLot: 100000,
  },
  {
    id: "fundednext-forex",
    label: "FundedNext Forex (Standard Lot)",
    lotSizeUnits: 100000,
    pointValuePerLot: 100000,
  },
  {
    id: "myfundedfx-forex",
    label: "MyFundedFX Forex (Standard Lot)",
    lotSizeUnits: 100000,
    pointValuePerLot: 100000,
  },
];

const ACCOUNT_SIZE_STORAGE_KEY = "position-size-calculator:accountSize";

function getInitialAccountSize() {
  if (typeof window === "undefined") {
    return defaultForm.accountSize;
  }

  const rawValue = window.localStorage.getItem(ACCOUNT_SIZE_STORAGE_KEY);

  if (!rawValue) {
    return defaultForm.accountSize;
  }

  const parsedValue = Number(rawValue);

  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : defaultForm.accountSize;
}

function formatNumber(value: number, maxFractionDigits = 4) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: maxFractionDigits,
  }).format(value);
}

function getPipSize(symbol: string) {
  const normalizedSymbol = symbol.toUpperCase().trim();

  if (normalizedSymbol.endsWith("JPY")) {
    return 0.01;
  }

  return 0.0001;
}

function getPriceStep(symbol: string) {
  return getPipSize(symbol) / 10;
}

function getPriceDecimals(symbol: string) {
  return symbol.toUpperCase().trim().endsWith("JPY") ? 3 : 5;
}

function roundToStep(value: number, step: number) {
  return Math.round(value / step) * step;
}

function calculateTakeProfit(symbol: string, entryPrice: number, stopLossPrice: number, ratio: TakeProfitRatio) {
  const distance = Math.abs(entryPrice - stopLossPrice);
  const direction = entryPrice >= stopLossPrice ? 1 : -1;
  const step = getPriceStep(symbol);
  return roundToStep(entryPrice + direction * distance * ratio, step);
}

function getQuoteSourceLabel(source: QuoteResponse["source"]) {
  if (source === "api") {
    return "API";
  }

  if (source === "cache") {
    return "cache";
  }

  return "stale cache";
}

interface FetchQuoteForSymbolArgs {
  rawSymbol: string;
  isTakeProfitLocked: boolean;
  takeProfitRatio: TakeProfitRatio;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  setError: React.Dispatch<React.SetStateAction<string>>;
  setQuoteStatus: React.Dispatch<React.SetStateAction<string>>;
  setLoadingQuote: React.Dispatch<React.SetStateAction<boolean>>;
}

async function fetchQuoteForSymbolAndApply({
  rawSymbol,
  isTakeProfitLocked,
  takeProfitRatio,
  setForm,
  setError,
  setQuoteStatus,
  setLoadingQuote,
}: FetchQuoteForSymbolArgs) {
  const symbol = rawSymbol.toUpperCase().trim();

  if (!symbol) {
    setError("Please enter a symbol before fetching a quote.");
    return;
  }

  setLoadingQuote(true);
  setError("");

  try {
    const response = await fetch(`/api/quotes?symbol=${encodeURIComponent(symbol)}`);
    const payload = (await response.json()) as QuoteResponse | { error?: string };

    if (!response.ok) {
      throw new Error("error" in payload ? payload.error : "Could not fetch quote.");
    }

    const quote = payload as QuoteResponse;
    const normalizedPrice = Number(quote.price.toFixed(getPriceDecimals(symbol)));
    setForm((prev) => ({
      ...prev,
      entryPrice: normalizedPrice,
      stopLossPrice: normalizedPrice,
      takeProfitPrice: isTakeProfitLocked
        ? calculateTakeProfit(symbol, normalizedPrice, normalizedPrice, takeProfitRatio)
        : normalizedPrice,
    }));

    const sourceLabel = getQuoteSourceLabel(quote.source);
    setQuoteStatus(`Loaded ${quote.symbol} from ${sourceLabel} at ${new Date(quote.fetchedAt).toLocaleString()}.`);
  } catch (quoteError) {
    const message = quoteError instanceof Error ? quoteError.message : "Could not fetch quote.";
    setError(message);
    setQuoteStatus("");
  } finally {
    setLoadingQuote(false);
  }
}

function useLockedTakeProfitSync({
  isTakeProfitLocked,
  takeProfitRatio,
  setForm,
}: {
  isTakeProfitLocked: boolean;
  takeProfitRatio: TakeProfitRatio;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
}) {
  useEffect(() => {
    if (!isTakeProfitLocked) {
      return;
    }

    setForm((prev) => ({
      ...prev,
      takeProfitPrice: calculateTakeProfit(prev.symbol, prev.entryPrice, prev.stopLossPrice, takeProfitRatio),
    }));
  }, [isTakeProfitLocked, setForm, takeProfitRatio]);
}

function ErrorBanner({ message }: Readonly<{ message: string }>) {
  if (!message) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</section>
  );
}

/* oxlint-disable */
export default function PositionSizeCalculator() {
  const [settings, setSettings] = useState<CalculatorSettings>(defaultSettings);
  const [form, setForm] = useState<FormState>(() => ({
    ...defaultForm,
    accountSize: getInitialAccountSize(),
  }));
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [error, setError] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [quoteStatus, setQuoteStatus] = useState<string>("");
  const [selectedPresetId, setSelectedPresetId] = useState<string>("ftmo-forex");
  const [isDark, setIsDark] = useState(false);
  const [isTakeProfitLocked, setIsTakeProfitLocked] = useState(false);
  const [takeProfitRatio, setTakeProfitRatio] = useState<TakeProfitRatio>(1);
  const didHydrateInitialQuoteRef = useRef(false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("theme");

    if (savedTheme === "dark") {
      setIsDark(true);
      return;
    }

    if (savedTheme === "light") {
      setIsDark(false);
      return;
    }

    setIsDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("theme", isDark ? "dark" : "light");

    const root = document.documentElement;
    root.classList.toggle("theme-dark", isDark);

    return () => {
      root.classList.remove("theme-dark");
    };
  }, [isDark]);

  useEffect(() => {
    window.localStorage.setItem(ACCOUNT_SIZE_STORAGE_KEY, String(form.accountSize));
  }, [form.accountSize]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [settingsResponse, tradesResponse] = await Promise.all([
          fetch("/api/settings"),
          fetch("/api/trades"),
        ]);

        if (settingsResponse.ok) {
          const nextSettings = (await settingsResponse.json()) as CalculatorSettings;
          setSettings(nextSettings);
          setForm((prev) => ({ ...prev, riskPercent: nextSettings.defaultRiskPercent }));
        }

        if (tradesResponse.ok) {
          const nextTrades = (await tradesResponse.json()) as TradeRecord[];
          setTrades(nextTrades);
        }
      } catch {
        setError("Could not load existing calculator data.");
      }
    };

    void loadData();
  }, []);

  const preview = useMemo(() => {
    try {
      return calculatePositionSize({
        accountSize: form.accountSize,
        riskPercent: form.riskPercent,
        entryPrice: form.entryPrice,
        stopLossPrice: form.stopLossPrice,
        pointValuePerLot: form.pointValuePerLot,
        lotSizeUnits: form.lotSizeUnits,
      });
    } catch {
      return null;
    }
  }, [form]);

  const updateEntryPrice = (nextEntryPrice: number) => {
    setForm((prev) => {
      const nextForm: FormState = {
        ...prev,
        entryPrice: nextEntryPrice,
      };

      if (isTakeProfitLocked) {
        nextForm.takeProfitPrice = calculateTakeProfit(prev.symbol, nextEntryPrice, prev.stopLossPrice, takeProfitRatio);
      }

      return nextForm;
    });
  };

  const updateStopLossPrice = (nextStopLossPrice: number) => {
    setForm((prev) => {
      const nextForm: FormState = {
        ...prev,
        stopLossPrice: nextStopLossPrice,
      };

      if (isTakeProfitLocked) {
        nextForm.takeProfitPrice = calculateTakeProfit(prev.symbol, prev.entryPrice, nextStopLossPrice, takeProfitRatio);
      }

      return nextForm;
    });
  };

  const updateTakeProfitPrice = (nextTakeProfitPrice: number) => {
    if (isTakeProfitLocked) {
      return;
    }

    setForm((prev) => ({
      ...prev,
      takeProfitPrice: nextTakeProfitPrice,
    }));
  };

  const handleInputChange = (key: keyof FormState, value: string) => {
    const numericFields: Array<keyof FormState> = [
      "accountSize",
      "riskPercent",
      "entryPrice",
      "stopLossPrice",
      "takeProfitPrice",
      "pointValuePerLot",
      "lotSizeUnits",
    ];

    if (numericFields.includes(key)) {
      const numericValue = Number(value);
      setForm((prev) => ({
        ...prev,
        [key]: Number.isFinite(numericValue) ? numericValue : 0,
      }));
      return;
    }

    setForm((prev) => ({ ...prev, [key]: value }));
  };

  useLockedTakeProfitSync({
    isTakeProfitLocked,
    takeProfitRatio,
    setForm,
  });

  const saveSettings = async () => {
    setSavingSettings(true);
    setError("");

    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Could not save settings.");
      }
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Could not save settings.";
      setError(message);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSubmit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const payload = (await response.json()) as TradeRecord | { error?: string };

      if (!response.ok) {
        throw new Error("error" in payload ? payload.error : "Could not save trade.");
      }

      const nextTrade = payload as TradeRecord;
      setTrades((prev) => [nextTrade, ...prev].slice(0, 50));
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Could not save trade.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const fetchQuote = async () => {
    await fetchQuoteForSymbolAndApply({
      rawSymbol: form.symbol,
      isTakeProfitLocked,
      takeProfitRatio,
      setForm,
      setError,
      setQuoteStatus,
      setLoadingQuote,
    });
  };

  const fetchQuoteForSymbol = async (rawSymbol: string) => {
    await fetchQuoteForSymbolAndApply({
      rawSymbol,
      isTakeProfitLocked,
      takeProfitRatio,
      setForm,
      setError,
      setQuoteStatus,
      setLoadingQuote,
    });
  };

  useEffect(() => {
    if (didHydrateInitialQuoteRef.current) {
      return;
    }

    didHydrateInitialQuoteRef.current = true;
    void fetchQuoteForSymbol(form.symbol);
  }, [form.symbol]);

  const setTakeProfitByRatio = (ratio: number) => {
    const nextRatio = ratio as TakeProfitRatio;
    setTakeProfitRatio(nextRatio);

    if (!isTakeProfitLocked) {
      return;
    }

    const distance = Math.abs(form.entryPrice - form.stopLossPrice);

    if (!Number.isFinite(distance) || distance <= 0) {
      setError("Set Entry and Stop Loss first to use risk/reward shortcuts.");
      return;
    }

    const target = calculateTakeProfit(form.symbol, form.entryPrice, form.stopLossPrice, nextRatio);

    setError("");
    handleInputChange("takeProfitPrice", String(target));
  };

  const adjustStopLossByPips = (pips: number) => {
    const pipSize = getPipSize(form.symbol);
    const step = getPriceStep(form.symbol);
    const nextValue = roundToStep(form.stopLossPrice + pips * pipSize, step);

    updateStopLossPrice(nextValue);
  };

  const applyPropFirmPreset = (presetId: string) => {
    setSelectedPresetId(presetId);

    if (presetId === "custom") {
      return;
    }

    const preset = propFirmPresets.find((item) => item.id === presetId);

    if (!preset) {
      return;
    }

    setForm((prev) => ({
      ...prev,
      lotSizeUnits: preset.lotSizeUnits,
      pointValuePerLot: preset.pointValuePerLot,
    }));
  };

  const copyPositionSizeLots = async (value: number) => {
    try {
      await navigator.clipboard.writeText(formatNumber(value, 4));
    } catch {
      // Copy is best-effort; the preview still remains usable if clipboard access is blocked.
    }
  };

  const copyPriceValue = async (value: number, symbol: string) => {
    try {
      await navigator.clipboard.writeText(value.toFixed(getPriceDecimals(symbol)));
    } catch {
      // Copy is best-effort; the control still remains usable if clipboard access is blocked.
    }
  };

  const handleTakeProfitLockChange = (checked: boolean) => {
    setIsTakeProfitLocked(checked);

    if (checked) {
      setTakeProfitRatio(1);
      setForm((prev) => ({
        ...prev,
        takeProfitPrice: calculateTakeProfit(prev.symbol, prev.entryPrice, prev.stopLossPrice, 1),
      }));
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Position Size Calculator</h1>
            <p className="mt-2 text-sm text-slate-600">
              Calculate risk-based position size and keep the latest 50 calculations in JSON storage.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            onClick={() => setIsDark((prev) => !prev)}
          >
            {isDark ? "Light Mode" : "Dark Mode"}
          </button>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-5 sm:grid-cols-2">
            <section className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Market</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Symbol</span>
                  <CurrencyPairAutocomplete
                    value={form.symbol}
                    onChange={(value) => {
                      const normalizedSymbol = value.toUpperCase();
                      handleInputChange("symbol", normalizedSymbol);
                      void fetchQuoteForSymbol(normalizedSymbol);
                    }}
                  />
                  <button
                    type="button"
                    className="mt-2 rounded-lg border border-slate-300 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                    onClick={fetchQuote}
                    disabled={loadingQuote}
                  >
                    {loadingQuote ? "Fetching quote..." : "Fetch latest quote"}
                  </button>
                  {quoteStatus ? <span className="text-xs text-slate-500">{quoteStatus}</span> : null}
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Entry Price</span>
                  <input
                    className="rounded-lg border border-slate-300 px-3 py-2"
                    type="number"
                    step={String(getPriceStep(form.symbol))}
                    value={form.entryPrice}
                    onChange={(event) => updateEntryPrice(Number(event.target.value))}
                  />
                </label>

                <label className="sm:col-span-2 flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Stop Loss Price</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-slate-700 hover:bg-slate-100"
                      onClick={() => copyPriceValue(form.stopLossPrice, form.symbol)}
                      aria-label={`Copy stop loss price ${form.stopLossPrice.toFixed(getPriceDecimals(form.symbol))}`}
                    >
                      <Copy size={14} />
                    </button>
                    <input
                      className="w-28 min-w-0 rounded-lg border border-slate-300 px-3 py-2"
                      type="number"
                      step={String(getPriceStep(form.symbol))}
                      value={form.stopLossPrice}
                      onChange={(event) => handleInputChange("stopLossPrice", event.target.value)}
                      onKeyDown={(event) => {
                        if (!event.ctrlKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) {
                          return;
                        }

                        event.preventDefault();
                        adjustStopLossByPips(event.key === "ArrowUp" ? 10 : -10);
                      }}
                    />
                    <div className="flex flex-1 items-center justify-between gap-2">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-slate-300 px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          onClick={() => adjustStopLossByPips(10)}
                        >
                          &uarr; 10
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-slate-300 px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          onClick={() => adjustStopLossByPips(30)}
                        >
                          &uArr; 30
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-slate-300 px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          onClick={() => adjustStopLossByPips(-10)}
                        >
                          &darr; 10
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-slate-300 px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          onClick={() => adjustStopLossByPips(-30)}
                        >
                          &dArr; 30
                        </button>
                      </div>
                    </div>
                  </div>
                </label>

                <label className="sm:col-span-2 flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Take Profit (optional)</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-slate-700 hover:bg-slate-100"
                      onClick={() => copyPriceValue(typeof form.takeProfitPrice === "number" ? form.takeProfitPrice : form.entryPrice, form.symbol)}
                      aria-label={`Copy take profit price ${(typeof form.takeProfitPrice === "number" ? form.takeProfitPrice : form.entryPrice).toFixed(getPriceDecimals(form.symbol))}`}
                    >
                      <Copy size={14} />
                    </button>
                    <input
                      className="w-28 min-w-0 rounded-lg border border-slate-300 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                      type="number"
                      step={String(getPriceStep(form.symbol))}
                      value={form.takeProfitPrice ?? ""}
                      onChange={(event) => updateTakeProfitPrice(Number(event.target.value))}
                      disabled={isTakeProfitLocked}
                      onKeyDown={(event) => {
                        if (isTakeProfitLocked) {
                          return;
                        }

                        if (!event.ctrlKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) {
                          return;
                        }

                        event.preventDefault();

                        const pipSize = getPipSize(form.symbol);
                        const delta = 10 * pipSize;
                        const currentTakeProfit = typeof form.takeProfitPrice === "number" ? form.takeProfitPrice : form.entryPrice;
                        const nextValue = event.key === "ArrowUp" ? currentTakeProfit + delta : currentTakeProfit - delta;

                        updateTakeProfitPrice(roundToStep(nextValue, pipSize));
                      }}
                    />
                    <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={isTakeProfitLocked}
                        onChange={(event) => handleTakeProfitLockChange(event.target.checked)}
                      />
                      <span>Lock</span>
                    </div>
                    <div className="grid flex-1 grid-cols-3 gap-2">
                      <button
                        type="button"
                        className={`rounded-lg border px-2 py-2 text-xs font-medium hover:bg-slate-100 ${isTakeProfitLocked && takeProfitRatio === 1 ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-300 text-slate-700"}`}
                        aria-pressed={isTakeProfitLocked && takeProfitRatio === 1}
                        onClick={() => setTakeProfitByRatio(1)}
                      >
                        1:1
                      </button>
                      <button
                        type="button"
                        className={`rounded-lg border px-2 py-2 text-xs font-medium hover:bg-slate-100 ${isTakeProfitLocked && takeProfitRatio === 2 ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-300 text-slate-700"}`}
                        aria-pressed={isTakeProfitLocked && takeProfitRatio === 2}
                        onClick={() => setTakeProfitByRatio(2)}
                      >
                        1:2
                      </button>
                      <button
                        type="button"
                        className={`rounded-lg border px-2 py-2 text-xs font-medium hover:bg-slate-100 ${isTakeProfitLocked && takeProfitRatio === 3 ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-300 text-slate-700"}`}
                        aria-pressed={isTakeProfitLocked && takeProfitRatio === 3}
                        onClick={() => setTakeProfitByRatio(3)}
                      >
                        1:3
                      </button>
                    </div>
                  </div>
                </label>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Risk</h3>
              <div className="mt-3 grid gap-4">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Account Size ({settings.accountCurrency})</span>
                  <AccountSizeDropdown
                    value={form.accountSize}
                    onChange={(value) => handleInputChange("accountSize", String(value))}
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Risk %</span>
                  <input
                    className="rounded-lg border border-slate-300 px-3 py-2"
                    type="number"
                    step="0.01"
                    value={form.riskPercent}
                    onChange={(event) => handleInputChange("riskPercent", event.target.value)}
                  />
                </label>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Contract</h3>
              <div className="mt-3 grid gap-4">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Prop Firm Preset</span>
                  <select
                    className="rounded-lg border border-slate-300 px-3 py-2"
                    value={selectedPresetId}
                    onChange={(event) => applyPropFirmPreset(event.target.value)}
                  >
                    {propFirmPresets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                    <option value="custom">Custom</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Point Value Per Lot</span>
                  <input
                    className="rounded-lg border border-slate-300 px-3 py-2"
                    type="number"
                    step="0.01"
                    value={form.pointValuePerLot}
                    onChange={(event) => {
                      setSelectedPresetId("custom");
                      handleInputChange("pointValuePerLot", event.target.value);
                    }}
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Lot Size Units</span>
                  <input
                    className="rounded-lg border border-slate-300 px-3 py-2"
                    type="number"
                    step="1"
                    value={form.lotSizeUnits}
                    onChange={(event) => {
                      setSelectedPresetId("custom");
                      handleInputChange("lotSizeUnits", event.target.value);
                    }}
                  />
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Live Preview</h2>
              {!preview ? (
                <p className="mt-3 text-sm text-rose-600">Please provide valid values to calculate.</p>
              ) : (
                <dl className="mt-3 space-y-2 text-sm text-slate-700">
                  <div className="flex justify-between gap-4">
                    <dt>Risk Amount</dt>
                    <dd>
                      {settings.accountCurrency} {formatNumber(preview.riskAmount, 2)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Stop Distance</dt>
                    <dd>{formatNumber(preview.stopDistance, 6)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 font-semibold text-slate-900">
                    <dt>Position Size (Lots)</dt>
                    <dd>
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        onClick={() => copyPositionSizeLots(preview.positionSizeLots)}
                        aria-label={`Copy position size lots ${formatNumber(preview.positionSizeLots, 4)}`}
                      >
                        <Copy size={14} />
                        <span>{formatNumber(preview.positionSizeLots, 4)}</span>
                      </button>
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Position Size (Units)</dt>
                    <dd>{formatNumber(preview.positionSizeUnits, 0)}</dd>
                  </div>
                </dl>
              )}
            </section>

            <section className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Notes</h3>
              <label className="mt-3 flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Trade Notes (optional)</span>
                <textarea
                  className="min-h-24 rounded-lg border border-slate-300 px-3 py-2"
                  value={form.notes}
                  onChange={(event) => handleInputChange("notes", event.target.value)}
                />
              </label>
            </section>
        </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
              disabled={saving}
            >
              {saving ? "Saving..." : "Calculate and Save"}
            </button>
          </div>
        </form>

        <div className="space-y-6">
          <HourlyCandlesChart
            symbol={form.symbol}
            isDark={isDark}
            isTakeProfitLocked={isTakeProfitLocked}
            entryPrice={form.entryPrice}
            stopLossPrice={form.stopLossPrice}
            takeProfitPrice={typeof form.takeProfitPrice === "number" ? form.takeProfitPrice : form.entryPrice}
            onEntryChange={updateEntryPrice}
            onStopLossChange={updateStopLossPrice}
            onTakeProfitChange={updateTakeProfitPrice}
          />

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Settings</h2>
            <div className="mt-4 grid gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Account Currency</span>
                <input
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  value={settings.accountCurrency}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, accountCurrency: event.target.value.toUpperCase() }))
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Default Risk %</span>
                <input
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  type="number"
                  step="0.01"
                  value={settings.defaultRiskPercent}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, defaultRiskPercent: Number(event.target.value) }))
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Max Open Risk %</span>
                <input
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  type="number"
                  step="0.01"
                  value={settings.maxOpenRiskPercent}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, maxOpenRiskPercent: Number(event.target.value) }))
                  }
                />
              </label>
            </div>
            <button
              type="button"
              className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              onClick={saveSettings}
              disabled={savingSettings}
            >
              {savingSettings ? "Saving..." : "Save Settings"}
            </button>
          </section>
        </div>
      </section>

      <ErrorBanner message={error} />

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Recent Calculations</h2>
        {trades.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No saved calculations yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Symbol</th>
                  <th className="px-3 py-2">Risk</th>
                  <th className="px-3 py-2">Stop Distance</th>
                  <th className="px-3 py-2">Lots</th>
                  <th className="px-3 py-2">Units</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trades.map((trade) => (
                  <tr key={trade.id}>
                    <td className="px-3 py-2 text-slate-500">{new Date(trade.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">{trade.symbol}</td>
                    <td className="px-3 py-2">
                      {settings.accountCurrency} {formatNumber(trade.riskAmount, 2)} ({formatNumber(trade.riskPercent, 2)}%)
                    </td>
                    <td className="px-3 py-2">{formatNumber(trade.stopDistance, 6)}</td>
                    <td className="px-3 py-2 font-semibold text-slate-900">{formatNumber(trade.positionSizeLots, 4)}</td>
                    <td className="px-3 py-2">{formatNumber(trade.positionSizeUnits, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
/* oxlint-enable */
