import Decimal from "decimal.js";

/**
 * Returns TTM dividend yield on cost basis as a fraction (e.g. 0.025 not 2.5%).
 * Returns 0 if cost basis is 0.
 */
export function yieldOnCost(
  ttmDividendsEur: number,
  totalCostBasisEur: number,
): number {
  if (totalCostBasisEur === 0) return 0;
  return new Decimal(ttmDividendsEur).div(totalCostBasisEur).toNumber();
}
