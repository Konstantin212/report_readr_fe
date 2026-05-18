import Decimal from "decimal.js";
import { classifySector } from "./sector-map";

export type SectorContribution = {
  sector: string;
  pctOfTotal: number;
  valueEur: number;
  topSymbols: string[];
};

export function computeSectorContribution(
  positions: { symbol: string; marketEur: number | null }[],
): SectorContribution[] {
  const sectorMap = new Map<
    string,
    { total: Decimal; symbols: { symbol: string; value: Decimal }[] }
  >();

  for (const p of positions) {
    if (p.marketEur === null) continue;
    const sector = classifySector(p.symbol);
    if (!sectorMap.has(sector)) {
      sectorMap.set(sector, { total: new Decimal(0), symbols: [] });
    }
    const entry = sectorMap.get(sector)!;
    entry.total = entry.total.plus(p.marketEur);
    entry.symbols.push({ symbol: p.symbol, value: new Decimal(p.marketEur) });
  }

  if (sectorMap.size === 0) return [];

  const grandTotal = [...sectorMap.values()].reduce(
    (a, b) => a.plus(b.total),
    new Decimal(0),
  );

  const result: SectorContribution[] = [];
  for (const [sector, { total, symbols }] of sectorMap) {
    const pctOfTotal = grandTotal.isZero()
      ? 0
      : total.div(grandTotal).mul(100).toDecimalPlaces(1).toNumber();
    const topSymbols = [...symbols]
      .sort((a, b) => b.value.minus(a.value).toNumber())
      .slice(0, 3)
      .map((s) => s.symbol);
    result.push({ sector, pctOfTotal, valueEur: total.toNumber(), topSymbols });
  }

  return result.sort((a, b) => b.valueEur - a.valueEur);
}
