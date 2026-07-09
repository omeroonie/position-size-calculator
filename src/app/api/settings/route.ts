import { NextResponse } from "next/server";

import { readJsonFile, writeJsonFile } from "@/lib/json-store";
import type { CalculatorSettings } from "@/types/calculator";

export const runtime = "nodejs";

const SETTINGS_FILE = "settings.json";

const defaultSettings: CalculatorSettings = {
  accountCurrency: "USD",
  defaultRiskPercent: 1,
  maxOpenRiskPercent: 5,
};

export async function GET() {
  const settings = await readJsonFile<CalculatorSettings>(SETTINGS_FILE, defaultSettings);
  return NextResponse.json(settings);
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<CalculatorSettings>;

  const nextSettings: CalculatorSettings = {
    accountCurrency: body.accountCurrency ?? defaultSettings.accountCurrency,
    defaultRiskPercent: body.defaultRiskPercent ?? defaultSettings.defaultRiskPercent,
    maxOpenRiskPercent: body.maxOpenRiskPercent ?? defaultSettings.maxOpenRiskPercent,
  };

  if (nextSettings.defaultRiskPercent <= 0 || nextSettings.maxOpenRiskPercent <= 0) {
    return NextResponse.json({ error: "Risk values must be greater than zero." }, { status: 400 });
  }

  await writeJsonFile(SETTINGS_FILE, nextSettings);
  return NextResponse.json(nextSettings);
}
