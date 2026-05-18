import Decimal from "decimal.js";
import type { Lot } from "./replay";

export type Position = { symbol: string; quantity: string; costEur: string };

export function derivePositions(lots: Lot[]): Position[] {
  const map = new Map<string, { qty: Decimal; cost: Decimal }>();
  for (const l of lots) {
    const acc = map.get(l.symbol) ?? { qty: new Decimal(0), cost: new Decimal(0) };
    acc.qty = acc.qty.plus(l.remainingQty);
    acc.cost = acc.cost.plus(l.costEur);
    map.set(l.symbol, acc);
  }
  return [...map.entries()].map(([symbol, { qty, cost }]) => ({
    symbol, quantity: qty.toString(), costEur: cost.toFixed(2),
  }));
}
