export interface CalculatorSettings {
  accountCurrency: string;
  defaultRiskPercent: number;
  maxOpenRiskPercent: number;
}

export interface TradeRecord {
  id: string;
  createdAt: string;
  symbol: string;
  accountSize: number;
  riskPercent: number;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice?: number;
  pointValuePerLot: number;
  lotSizeUnits: number;
  stopDistance: number;
  riskAmount: number;
  positionSizeLots: number;
  positionSizeUnits: number;
  notes?: string;
}
