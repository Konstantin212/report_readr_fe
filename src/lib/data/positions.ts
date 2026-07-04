import { eq } from "drizzle-orm";
import Decimal from "decimal.js";
import { getDb } from "@/lib/db/client";
import {
  brokerAccounts, lots, quoteCache, quoteHistory, transactions, instruments,
} from "@/lib/db/schema";
import { classifySector, classifyKind, normalizeSector, SECTOR_ETF } from "@/lib/analytics/sector-map";
import { loadClassificationOverrides } from "@/lib/analytics/classification";
import { getMetaByIsins } from "@/lib/marketdata/store";
import { syntheticIsin } from "@/lib/marketdata/types";
import type { InstrumentMetaView } from "@/components/pulse/instrument-source-card";
import { computeCashBalances, loadLatestFxPerCurrency } from "@/lib/data/cash";
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
  /** ISO YYYY-MM-DD — the *price date* of the quote backing this row. */
  asOf: string | null;
  /** quote_cache.source for the quote backing this row (e.g.
   *  "FMP" / "TWELVE_DATA" / "YAHOO" / "STOOQ" / "COINGECKO" /
   *  "FREEDOM_SNAPSHOT" / "IBKR_SNAPSHOT"). Null when no quote exists. */
  quoteSource: string | null;
  /** ISO timestamp of when the backing quote_cache row was written.
   *  Lets the UI distinguish "price as of yesterday" from "cached
   *  yesterday but price is two weeks old". */
  quoteUpdatedAt: string | null;
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
  /** Fund distribution policy from the market-data classification layer.
   *  Set only for funds/ETFs whose metadata resolved OK — drives the
   *  Dist/Acc chip and flags Vorabpauschale-relevant accumulators. Null
   *  for stocks/bonds and un-enriched instruments. */
  distribution?: { policy: "DISTRIBUTING" | "ACCUMULATING"; frequency: string | null } | null;
  /** instrument_meta.source for the classification override backing this
   *  row (JUSTETF/YAHOO/FMP/MANUAL), or null when no OK metadata exists.
   *  Populated for the selected row's detail card. */
  metaSource?: string | null;
};

export type DetailLot = {
  openedAt: string;
  qty: string;
  costEur: string;
  pricePerUnitEur: string;
  pctOfTotal: number;
  gainPct: number | null;
};

export type DetailTransaction = {
  /** ISO YYYY-MM-DD */
  date: string;
  /** "buy" or "sell" — derived from quantity sign. */
  side: "buy" | "sell";
  /** Always positive. */
  qty: number;
  /** Per-share price in trade currency, or null when not available. */
  priceNative: number | null;
  /** Trade currency (e.g. USD, EUR). */
  currency: string;
  /** Total proceeds in trade currency (positive = inflow, negative = outflow). */
  amountNative: number;
  /** Total proceeds in EUR at trade-date FX. */
  amountEur: number;
  /** Commission in trade currency (always positive). */
  feeNative: number | null;
};

export type SelectedPosition = PositionRow & {
  sparkline: number[];
  sparkPctChange: number | null;
  lots: DetailLot[];
  dividendsYtdEur: number;
  /** Cumulative dividends received on this position (post-WHT, in EUR),
   *  scoped to the earliest currently-open lot's opened_at so re-opened
   *  positions don't inherit a prior closed lot's dividend history. */
  dividendsTotalEur: number;
  /** Number of dividend payments contributing to dividendsTotalEur. */
  dividendsTotalCount: number;
  yieldOnCostPct: number;
  daysHeld: number;
  /** Every TRADE event for this symbol on this user's account, ordered
   *  oldest → newest. Surfaced in the detail panel's transactions list
   *  so the user can audit how the FIFO lots were built. */
  transactions: DetailTransaction[];
  /** Full market-data metadata for the detail panel's "data source" card.
   *  Null when no OK `instrument_meta` row exists — the card then offers
   *  the manual-link input instead. */
  meta: InstrumentMetaView | null;
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
  // The classification override map joins the user's instruments against
  // the global market-data store so ETFs (e.g. IEMM, IE00B0M63177) that a
  // scrape has re-classified land in the right table instead of the
  // hardcoded symbol-map's default. It runs its own two queries; folding
  // it into this batch keeps it off the critical path.
  const [accountRows, allLots, allQuotes, latestFx, allTxs, instrumentRows, detailHistory, overrides] = await Promise.all([
    db.select().from(brokerAccounts).where(eq(brokerAccounts.ownerUserId, ownerUserId)),
    db.select().from(lots).where(eq(lots.ownerUserId, ownerUserId)),
    db.select().from(quoteCache),
    loadLatestFxPerCurrency(db),
    db.select().from(transactions).where(eq(transactions.ownerUserId, ownerUserId)),
    db.select().from(instruments).where(eq(instruments.ownerUserId, ownerUserId)),
    detailHistoryPromise,
    loadClassificationOverrides(ownerUserId),
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

  const latestQuote = new Map<string, {
    close: number;
    currency: string;
    date: string;
    source: string;
    updatedAt: Date | null;
  }>();
  for (const q of allQuotes) {
    const prev = latestQuote.get(q.symbol);
    if (!prev || q.date > prev.date) latestQuote.set(q.symbol, {
      close: Number(q.close),
      currency: q.currency,
      date: q.date,
      source: q.source,
      updatedAt: q.updatedAt,
    });
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
    // Prefer the scraped market-data classification when we have one;
    // otherwise fall back to the hardcoded symbol maps (today's behavior).
    const override = overrides.get(displaySymbol);
    const hardcodedSector = classifySector(displaySymbol);
    const kind = override?.kind ?? classifyKind(displaySymbol, hardcodedSector);
    // ETFs are grouped by kind and diversified across companies, so a
    // provider's equity-sector label (e.g. FMP tagging SPY "Financial
    // Services") is misleading — show "ETF". Everything else uses the
    // enriched-or-hardcoded sector, normalised so "Technology"/"Tech" and
    // "Financial Services"/"Financials" never split into two buckets.
    const sector = kind === "etf" ? SECTOR_ETF : normalizeSector(override?.sector ?? hardcodedSector);
    const distribution = override?.distribution ?? null;

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
      quoteSource: q?.source ?? null,
      quoteUpdatedAt: q?.updatedAt ? q.updatedAt.toISOString() : null,
      nativeCurrency: nativeCcy,
      pricePerUnitNative,
      marketNative,
      views: { broker: brokerView, net: netView },
      dividendsEur,
      dividendsNative,
      feesEur,
      distribution,
      // Populated only for the selected row (detail card); list rows never
      // render it, so a per-row meta fetch here would be wasted round-trips.
      metaSource: null,
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

      // Lifetime net dividends + payment count, scoped to the same
      // earliest-open-lot window as the YTD figure so reopened
      // positions don't get credited with prior-lot dividends.
      const dividendsTotalEur = symRows.reduce((s, t) => s + Number(t.cashAmountEur ?? 0), 0);
      const dividendsTotalCount = symRows.filter((t) => t.eventType === "DIVIDEND").length;

      const daysHeld = Math.floor((Date.now() - Date.parse(earliestOpen)) / 86400000);

      // Full market-data metadata for the "data source" card. Look up by
      // real ISIN and by the synthetic SYM:{symbol} key (manual Yahoo
      // links pin instruments with no real ISIN under that key). Only an
      // OK row surfaces as populated meta; anything else leaves meta null
      // so the card offers the manual-link input.
      const metaKeys = [sel.isin, syntheticIsin(sel.symbol)].filter((k): k is string => Boolean(k));
      const metaRows = metaKeys.length ? await getMetaByIsins(metaKeys) : [];
      const rawMeta =
        (sel.isin ? metaRows.find((m) => m.isin === sel.isin && m.status === "OK") : undefined) ??
        metaRows.find((m) => m.status === "OK") ??
        null;
      const metaView: InstrumentMetaView | null = rawMeta
        ? {
            source: rawMeta.source,
            assetKind: rawMeta.assetKind,
            sector: rawMeta.sector,
            industry: rawMeta.industry,
            distribution: rawMeta.distributionPolicy
              ? { policy: rawMeta.distributionPolicy, frequency: rawMeta.distributionFrequency }
              : null,
            terPct: rawMeta.terPct,
            teilfreistellungPct: rawMeta.teilfreistellungPct,
          }
        : null;

      // Every TRADE event for this symbol, ordered chronologically so
      // the detail panel can show the user the full buy/sell ledger.
      const transactions: DetailTransaction[] = allTxs
        .filter((t) => t.eventType === "TRADE" && t.symbol === sel.symbol)
        .sort((a, b) => a.eventDate.localeCompare(b.eventDate))
        .map((t) => {
          const qtyRaw = Number(t.quantity ?? "0");
          const amountNative = Number(t.amount ?? "0");
          return {
            date: t.eventDate,
            side: qtyRaw >= 0 ? "buy" : "sell",
            qty: Math.abs(qtyRaw),
            priceNative: t.price ? Number(t.price) : null,
            currency: t.currency,
            amountNative,
            amountEur: Number(t.amountEur ?? "0"),
            feeNative: t.fee ? Number(t.fee) : null,
          };
        });

      selected = {
        ...sel,
        metaSource: metaView?.source ?? null,
        sparkline,
        sparkPctChange,
        lots: detailLots,
        dividendsYtdEur,
        dividendsTotalEur,
        dividendsTotalCount,
        yieldOnCostPct,
        daysHeld,
        transactions,
        meta: metaView,
      };
    }
  }

  const rowsByKind = {
    stock: filteredRows.filter(r => r.kind === "stock"),
    etf: filteredRows.filter(r => r.kind === "etf"),
    bond: filteredRows.filter(r => r.kind === "bond"),
    other: filteredRows.filter(r => r.kind === "other"),
  };
  // Cash reuses the accountRows / transactions / latest-FX already loaded
  // above — no second fx_rates (51k) + transactions round-trip.
  const cash = computeCashBalances({ accountRows, txs: allTxs, latestFx, broker });

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
