import { eq } from "drizzle-orm";
import Decimal from "decimal.js";
import { getDb } from "@/lib/db/client";
import {
  brokerAccounts, lots, quoteCache, quoteHistory, fxRates, transactions,
} from "@/lib/db/schema";
import { classifySector } from "@/lib/analytics/sector-map";
import { yieldOnCost } from "@/lib/analytics/yield-on-cost";

export type PositionRow = {
  symbol: string;
  name?: string;
  broker: string;
  currency: string;
  sector: string;
  qty: number;
  avgCostEur: number;
  costEur: number;
  pricePerUnitEur: number | null;
  marketEur: number | null;
  plEur: number | null;
  plPct: number | null;
  asOf: string | null;
};

export type DetailLot = {
  openedAt: string;
  qty: string;
  costEur: string;
  pricePerUnitEur: string;
  pctOfTotal: number;
  gainPct: number | null;
};

export type SelectedPosition = PositionRow & {
  sparkline: number[];
  sparkPctChange: number | null;
  lots: DetailLot[];
  dividendsYtdEur: number;
  yieldOnCostPct: number;
  daysHeld: number;
};

export type PositionsData = {
  rows: PositionRow[];
  total: number;
  totalMarketEur: number;
  totalPlEur: number;
  sectors: string[];
  selected: SelectedPosition | null;
};

export async function getPositionsData(
  ownerUserId: string,
  filters: { broker?: "all" | "ff" | "ibkr"; sector?: string | null; symbol?: string | null },
): Promise<PositionsData> {
  const db = getDb();
  const broker = filters.broker ?? "all";
  const sector = filters.sector ?? null;
  const selectedSymbol = filters.symbol ?? null;

  const accountFilter = broker === "all" ? null : broker === "ff" ? "FREEDOM_FINANCE" : "INTERACTIVE_BROKERS";
  const accountRows = await db.select().from(brokerAccounts).where(eq(brokerAccounts.ownerUserId, ownerUserId));
  const accountIds = accountFilter
    ? accountRows.filter(a => a.broker === accountFilter).map(a => a.id)
    : accountRows.map(a => a.id);
  const accountIdsSet = new Set(accountIds);
  const accountBrokerById = new Map(accountRows.map(a => [a.id, a.broker === "FREEDOM_FINANCE" ? "FF" : "IBKR"]));

  const allLots = await db.select().from(lots).where(eq(lots.ownerUserId, ownerUserId));
  const filteredLots = accountFilter ? allLots.filter(l => accountIdsSet.has(l.brokerAccountId)) : allLots;
  const allQuotes = await db.select().from(quoteCache);
  const allFx = await db.select().from(fxRates);

  // Latest FX per currency
  const latestFx = new Map<string, { rate: number; date: string }>();
  for (const r of allFx) {
    const prev = latestFx.get(r.fromCurrency);
    if (!prev || r.date > prev.date) latestFx.set(r.fromCurrency, { rate: Number(r.rate), date: r.date });
  }

  const latestQuote = new Map<string, { close: number; currency: string; date: string }>();
  for (const q of allQuotes) {
    const prev = latestQuote.get(q.symbol);
    if (!prev || q.date > prev.date) latestQuote.set(q.symbol, { close: Number(q.close), currency: q.currency, date: q.date });
  }

  // Group lots by (brokerAccountId, symbol) → aggregated row
  type Agg = { brokerAccountId: string; symbol: string; qty: Decimal; cost: Decimal; openedAt: string; lots: { openedAt: string; qty: string; costEur: string }[] };
  const groups = new Map<string, Agg>();
  for (const l of filteredLots) {
    const k = `${l.brokerAccountId}|${l.symbol}`;
    const g = groups.get(k) ?? { brokerAccountId: l.brokerAccountId, symbol: l.symbol, qty: new Decimal(0), cost: new Decimal(0), openedAt: l.openedAt, lots: [] };
    g.qty = g.qty.plus(l.remainingQty);
    g.cost = g.cost.plus(l.costEur);
    if (l.openedAt < g.openedAt) g.openedAt = l.openedAt;
    g.lots.push({ openedAt: l.openedAt, qty: l.remainingQty, costEur: l.costEur });
    groups.set(k, g);
  }

  const rows: PositionRow[] = [];
  for (const g of groups.values()) {
    const qty = Number(g.qty);
    const cost = Number(g.cost);
    if (qty <= 0) continue;
    const q = latestQuote.get(g.symbol);
    let pricePerUnitEur: number | null = null;
    let marketEur: number | null = null;
    let currency = "EUR";
    let asOf: string | null = null;
    if (q) {
      currency = q.currency;
      asOf = q.date;
      if (q.currency === "EUR") {
        pricePerUnitEur = q.close;
        marketEur = qty * q.close;
      } else {
        const fx = latestFx.get(q.currency);
        if (fx) {
          pricePerUnitEur = q.close / fx.rate;
          marketEur = qty * pricePerUnitEur;
        }
      }
    }
    const plEur = marketEur !== null ? marketEur - cost : null;
    const plPct = plEur !== null && cost !== 0 ? (plEur / cost) * 100 : null;
    rows.push({
      symbol: g.symbol,
      broker: accountBrokerById.get(g.brokerAccountId) ?? "?",
      currency,
      sector: classifySector(g.symbol),
      qty,
      avgCostEur: qty > 0 ? cost / qty : 0,
      costEur: cost,
      pricePerUnitEur,
      marketEur,
      plEur,
      plPct,
      asOf,
    });
  }

  const sectors = Array.from(new Set(rows.map(r => r.sector))).sort();
  const filteredRows = sector ? rows.filter(r => r.sector === sector) : rows;
  const totalMarketEur = filteredRows.reduce((s, r) => s + (r.marketEur ?? 0), 0);
  const totalPlEur = filteredRows.reduce((s, r) => s + (r.plEur ?? 0), 0);

  // Selected position detail
  let selected: SelectedPosition | null = null;
  if (selectedSymbol) {
    const sel = filteredRows.find(r => r.symbol === selectedSymbol);
    if (sel) {
      // Sparkline from quoteHistory (last ~180 daily closes, converted to EUR)
      const hist = (await db.select().from(quoteHistory)).filter(h => h.symbol === sel.symbol).sort((a, b) => a.date.localeCompare(b.date));
      const tail = hist.slice(-180);
      const sparkline = tail.map(h => {
        if (h.currency === "EUR") return Number(h.close);
        const fx = latestFx.get(h.currency);
        return fx ? Number(h.close) / fx.rate : 0;
      }).filter(v => v > 0);
      const sparkPctChange = sparkline.length >= 2 ? ((sparkline[sparkline.length - 1] / sparkline[0]) - 1) * 100 : null;

      // Lots
      const matching = filteredLots.filter(l => l.symbol === sel.symbol && Number(l.remainingQty) > 0);
      const totalCost = matching.reduce((s, l) => s + Number(l.costEur), 0);
      const detailLots: DetailLot[] = matching.map(l => {
        const qty = Number(l.remainingQty);
        const cost = Number(l.costEur);
        const ppu = qty > 0 ? cost / qty : 0;
        const pctOfTotal = totalCost > 0 ? (cost / totalCost) * 100 : 0;
        const gainPct = sel.pricePerUnitEur !== null && ppu > 0 ? ((sel.pricePerUnitEur / ppu) - 1) * 100 : null;
        return { openedAt: l.openedAt, qty: qty.toFixed(qty % 1 === 0 ? 0 : 4), costEur: cost.toFixed(2), pricePerUnitEur: ppu.toFixed(2), pctOfTotal, gainPct };
      });

      // Dividends YTD for this symbol
      const yr = String(new Date().getFullYear());
      const txs = await db.select().from(transactions).where(eq(transactions.ownerUserId, ownerUserId));
      const symDivs = txs.filter(t => t.eventType === "DIVIDEND" && t.symbol === sel.symbol && t.eventDate.startsWith(yr));
      const dividendsYtdEur = symDivs.reduce((s, t) => s + Number(t.amountEur ?? 0), 0);

      // TTM dividends for yield on cost
      const cutoff = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
      const ttmDivs = txs.filter(t => t.eventType === "DIVIDEND" && t.symbol === sel.symbol && t.eventDate >= cutoff);
      const ttmEur = ttmDivs.reduce((s, t) => s + Number(t.amountEur ?? 0), 0);
      const yieldOnCostPct = yieldOnCost(ttmEur, sel.costEur) * 100;

      const earliestOpen = matching.reduce((min, l) => l.openedAt < min ? l.openedAt : min, matching[0]?.openedAt ?? new Date().toISOString().slice(0,10));
      const daysHeld = Math.floor((Date.now() - Date.parse(earliestOpen)) / 86400000);

      selected = { ...sel, sparkline, sparkPctChange, lots: detailLots, dividendsYtdEur, yieldOnCostPct, daysHeld };
    }
  }

  return {
    rows: filteredRows,
    total: rows.length,
    totalMarketEur,
    totalPlEur,
    sectors,
    selected,
  };
}
