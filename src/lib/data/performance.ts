import { eq } from "drizzle-orm";
import Decimal from "decimal.js";
import { getDb } from "@/lib/db/client";
import {
  brokerAccounts, lots, realizedMatches, fxRates, quoteHistory,
} from "@/lib/db/schema";
import { classifySector } from "@/lib/analytics/sector-map";
import { computeEquityCurve } from "@/lib/analytics/equity-curve";
import { alignBenchmarkToCurve, indexToBaseline } from "@/lib/analytics/benchmark";
import { monthlyReturns, periodReturn, twr, annualizedTwr } from "@/lib/analytics/returns";
import { volatility, sharpe, beta, maxDrawdown } from "@/lib/analytics/risk";
import { buildMonthlyHeatmap, type HeatmapRow } from "@/lib/analytics/monthly-heatmap";

export type Range = "1M" | "3M" | "6M" | "YTD" | "1Y" | "2Y" | "ALL";

export type PerformanceData = {
  hero: {
    portfolioReturnPct: number | null;
    benchmarkReturnPct: number | null;
    alphaPct: number | null;
    outperforming: boolean;
    label: string;
  };
  equityCurve: { dates: string[]; portfolio: number[]; benchmark: number[] };
  metrics: {
    twrPct: number | null;
    mwrPct: number | null;
    volatilityPct: number | null;
    drawdownPct: number | null;
    sharpe: number | null;
    beta: number | null;
  };
  heatmap: HeatmapRow[];
  sectorContribution: { sector: string; pctOfTotal: number; valueEur: number; topSymbols: string[] }[];
  realizedTotalsEur: number;
  matchCount: number;
};

const MS_PER_DAY = 86_400_000;

export async function getPerformanceData(
  ownerUserId: string,
  broker: "all" | "ff" | "ibkr" = "all",
  range: Range = "2Y",
): Promise<PerformanceData> {
  const db = getDb();

  const accountFilter = broker === "all" ? null : broker === "ff" ? "FREEDOM_FINANCE" : "INTERACTIVE_BROKERS";
  const accountRows = await db.select().from(brokerAccounts).where(eq(brokerAccounts.ownerUserId, ownerUserId));
  const accountIds = accountFilter
    ? accountRows.filter(a => a.broker === accountFilter).map(a => a.id)
    : accountRows.map(a => a.id);
  const accountIdsSet = new Set(accountIds);

  const allLots = await db.select().from(lots).where(eq(lots.ownerUserId, ownerUserId));
  const filteredLots = accountFilter ? allLots.filter(l => accountIdsSet.has(l.brokerAccountId)) : allLots;
  const allMatches = await db.select().from(realizedMatches).where(eq(realizedMatches.ownerUserId, ownerUserId));
  const filteredMatches = accountFilter ? allMatches.filter(m => accountIdsSet.has(m.brokerAccountId)) : allMatches;
  const allHistory = await db.select().from(quoteHistory);
  const allFx = await db.select().from(fxRates);

  // Build holdings by symbol (aggregated across all broker accounts in filter)
  const qtyBySymbol = new Map<string, Decimal>();
  const costBySymbol = new Map<string, Decimal>();
  for (const l of filteredLots) {
    qtyBySymbol.set(l.symbol, (qtyBySymbol.get(l.symbol) ?? new Decimal(0)).plus(l.remainingQty));
    costBySymbol.set(l.symbol, (costBySymbol.get(l.symbol) ?? new Decimal(0)).plus(l.costEur));
  }

  // History indexes
  const histBySymbol = new Map<string, Array<{ date: string; close: number; currency: string }>>();
  for (const h of allHistory) {
    if (!histBySymbol.has(h.symbol)) histBySymbol.set(h.symbol, []);
    histBySymbol.get(h.symbol)!.push({ date: h.date, close: Number(h.close), currency: h.currency });
  }
  for (const arr of histBySymbol.values()) arr.sort((a, b) => a.date.localeCompare(b.date));
  const currencyBySymbol = new Map<string, string>();
  for (const [sym, arr] of histBySymbol) currencyBySymbol.set(sym, arr[arr.length - 1]?.currency ?? "EUR");

  // ----- 1. Determine month-end series for the requested range
  const now = new Date();
  const monthEnds: string[] = [];
  const rangeMonths: Record<Range, number> = { "1M": 1, "3M": 3, "6M": 6, YTD: monthsSinceYearStart(now), "1Y": 12, "2Y": 24, ALL: 24 };
  const months = Math.max(1, rangeMonths[range]);
  for (let i = months; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    monthEnds.push(d.toISOString().slice(0, 10));
  }

  // Build holdings (constant — current holdings replayed; v3: real lot snapshots)
  const holdings: Record<string, Record<string, number>> = {};
  for (const me of monthEnds) {
    holdings[me] = {};
    for (const [sym, qty] of qtyBySymbol) holdings[me][sym] = Number(qty);
  }
  const closesBySymbolDate = new Map<string, number>();
  for (const sym of histBySymbol.keys()) {
    const arr = histBySymbol.get(sym)!;
    for (const me of monthEnds) {
      let pick: { date: string; close: number } | undefined;
      for (const h of arr) {
        if (h.date <= me) pick = h;
        else break;
      }
      if (pick) closesBySymbolDate.set(`${sym}|${me}`, pick.close);
    }
  }
  const fxMap = new Map<string, number>();
  for (const me of monthEnds) {
    for (const cur of new Set(currencyBySymbol.values())) {
      if (cur === "EUR") continue;
      const arr = allFx.filter(r => r.fromCurrency === cur && r.date <= me).sort((a, b) => b.date.localeCompare(a.date));
      if (arr[0]) fxMap.set(`${me}|${cur}`, Number(arr[0].rate));
    }
  }

  const curve = computeEquityCurve({
    monthEnds,
    holdings,
    closesBySymbolDate,
    currencyBySymbol,
    fxRates: fxMap,
  });

  let equityDates: string[] = [];
  let equityPortfolio: number[] = [];
  let equityBenchmark: number[] = [];
  if (curve.length > 0) {
    equityDates = curve.map(p => p.date);
    const values = curve.map(p => p.valueEur);
    const indexed = indexToBaseline(values, equityDates, 100);
    equityPortfolio = indexed.values;

    const benchArr = histBySymbol.get("^GSPC");
    if (benchArr && benchArr.length > 0) {
      const benchPicked: { date: string; close: number }[] = [];
      for (const me of monthEnds) {
        let pick: { date: string; close: number } | undefined;
        for (const h of benchArr) {
          if (h.date <= me) pick = h;
          else break;
        }
        if (pick) benchPicked.push({ date: me, close: pick.close });
      }
      if (benchPicked.length > 0) {
        const aligned = alignBenchmarkToCurve(
          equityDates.map((d, i) => ({ date: d, valueEur: equityPortfolio[i] })),
          benchPicked,
        );
        equityBenchmark = aligned.values;
      }
    }
  }

  // ----- 2. Metrics
  const portReturn = equityPortfolio.length > 1 ? periodReturn(equityPortfolio) : null;
  const benchReturn = equityBenchmark.length > 1 ? periodReturn(equityBenchmark) : null;
  const alpha = portReturn !== null && benchReturn !== null ? portReturn - benchReturn : null;

  const portMonthly = monthlyReturns(equityPortfolio);
  const benchMonthly = monthlyReturns(equityBenchmark);
  const periodDays = equityDates.length > 1
    ? Math.max(1, (Date.parse(equityDates[equityDates.length - 1]) - Date.parse(equityDates[0])) / MS_PER_DAY)
    : 0;
  const twrCum = portMonthly.length > 0 ? twr(portMonthly) : 0;
  const twrAnn = periodDays > 0 ? annualizedTwr(twrCum, periodDays) : 0;
  const vol = portMonthly.length > 1 ? volatility(portMonthly) : 0;
  const sharpeVal = vol > 0 ? sharpe(twrAnn, vol, 0) : 0;
  const betaVal = portMonthly.length > 1 && benchMonthly.length > 1 ? beta(portMonthly, benchMonthly) : null;
  const drawdown = equityPortfolio.length > 1 ? maxDrawdown(equityPortfolio) : 0;

  // ----- 3. Heatmap (24 months)
  const heatmap = buildMonthlyHeatmap(curve);

  // ----- 4. Sector contribution from current positions × P/L
  // P/L per symbol = market - cost. Need latest close per symbol (use last history point).
  const sectorAgg = new Map<string, { value: number; pl: number; symbols: { symbol: string; value: number }[] }>();
  let totalMarketAll = 0;
  for (const [sym, qty] of qtyBySymbol) {
    const cost = Number(costBySymbol.get(sym) ?? 0);
    const arr = histBySymbol.get(sym);
    if (!arr || arr.length === 0) continue;
    const last = arr[arr.length - 1];
    const fxRow = last.currency === "EUR" ? 1 : Number(allFx.filter(r => r.fromCurrency === last.currency && r.date <= last.date).sort((a, b) => b.date.localeCompare(a.date))[0]?.rate ?? 0);
    if (last.currency !== "EUR" && fxRow === 0) continue;
    const marketEur = Number(qty) * last.close / fxRow;
    const pl = marketEur - cost;
    totalMarketAll += marketEur;
    const sec = classifySector(sym);
    const cur = sectorAgg.get(sec) ?? { value: 0, pl: 0, symbols: [] };
    cur.value += marketEur;
    cur.pl += pl;
    cur.symbols.push({ symbol: sym, value: marketEur });
    sectorAgg.set(sec, cur);
  }
  const sectorContribution = [...sectorAgg.entries()]
    .map(([sector, { value, pl, symbols }]) => ({
      sector,
      pctOfTotal: totalMarketAll > 0 ? (pl / totalMarketAll) * 100 : 0,
      valueEur: value,
      topSymbols: symbols.sort((a, b) => b.value - a.value).slice(0, 3).map(s => s.symbol),
    }))
    .sort((a, b) => Math.abs(b.pctOfTotal) - Math.abs(a.pctOfTotal));

  // ----- 5. Hero numbers
  const label = `${equityDates[0] ?? "—"} → present`;

  return {
    hero: {
      portfolioReturnPct: portReturn !== null ? portReturn * 100 : null,
      benchmarkReturnPct: benchReturn !== null ? benchReturn * 100 : null,
      alphaPct: alpha !== null ? alpha * 100 : null,
      outperforming: alpha !== null && alpha > 0,
      label,
    },
    equityCurve: { dates: equityDates, portfolio: equityPortfolio, benchmark: equityBenchmark },
    metrics: {
      twrPct: portMonthly.length > 0 ? twrAnn * 100 : null,
      mwrPct: null, // v2: omit MWR; needs cashflow data not yet wired
      volatilityPct: vol > 0 ? vol * 100 : null,
      drawdownPct: equityPortfolio.length > 1 ? drawdown * 100 : null,
      sharpe: vol > 0 ? sharpeVal : null,
      beta: betaVal,
    },
    heatmap,
    sectorContribution,
    realizedTotalsEur: filteredMatches.reduce((s, m) => s + Number(m.gainEur), 0),
    matchCount: filteredMatches.length,
  };
}

function monthsSinceYearStart(d: Date): number {
  return d.getMonth() + 1;
}
