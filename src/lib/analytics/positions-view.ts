import type { PositionRow, PositionsData } from "@/lib/data/positions";
import type { PnlMode } from "@/components/pulse/pnl-mode";

export type PositionSort = "value" | "gain" | "az";

/**
 * Sorts a copy of `rows` for the positions table. Never mutates the
 * input array. "gain" reads P/L via the active `mode`'s view so the
 * ordering follows whichever P/L basis the user has toggled.
 */
export function sortRows(rows: PositionRow[], sort: PositionSort, mode: PnlMode): PositionRow[] {
  const copy = [...rows];
  if (sort === "az") {
    copy.sort((a, b) => a.symbol.localeCompare(b.symbol));
    return copy;
  }
  const key = (r: PositionRow) => (sort === "value" ? (r.marketEur ?? 0) : (r.views[mode].plEur ?? 0));
  copy.sort((a, b) => key(b) - key(a));
  return copy;
}

/**
 * Portfolio-level hero summary: total market value, total P/L (net
 * mode), and P/L as a percentage of cost (market − pl). `plPct` is
 * null when cost is zero or negative to avoid a divide-by-zero /
 * meaningless percentage.
 */
export function heroSummary(d: PositionsData): { marketEur: number; plEur: number; plPct: number | null } {
  const marketEur = d.totalMarketEur;
  const plEur = d.totalPlEur;
  const cost = marketEur - plEur;
  return { marketEur, plEur, plPct: cost > 0 ? (plEur / cost) * 100 : null };
}

/**
 * Aggregates market value per sector across all `rowsByKind` groups,
 * sorted descending by value, with each bucket's share of total.
 */
export function sectorAllocation(d: PositionsData): { name: string; value: number; pct: number }[] {
  const all = [...d.rowsByKind.stock, ...d.rowsByKind.etf, ...d.rowsByKind.bond, ...d.rowsByKind.other];
  const bySector = new Map<string, number>();
  for (const r of all) bySector.set(r.sector, (bySector.get(r.sector) ?? 0) + (r.marketEur ?? 0));
  const total = [...bySector.values()].reduce((s, v) => s + v, 0);
  return [...bySector.entries()]
    .map(([name, value]) => ({ name, value, pct: total > 0 ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}
