import Decimal from "decimal.js";
import type { Lot } from "./replay";

export type Position = { symbol: string; isin?: string; quantity: string; costEur: string };

export function derivePositions(lots: Lot[]): Position[] {
  const map = new Map<string, { qty: Decimal; cost: Decimal; symbol: string; isin?: string }>();
  for (const l of lots) {
    const key = l.isin ?? l.symbol;
    const acc = map.get(key) ?? { qty: new Decimal(0), cost: new Decimal(0), symbol: l.symbol, isin: l.isin };
    acc.qty = acc.qty.plus(l.remainingQty);
    acc.cost = acc.cost.plus(l.costEur);
    // Keep the latest symbol seen (lots come in order)
    acc.symbol = l.symbol;
    acc.isin = l.isin ?? acc.isin;
    map.set(key, acc);
  }
  return [...map.values()].map(({ symbol, isin, qty, cost }) => ({
    symbol,
    isin,
    quantity: qty.toString(),
    costEur: cost.toFixed(2),
  }));
}
