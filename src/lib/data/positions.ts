import { eq } from "drizzle-orm";
import Decimal from "decimal.js";
import { getDb } from "@/lib/db/client";
import {
  brokerAccounts, lots, quoteCache, quoteHistory, fxRates, transactions, instruments,
} from "@/lib/db/schema";
import { classifySector, classifyKind } from "@/lib/analytics/sector-map";
import { getCashBalances } from "@/lib/data/cash";
import { yieldOnCost } from "@/lib/analytics/yield-on-cost";
import { computeUnrealizedPnL, type ResolvedLot } from "@/lib/positions/unrealized-pnl";

/**
 * Per-view metrics on a position row. Two views coexist:
 *
 *   `broker`  Cost basis excludes commissions. Mirrors the brokerage UI
 *             ("Entry Price × qty"). Dividends NOT included. Use this to
 *             answer "did the share price move?".
 *
 *   `net`     Cost basis includes commissions (German Anschaffungskosten)
 *             and the P/L further adds received dividends. This is the
 *             figure that maps to Anlage KAP and to total economic
 *             return.
 *
 * Market value, qty, and per-unit price are shared — they don't depend
 * on the mode.
 */
export type PositionViewMetrics = {
  avgCostEur: number;
  costEur: number;
  plEur: number | null;
  plPct: number | null;
  avgCostNative: number | null;
  costNative: number | null;
  plNative: number | null;
};

export type PositionRow = {
  symbol: string;
  isin?: string;
  name?: string;
  broker: string;
  currency: string;
  sector: string;
  kind: "stock" | "etf" | "bond" | "other";
  qty: number;
  pricePerUnitEur: number | null;
  marketEur: number | null;
  asOf: string | null;
  // P/L in the equity's listed/trade currency (USD for COIN, GBP for TRN, EUR for SPYW, …).
  // Derived from each lot's source-transaction native amount + a current FX conversion of
  // the EUR-equivalent market value. Null when source transactions are missing or the lot
  // currency can't be determined.
  nativeCurrency: string | null;
  pricePerUnitNative: number | null;
  marketNative: number | null;
  // Mode-specific cost & P/L numbers. UI picks one based on the user's
  // toggle setting in the PnlModeProvider.
  views: { broker: PositionViewMetrics; net: PositionViewMetrics };
  // Informational: cumulative cash dividends paid on this position in EUR
  // and in the trade currency, after withholding tax. Surfaced in the
  // detail panel and used to compute `net.plEur`.
  dividendsEur: number;
  dividendsNative: number;
  /** Commissions baked into the lots' cost basis, in EUR. Detail-panel only. */
  feesEur: number;
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
  rowsByKind: { stock: PositionRow[]; etf: PositionRow[]; bond: PositionRow[]; other: PositionRow[] };
  total: number;
  totalMarketEur: number;
  totalPlEur: number;
  sectors: string[];
  cash: import("@/lib/data/cash").CashByCurrency[];
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

  // All top-level queries are independent of each other — fan them out
  // concurrently. On Neon's HTTP driver each query is its own TLS
  // round-trip (~80-150 ms); sequential awaits cost ~600-900 ms total,
  // parallel ~120-200 ms (max of the slowest single query). When a row
  // is selected we ALSO need 180 daily closes for its sparkline — that
  // query joins the same batch instead of running sequentially after,
  // so clicking a row doesn't add another ~100 ms round-trip.
  const accountFilter = broker === "all" ? null : broker === "ff" ? "FREEDOM_FINANCE" : "INTERACTIVE_BROKERS";
  const detailHistoryPromise = selectedSymbol
    ? db.select().from(quoteHistory).where(eq(quoteHistory.symbol, selectedSymbol))
    : Promise.resolve([]);
  const [accountRows, allLots, allQuotes, allFx, allTxs, instrumentRows, detailHistory] = await Promise.all([
    db.select().from(brokerAccounts).where(eq(brokerAccounts.ownerUserId, ownerUserId)),
    db.select().from(lots).where(eq(lots.ownerUserId, ownerUserId)),
    db.select().from(quoteCache),
    db.select().from(fxRates),
    db.select().from(transactions).where(eq(transactions.ownerUserId, ownerUserId)),
    db.select().from(instruments).where(eq(instruments.ownerUserId, ownerUserId)),
    detailHistoryPromise,
  ]);
  // Stocks pipeline excludes COINBASE broker_accounts entirely — crypto
  // has its own page section (CryptoPositionsSection) with a different
  // schema (no ISIN/sector/dividends, different cost-basis semantics).
  // Without this filter, crypto lots leak into rowsByKind.other and the
  // broker badge falls back to "IBKR" for the unknown enum value.
  const stockAccountRows = accountRows.filter(a => a.broker !== "COINBASE");
  const accountIds = accountFilter
    ? stockAccountRows.filter(a => a.broker === accountFilter).map(a => a.id)
    : stockAccountRows.map(a => a.id);
  const accountIdsSet = new Set(accountIds);
  const accountBrokerById = new Map(stockAccountRows.map(a => [a.id, a.broker === "FREEDOM_FINANCE" ? "FF" : "IBKR"]));
  const filteredLots = allLots.filter(l => accountIdsSet.has(l.brokerAccountId));
  const txById = new Map(allTxs.map(t => [t.id, t]));

  // For each (brokerAccountId, symbol) with an open lot, the earliest
  // opened_at among those lots. Dividends paid before this date belong to
  // a previously-closed lot and should NOT be attributed to the current
  // position. Without this, e.g. a user who held O in 2022-2024, sold,
  // then reopened in 2025-09 would see 2022-2024 dividends credited
  // against the new lot — wrong.
  const earliestOpenBySymbol = new Map<string, string>();
  for (const l of filteredLots) {
    const k = `${l.brokerAccountId}|${l.symbol}`;
    const prior = earliestOpenBySymbol.get(k);
    if (!prior || l.openedAt < prior) earliestOpenBySymbol.set(k, l.openedAt);
  }

  // Net dividends received per (brokerAccountId, symbol), keyed in EUR.
  //
  // Each broker distribution lands as two atomic rows in our ledger: the
  // gross DIVIDEND, and a negative WITHHOLDING_TAX (so Anlage KAP can use
  // gross in Z19 and WHT in Z51 separately). For the position-level
  // "dividends received" footnote and the net P/L view, we want the
  // user-facing *net cash that arrived* = sum(div.cash) + sum(wht.cash).
  //
  // Join by symbol — Freedom stamps ISIN on TRADE rows but not on
  // DIVIDEND/WHT rows, so an isin-first join would miss every match.
  const dividendsByKey = new Map<string, { eur: Decimal; native: Decimal; currency: string | null }>();
  for (const t of allTxs) {
    if (t.eventType !== "DIVIDEND" && t.eventType !== "WITHHOLDING_TAX") continue;
    if (!t.brokerAccountId || !t.symbol) continue;
    const k = `${t.brokerAccountId}|${t.symbol}`;
    const earliest = earliestOpenBySymbol.get(k);
    if (earliest && t.eventDate < earliest) continue;
    const slot = dividendsByKey.get(k) ?? { eur: new Decimal(0), native: new Decimal(0), currency: null };
    if (t.cashAmountEur) slot.eur = slot.eur.plus(t.cashAmountEur);
    if (t.cashAmount) slot.native = slot.native.plus(t.cashAmount);
    if (!slot.currency && t.currency && t.eventType === "DIVIDEND") slot.currency = t.currency;
    dividendsByKey.set(k, slot);
  }

  // instrumentRows fetched above in the parallel batch.
  const instrumentByIsin = new Map(instrumentRows.filter(i => i.isin).map(i => [i.isin!, i]));
  const instrumentBySymbol = new Map(instrumentRows.filter(i => i.symbol).map(i => [i.symbol!, i]));

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

  // Group lots by (brokerAccountId, isin ?? symbol) → aggregated row.
  // For each lot we resolve the source-transaction native amount + fee +
  // original buy qty so we can feed `computeUnrealizedPnL` later (which
  // mirrors IBKR's Open Positions math exactly — see tests in
  // tests/positions/unrealized-pnl.test.ts).
  type Agg = {
    brokerAccountId: string;
    symbol: string;
    isin?: string;
    qty: Decimal;
    /** Sum of lots.cost_eur — includes commissions (already baked in at replay time). */
    cost: Decimal;
    /** Sum of per-lot commission in EUR, scaled by remaining/original. Used to
     *  derive the broker-view cost (gross of fees) by subtracting from `cost`. */
    feesEur: Decimal;
    nativeCurrency: string | null;
    resolvedLots: ResolvedLot[];
    openedAt: string;
    lots: { openedAt: string; qty: string; costEur: string }[];
  };
  const groups = new Map<string, Agg>();
  for (const l of filteredLots) {
    const k = `${l.brokerAccountId}|${l.isin ?? l.symbol}`;
    const g = groups.get(k) ?? {
      brokerAccountId: l.brokerAccountId,
      symbol: l.symbol,
      isin: l.isin ?? undefined,
      qty: new Decimal(0),
      cost: new Decimal(0),
      feesEur: new Decimal(0),
      nativeCurrency: null,
      resolvedLots: [],
      openedAt: l.openedAt,
      lots: [],
    };
    g.qty = g.qty.plus(l.remainingQty);
    g.cost = g.cost.plus(l.costEur);
    if (l.openedAt < g.openedAt) g.openedAt = l.openedAt;
    // Keep the latest symbol seen
    g.symbol = l.symbol;
    g.isin = l.isin ?? g.isin;
    g.lots.push({ openedAt: l.openedAt, qty: l.remainingQty, costEur: l.costEur });

    // Resolve the lot back to its originating TRADE transaction so the
    // unrealized-pnl function can apply FIFO-consistent scaling using the
    // native proceeds + fee. Note: lots.source_event_fingerprint stores
    // transactions.id (UUID), not the event-fingerprint hash.
    const srcTx = txById.get(l.sourceEventFingerprint);
    if (srcTx && srcTx.quantity && Number(srcTx.quantity) > 0) {
      // Accumulate fees-in-EUR scaled by the lot's remaining-vs-original
      // ratio, mirroring how the unrealized-pnl function scales costs.
      const origQty = new Decimal(srcTx.quantity);
      const remain = new Decimal(l.remainingQty);
      if (origQty.gt(0)) {
        const ratio = remain.div(origQty);
        const feeEur = new Decimal(srcTx.feeEur ?? "0").abs();
        g.feesEur = g.feesEur.plus(feeEur.mul(ratio));
      }
      g.resolvedLots.push({
        remainingQty: l.remainingQty,
        originalQty: srcTx.quantity,
        proceeds: srcTx.amount ?? "0",
        fee: srcTx.fee ?? "0",
      });
      if (!g.nativeCurrency && srcTx.currency) g.nativeCurrency = srcTx.currency;
    }

    groups.set(k, g);
  }

  const rows: PositionRow[] = [];
  for (const g of groups.values()) {
    const qty = Number(g.qty);
    const cost = Number(g.cost);
    if (qty <= 0) continue;
    // Resolve canonical symbol + name from instruments table
    const inst = (g.isin && instrumentByIsin.get(g.isin)) || instrumentBySymbol.get(g.symbol);
    const displaySymbol = inst?.symbol ?? g.symbol;
    const displayName = inst?.name ?? undefined;
    const q = latestQuote.get(displaySymbol);
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
    const sector = classifySector(displaySymbol);
    const kind = classifyKind(displaySymbol, sector);

    // Native-currency P/L via the IBKR-mirror function. The function returns
    // both `broker` (cost excl. fees) and `net` (cost incl. fees) views, plus
    // null when inputs are incomplete (missing source transactions, missing
    // FX rate for a cross-currency conversion, no open qty).
    const nativeCcy = g.nativeCurrency;
    const ratesPerEur = new Map<string, number>();
    for (const [ccy, fx] of latestFx) ratesPerEur.set(ccy, fx.rate);
    const pnl = (nativeCcy && q && g.resolvedLots.length > 0)
      ? computeUnrealizedPnL({
          lots: g.resolvedLots,
          tradeCurrency: nativeCcy,
          lastPrice: q.close,
          quoteCurrency: q.currency,
          fxRatesPerEur: ratesPerEur,
        })
      : null;
    const marketNative = pnl?.broker.marketValueNative ?? null;
    const pricePerUnitNative = pnl ? pnl.broker.marketValueNative / pnl.qty : null;

    // EUR cost — net cost (incl. fees) is what's stored in lots.cost_eur.
    // Broker cost subtracts fees to mirror what brokerage UIs show.
    const feesEur = Number(g.feesEur);
    const netCostEur = Number(g.cost);              // includes commissions
    const brokerCostEur = Math.max(0, netCostEur - feesEur);

    // Dividends received on this position (post-WHT, what cash arrived).
    // Layered into the `net` view's P/L. Joined by symbol — see
    // dividendsByKey above for why we don't key by ISIN here.
    const divSlot = g.symbol ? dividendsByKey.get(`${g.brokerAccountId}|${g.symbol}`) : undefined;
    const dividendsEur = divSlot ? Number(divSlot.eur) : 0;
    const dividendsNative = divSlot && divSlot.currency === nativeCcy ? Number(divSlot.native) : 0;

    // Compose both views.
    const buildEurView = (costEur: number, includeDivs: boolean): PositionViewMetrics => {
      const plEur = marketEur !== null
        ? marketEur - costEur + (includeDivs ? dividendsEur : 0)
        : null;
      const plPct = plEur !== null && costEur !== 0 ? (plEur / costEur) * 100 : null;
      return {
        avgCostEur: qty > 0 ? costEur / qty : 0,
        costEur,
        plEur,
        plPct,
        avgCostNative: null,
        costNative: null,
        plNative: null,
      };
    };
    const brokerView = buildEurView(brokerCostEur, false);
    const netView = buildEurView(netCostEur, true);
    if (pnl) {
      brokerView.costNative = pnl.broker.costBasisNative;
      brokerView.avgCostNative = pnl.broker.avgPriceNative;
      brokerView.plNative = pnl.broker.unrealizedPnlNative;
      netView.costNative = pnl.net.costBasisNative;
      netView.avgCostNative = pnl.net.avgPriceNative;
      netView.plNative = pnl.net.unrealizedPnlNative + dividendsNative;
    }

    rows.push({
      symbol: displaySymbol,
      isin: g.isin,
      name: displayName,
      broker: accountBrokerById.get(g.brokerAccountId) ?? "?",
      currency,
      sector,
      kind,
      qty,
      pricePerUnitEur,
      marketEur,
      asOf,
      nativeCurrency: nativeCcy,
      pricePerUnitNative,
      marketNative,
      views: { broker: brokerView, net: netView },
      dividendsEur,
      dividendsNative,
      feesEur,
    });
  }

  const sectors = Array.from(new Set(rows.map(r => r.sector))).sort();
  const filteredRows = sector ? rows.filter(r => r.sector === sector) : rows;
  const totalMarketEur = filteredRows.reduce((s, r) => s + (r.marketEur ?? 0), 0);
  // Use the `net` view for portfolio totals (matches the existing all-in
  // economic view; UI toggle only affects per-row display).
  const totalPlEur = filteredRows.reduce((s, r) => s + (r.views.net.plEur ?? 0), 0);

  // Selected position detail
  let selected: SelectedPosition | null = null;
  if (selectedSymbol) {
    const sel = filteredRows.find(r => r.symbol === selectedSymbol);
    if (sel) {
      // Detail panel needs: sparkline history (filtered to this symbol) +
      // the user's transactions. Both already fetched above in the main
      // parallel batch (`detailHistory` was queried with the same symbol
      // the user clicked, so no second round-trip here).
      const hist = [...detailHistory].sort((a, b) => a.date.localeCompare(b.date));
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

      // Dividends YTD / TTM for this symbol — reuse the already-loaded
      // transactions instead of re-querying.
      //
      // Net of WHT (gross DIVIDEND + negative WITHHOLDING_TAX rows), and
      // scoped to the earliest currently-open lot's opened_at — otherwise
      // dividends from a prior closed-and-reopened position would leak in.
      const yr = String(new Date().getFullYear());
      const earliestOpen = matching.reduce((min, l) => l.openedAt < min ? l.openedAt : min, matching[0]?.openedAt ?? new Date().toISOString().slice(0,10));
      const isDivOrWht = (t: typeof allTxs[number]) =>
        (t.eventType === "DIVIDEND" || t.eventType === "WITHHOLDING_TAX")
        && t.symbol === sel.symbol
        && t.eventDate >= earliestOpen;
      const symRows = allTxs.filter(isDivOrWht);
      const dividendsYtdEur = symRows
        .filter(t => t.eventDate.startsWith(yr))
        .reduce((s, t) => s + Number(t.cashAmountEur ?? 0), 0);

      // TTM dividends for yield on cost
      const cutoff = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
      const ttmEur = symRows
        .filter(t => t.eventDate >= cutoff)
        .reduce((s, t) => s + Number(t.cashAmountEur ?? 0), 0);
      const yieldOnCostPct = yieldOnCost(ttmEur, sel.views.net.costEur) * 100;

      const daysHeld = Math.floor((Date.now() - Date.parse(earliestOpen)) / 86400000);

      selected = { ...sel, sparkline, sparkPctChange, lots: detailLots, dividendsYtdEur, yieldOnCostPct, daysHeld };
    }
  }

  const rowsByKind = {
    stock: filteredRows.filter(r => r.kind === "stock"),
    etf: filteredRows.filter(r => r.kind === "etf"),
    bond: filteredRows.filter(r => r.kind === "bond"),
    other: filteredRows.filter(r => r.kind === "other"),
  };
  const cash = await getCashBalances(ownerUserId, broker);

  return {
    rows: filteredRows,
    rowsByKind,
    total: rows.length,
    totalMarketEur,
    totalPlEur,
    sectors,
    cash,
    selected,
  };
}
