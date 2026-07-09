import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { readJsonFile, writeJsonFile } from "@/lib/json-store";
import { calculatePositionSize } from "@/lib/position-size";
import type { TradeRecord } from "@/types/calculator";

export const runtime = "nodejs";

const TRADES_FILE = "trades.json";

export async function GET() {
  const trades = await readJsonFile<TradeRecord[]>(TRADES_FILE, []);
  return NextResponse.json(trades);
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<TradeRecord>;

  if (!body.symbol || !body.accountSize || !body.riskPercent || !body.entryPrice || !body.stopLossPrice || !body.pointValuePerLot || !body.lotSizeUnits) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  try {
    const result = calculatePositionSize({
      accountSize: body.accountSize,
      riskPercent: body.riskPercent,
      entryPrice: body.entryPrice,
      stopLossPrice: body.stopLossPrice,
      pointValuePerLot: body.pointValuePerLot,
      lotSizeUnits: body.lotSizeUnits,
    });

    const trades = await readJsonFile<TradeRecord[]>(TRADES_FILE, []);

    const trade: TradeRecord = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      symbol: body.symbol,
      accountSize: body.accountSize,
      riskPercent: body.riskPercent,
      entryPrice: body.entryPrice,
      stopLossPrice: body.stopLossPrice,
      takeProfitPrice: body.takeProfitPrice,
      pointValuePerLot: body.pointValuePerLot,
      lotSizeUnits: body.lotSizeUnits,
      stopDistance: result.stopDistance,
      riskAmount: result.riskAmount,
      positionSizeLots: result.positionSizeLots,
      positionSizeUnits: result.positionSizeUnits,
      notes: body.notes,
    };

    const nextTrades = [trade, ...trades].slice(0, 50);
    await writeJsonFile(TRADES_FILE, nextTrades);

    return NextResponse.json(trade);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Calculation failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
