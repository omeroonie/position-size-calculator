export interface PositionSizeInput {
  accountSize: number;
  riskPercent: number;
  entryPrice: number;
  stopLossPrice: number;
  pointValuePerLot: number;
  lotSizeUnits: number;
}

export interface PositionSizeOutput {
  stopDistance: number;
  riskAmount: number;
  positionSizeLots: number;
  positionSizeUnits: number;
}

export function calculatePositionSize(input: PositionSizeInput): PositionSizeOutput {
  const stopDistance = Math.abs(input.entryPrice - input.stopLossPrice);

  if (stopDistance <= 0) {
    throw new Error("Entry price and stop loss must be different.");
  }

  if (input.accountSize <= 0 || input.riskPercent <= 0 || input.pointValuePerLot <= 0 || input.lotSizeUnits <= 0) {
    throw new Error("Account size, risk percent, point value, and lot size must be greater than zero.");
  }

  const riskAmount = input.accountSize * (input.riskPercent / 100);
  const positionSizeLots = riskAmount / (stopDistance * input.pointValuePerLot);
  const positionSizeUnits = positionSizeLots * input.lotSizeUnits;

  return {
    stopDistance,
    riskAmount,
    positionSizeLots,
    positionSizeUnits,
  };
}
