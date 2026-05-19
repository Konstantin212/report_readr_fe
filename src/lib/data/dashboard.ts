import { eq } from "drizzle-orm";
import Decimal from "decimal.js";
import { getDb } from "@/lib/db/client";
import {
  lots, realizedMatches, transactions,
  quoteCache, quoteHistory, fxRates, brokerAccounts, instruments,
} from "@/lib/db/schema";
import { classifySector } from "@/lib/analytics/sector-map";
import { computeCurrencyExposure } from "@/lib/analytics/currency-exposure";
import { computeEquityCurve } from "@/lib/analytics/equity-curve";
import { alignBenchmarkToCurve, indexToBaseline } from "@/lib/analytics/benchmark";

export type DashboardData = {
  hero: {
    valueEur: number;
    dayChangeEur: number | null;
    dayChangePct: number | null;
    totalReturnEur: number;
    totalReturnPct: number | null;
    positionCount: number;
    cashEur: number;
    broker: "all" | "ff" | "ibkr";
    asOf: string | null;
  };
  tiles: {
    unrealizedEur: number;
    unrealizedPct: number | null;
    realizedYtdEur: number;
  };
  equityCurve: { dates: string[]; portfolio: number[]; benchmark: number[] };
  allocation: { name: string; pct: number; value: number }[];
  currency: { code: string; pct: number; flag?: string; valueEur: number }[];
  dividendsYtd: { totalEur: number; whtEur: number; monthly: number[]; months: string[] };
  topPositions: {
    symbol: string;
    broker: string;
    marketEur: number;
    name?: string;
    // Same shape as the Positions table for toggle consistency. The
    // dashboard's simpler cost calc doesn't separate fees out yet, so
    // both views currently carry identical numbers — the toggle is a
    // no-op here. The positions page is the canonical view.
    views: {
      broker: { plEur: number | null; plPct: number | null };
      net:    { plEur: number | null; plPct: number | null };
    };
  }[];
};

export async function getDashboardData(ownerUserId: string, broker: "all" | "ff" | "ibkr" = "all"): Promise<DashboardData> {
  const db = getDb();

  // ----- 1. resolve broker filter to a list of brokerAccountIds (or null = all)
  const accountFilter = broker === "all" ? null : broker === "ff" ? "FREEDOM_FINANCE" : "INTERACTIVE_BROKERS";
  const accountRows = await db.select().from(brokerAccounts).where(eq(brokerAccounts.ownerUserId, ownerUserId));
  const accountIds = accountFilter
    ? accountRows.filter(a => a.broker === accountFilter).map(a => a.id)
    : accountRows.map(a => a.id);
  const accountIdsSet = new Set(accountIds);

  // ----- 1b. instruments for canonical symbol + name
  const instrumentRows = await db.select().from(instruments).where(eq(instruments.ownerUserId, ownerUserId));
  const instrumentByIsin = new Map(instrumentRows.filter(i => i.isin).map(i => [i.isin!, i]));
  const instrumentBySymbol = new Map(instrumentRows.filter(i => i.symbol).map(i => [i.symbol!, i]));

  // ----- 2. open lots → cost basis
  const allLots = await db.select().from(lots).where(eq(lots.ownerUserId, ownerUserId));
  const filteredLots = accountFilter
    ? allLots.filter(l => accountIdsSet.has(l.brokerAccountId))
    : allLots;
  const costEurByAccountSymbol = new Map<string, Decimal>();
  for (const l of filteredLots) {
    const k = `${l.brokerAccountId}|${l.isin ?? l.symbol}`;
    costEurByAccountSymbol.set(k, (costEurByAccountSymbol.get(k) ?? new Decimal(0)).plus(l.costEur));
  }
  const qtyByAccountSymbol = new Map<string, Decimal>();
  // Track latest symbol per (account, isin??symbol) key so we look up quotes by current ticker
  const symbolByKey = new Map<string, string>();
  for (const l of filteredLots) {
    const k = `${l.brokerAccountId}|${l.isin ?? l.symbol}`;
    qtyByAccountSymbol.set(k, (qtyByAccountSymbol.get(k) ?? new Decimal(0)).plus(l.remainingQty));
    symbolByKey.set(k, l.symbol);
  }
  const totalCost = [...costEurByAccountSymbol.values()].reduce((s, c) => s.plus(c), new Decimal(0));

  // ----- 3. latest quote per symbol
  const allQuotes = await db.select().from(quoteCache);
  const latestQuote = new Map<string, { close: number; currency: string; date: string }>();
  for (const q of allQuotes) {
    const prev = latestQuote.get(q.symbol);
    if (!prev || q.date > prev.date) {
      latestQuote.set(q.symbol, { close: Number(q.close), currency: q.currency, date: q.date });
    }
  }

  // ----- 4. fx_rates: latest rate per currency
  const allFx = await db.select().from(fxRates);
  const fxByCurrencyLatest = new Map<string, { rate: number; date: string }>();
  for (const r of allFx) {
    const prev = fxByCurrencyLatest.get(r.fromCurrency);
    if (!prev || r.date > prev.date) fxByCurrencyLatest.set(r.fromCurrency, { rate: Number(r.rate), date: r.date });
  }
  const latestFxByCurrency = new Map<string, number>();
  for (const [cur, { rate }] of fxByCurrencyLatest) latestFxByCurrency.set(cur, rate);

  // ----- 5. compute per-account-symbol market value in EUR
  type Row = { brokerAccountId: string; broker: string; symbol: string; name?: string; qty: number; costEur: number; marketEur: number | null; plEur: number | null; plPct: number | null; currency: string };
  const rows: Row[] = [];
  const seenKeys = new Set<string>();
  for (const l of filteredLots) {
    const k = `${l.brokerAccountId}|${l.isin ?? l.symbol}`;
    if (seenKeys.has(k)) continue;
    seenKeys.add(k);
    const rawSymbol = symbolByKey.get(k) ?? l.symbol;
    // Resolve canonical symbol + name from instruments table
    const inst = (l.isin && instrumentByIsin.get(l.isin)) || instrumentBySymbol.get(rawSymbol);
    const symbol = inst?.symbol ?? rawSymbol;
    const name = inst?.name ?? undefined;
    const qty = Number(qtyByAccountSymbol.get(k) ?? 0);
    const cost = Number(costEurByAccountSymbol.get(k) ?? 0);
    if (qty <= 0) continue;
    const q = latestQuote.get(symbol);
    let marketEur: number | null = null;
    let currency = "EUR";
    if (q) {
      currency = q.currency;
      if (q.currency === "EUR") {
        marketEur = qty * q.close;
      } else {
        const rate = latestFxByCurrency.get(q.currency);
        if (rate) marketEur = (qty * q.close) / rate;
      }
    }
    const pl = marketEur !== null ? marketEur - cost : null;
    const plPct = pl !== null && cost !== 0 ? (pl / cost) * 100 : null;
    const acc = accountRows.find(a => a.id === l.brokerAccountId);
    rows.push({
      brokerAccountId: l.brokerAccountId,
      broker: acc?.broker === "FREEDOM_FINANCE" ? "FF" : "IBKR",
      symbol,
      name,
      qty, costEur: cost, marketEur, plEur: pl, plPct, currency,
    });
  }

  // ----- 6. portfolio aggregates
  const totalMarket = rows.reduce((s, r) => s + (r.marketEur ?? 0), 0);
  const totalUnrealized = rows.reduce((s, r) => s + (r.plEur ?? 0), 0);
  const positionCount = rows.length;

  // ----- 7. realized YTD
  const yr = String(new Date().getFullYear());
  const allMatches = await db.select().from(realizedMatches).where(eq(realizedMatches.ownerUserId, ownerUserId));
  const filteredMatches = accountFilter
    ? allMatches.filter(m => accountIdsSet.has(m.brokerAccountId))
    : allMatches;
  const realizedYtd = filteredMatches
    .filter(m => m.closedAt.startsWith(yr))
    .reduce((s, m) => s + Number(m.gainEur), 0);

  // ----- 8. day change: compare today vs yesterday close from quote_history
  const allHistory = await db.select().from(quoteHistory);
  const histBySymbol = new Map<string, Array<{ date: string; close: number; currency: string }>>();
  for (const h of allHistory) {
    if (!histBySymbol.has(h.symbol)) histBySymbol.set(h.symbol, []);
    histBySymbol.get(h.symbol)!.push({ date: h.date, close: Number(h.close), currency: h.currency });
  }
  for (const arr of histBySymbol.values()) arr.sort((a, b) => a.date.localeCompare(b.date));

  let dayChangeEur: number | null = null;
  let dayChangePct: number | null = null;
  let asOf: string | null = null;
  let totalYesterdayEur = 0;
  let totalTodayEur = 0;
  let canCompute = true;
  for (const r of rows) {
    const arr = histBySymbol.get(r.symbol);
    if (!arr || arr.length < 2) { canCompute = false; break; }
    const today = arr[arr.length - 1];
    const yesterday = arr[arr.length - 2];
    if (!asOf || today.date > asOf) asOf = today.date;
    const fxToday = today.currency === "EUR" ? 1 : (latestFxByCurrency.get(today.currency) ?? null);
    const fxYesterday = today.currency === "EUR" ? 1 : (latestFxByCurrency.get(today.currency) ?? null);
    if (fxToday === null || fxYesterday === null) { canCompute = false; break; }
    totalTodayEur += (r.qty * today.close) / fxToday;
    totalYesterdayEur += (r.qty * yesterday.close) / fxYesterday;
  }
  if (canCompute && totalYesterdayEur > 0) {
    dayChangeEur = totalTodayEur - totalYesterdayEur;
    dayChangePct = (dayChangeEur / totalYesterdayEur) * 100;
  }

  // ----- 9. equity curve (24 monthly snapshots)
  let equityDates: string[] = [];
  let equityPortfolio: number[] = [];
  let equityBenchmark: number[] = [];
  if (allHistory.length > 0 && rows.length > 0) {
    // Generate last 24 month-end dates
    const monthEnds: string[] = [];
    const now = new Date();
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      monthEnds.push(d.toISOString().slice(0, 10));
    }
    // current holdings × historical month-end prices (simplified v2; true historical requires event replay)
    const holdings: Record<string, Record<string, number>> = {};
    for (const me of monthEnds) {
      holdings[me] = {};
      for (const r of rows) holdings[me][r.symbol] = r.qty;
    }
    const currencyBySymbol = new Map<string, string>();
    for (const [sym, arr] of histBySymbol) {
      if (arr.length > 0) currencyBySymbol.set(sym, arr[arr.length - 1].currency);
    }

    // For each symbol × month-end, find latest available close ≤ that date
    const adjustedClosesMap = new Map<string, number>();
    for (const sym of histBySymbol.keys()) {
      const arr = histBySymbol.get(sym)!;
      for (const me of monthEnds) {
        let pick: { date: string; close: number } | undefined;
        for (const h of arr) {
          if (h.date <= me) pick = h;
          else break;
        }
        if (pick) adjustedClosesMap.set(`${sym}|${me}`, pick.close);
      }
    }
    const adjustedFxMap = new Map<string, number>();
    const uniqueCurrencies = [...new Set([...currencyBySymbol.values()])];
    for (const me of monthEnds) {
      for (const cur of uniqueCurrencies) {
        if (cur === "EUR") continue;
        const candidates = allFx.filter(r => r.fromCurrency === cur && r.date <= me);
        candidates.sort((a, b) => b.date.localeCompare(a.date));
        if (candidates[0]) adjustedFxMap.set(`${me}|${cur}`, Number(candidates[0].rate));
      }
    }
    const curve = computeEquityCurve({
      monthEnds,
      holdings,
      closesBySymbolDate: adjustedClosesMap,
      currencyBySymbol,
      fxRates: adjustedFxMap,
    });
    if (curve.length > 0) {
      equityDates = curve.map(p => p.date);
      const values = curve.map(p => p.valueEur);
      const indexed = indexToBaseline(values, equityDates, 100);
      equityPortfolio = indexed.values;

      // benchmark
      const benchSymbol = "^GSPC";
      const benchArr = histBySymbol.get(benchSymbol);
      if (benchArr && benchArr.length > 0) {
        const benchByDate: { date: string; close: number }[] = [];
        for (const me of monthEnds) {
          let pick: { date: string; close: number } | undefined;
          for (const h of benchArr) {
            if (h.date <= me) pick = h;
            else break;
          }
          if (pick) benchByDate.push({ date: me, close: pick.close });
        }
        if (benchByDate.length > 0) {
          const aligned = alignBenchmarkToCurve(
            equityDates.map((d, i) => ({ date: d, valueEur: equityPortfolio[i] })),
            benchByDate,
          );
          equityBenchmark = aligned.values;
        }
      }
    }
  }

  // ----- 10. total return
  const totalReturnEur = totalMarket - Number(totalCost);
  const totalReturnPct = Number(totalCost) > 0 ? (totalReturnEur / Number(totalCost)) * 100 : null;

  // ----- 11. allocation by sector
  const sectorAgg = new Map<string, { value: number }>();
  for (const r of rows) {
    if (r.marketEur === null) continue;
    const sec = classifySector(r.symbol);
    const cur = sectorAgg.get(sec) ?? { value: 0 };
    cur.value += r.marketEur;
    sectorAgg.set(sec, cur);
  }
  const allocation = [...sectorAgg.entries()]
    .map(([name, { value }]) => ({ name, value, pct: totalMarket > 0 ? (value / totalMarket) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);

  // ----- 12. currency exposure
  const currencyExposure = computeCurrencyExposure(rows.map(r => ({ currency: r.currency, marketEur: r.marketEur })));

  // ----- 13. dividends YTD
  const allTx = await db.select().from(transactions).where(eq(transactions.ownerUserId, ownerUserId));
  const filteredTx = accountFilter
    ? allTx.filter(t => accountIdsSet.has(t.brokerAccountId ?? ""))
    : allTx;
  const ytdDivs = filteredTx.filter(t => t.eventType === "DIVIDEND" && t.eventDate.startsWith(yr));
  const dividendsYtdTotal = ytdDivs.reduce((s, t) => s + Number(t.amountEur ?? 0), 0);
  const dividendsYtdWht = ytdDivs.reduce((s, t) => s + Number(t.withholdingTaxEur ?? 0), 0);
  const monthly: number[] = new Array(12).fill(0);
  for (const d of ytdDivs) {
    const m = Number(d.eventDate.slice(5, 7)) - 1;
    if (m >= 0 && m < 12) monthly[m] += Number(d.amountEur ?? 0);
  }
  const monthAbbr = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  // ----- 14. cash (rough: sum CASH_TRANSFER minus FEE amounts in EUR)
  let cash = 0;
  for (const t of filteredTx) {
    if (t.eventType === "CASH_TRANSFER") cash += Number(t.amountEur ?? t.amount ?? 0);
    if (t.eventType === "FEE") cash -= Number(t.amountEur ?? t.fee ?? 0);
  }

  // ----- 15. top positions (top 5 by market value)
  const topPositions = rows
    .filter(r => r.marketEur !== null)
    .sort((a, b) => (b.marketEur ?? 0) - (a.marketEur ?? 0))
    .slice(0, 5)
    .map(r => ({
      symbol: r.symbol,
      broker: r.broker,
      marketEur: r.marketEur!,
      name: r.name,
      views: {
        broker: { plEur: r.plEur, plPct: r.plPct },
        net:    { plEur: r.plEur, plPct: r.plPct },
      },
    }));

  return {
    hero: {
      valueEur: totalMarket,
      dayChangeEur,
      dayChangePct,
      totalReturnEur,
      totalReturnPct,
      positionCount,
      cashEur: cash,
      broker,
      asOf,
    },
    tiles: {
      unrealizedEur: totalUnrealized,
      unrealizedPct: Number(totalCost) > 0 ? (totalUnrealized / Number(totalCost)) * 100 : null,
      realizedYtdEur: realizedYtd,
    },
    equityCurve: { dates: equityDates, portfolio: equityPortfolio, benchmark: equityBenchmark },
    allocation,
    currency: currencyExposure,
    dividendsYtd: { totalEur: dividendsYtdTotal, whtEur: dividendsYtdWht, monthly, months: monthAbbr },
    topPositions,
  };
}
