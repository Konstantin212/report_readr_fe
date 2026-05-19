import Decimal from "decimal.js";

/**
 * Mirror of Interactive Brokers' "Unrealized P&L" calculation as it appears
 * in the Activity Statement's `Open Positions` section.
 *
 * IBKR formula (per the Statement of Funds and Open Positions docs):
 *
 *     cost_basis  = Σ over remaining lots: |proceeds| + |fee|     (trade ccy)
 *     market_val  = sum(remaining_qty) × last_close               (trade ccy)
 *     unrealized  = market_val − cost_basis                       (trade ccy)
 *     avg_price   = cost_basis / sum(remaining_qty)
 *
 * Notes that materially affect the math (and that earlier versions of this
 * app got wrong):
 *
 *  - Cost is always in the **trade currency**, never round-tripped through
 *    EUR. Stock-price P/L and FX P/L are conceptually separate; IBKR
 *    isolates the stock leg here.
 *
 *  - For partially-closed lots, scale (|proceeds| + |fee|) by
 *    remaining_qty / original_qty. This matches the FIFO consumption the
 *    statement applies when sells reduce the lot.
 *
 *  - LSE ordinary-share prices come from Stooq in **pence (GBp)**. The
 *    Stooq fetcher already divides by 100 for those tickers (see
 *    stooq-symbol-map.ts), so by the time a quote reaches this function it
 *    is in pounds. Don't scale again.
 *
 *  - When the quote currency differs from the trade currency (e.g. IEMM on
 *    Euronext Amsterdam in EUR but priced via EIMI on LSE in GBP), the
 *    function still returns a P/L — but mark `approximated: true` so the
 *    UI can flag it.
 *
 * Inputs are stringified Decimals so we don't lose precision at JSON
 * boundaries. The function never returns NaN — every code path returns
 * either valid numbers or `null` for the P/L when the input is incomplete.
 */
export type ResolvedLot = {
  /** Quantity remaining open on this lot (post-FIFO sells). */
  remainingQty: string;
  /** Original buy quantity from the source transaction. */
  originalQty: string;
  /** Signed buy proceeds in trade currency (typically negative for buys). */
  proceeds: string;
  /** Trade commission in trade currency (sign-agnostic). */
  fee: string;
};

export type UnrealizedInput = {
  lots: ResolvedLot[];
  tradeCurrency: string;
  /** Latest known price in `quoteCurrency`. */
  lastPrice: string | number;
  quoteCurrency: string;
  /** Latest <ccy>-per-EUR rates from `fx_rates`, used when quote and trade ccy differ. */
  fxRatesPerEur: Map<string, number>;
};

export type UnrealizedResult = {
  costBasisNative: number;     // in tradeCurrency
  marketValueNative: number;   // in tradeCurrency
  unrealizedPnlNative: number; // in tradeCurrency
  unrealizedPctNative: number; // (market - cost) / cost * 100
  qty: number;
  avgPriceNative: number;
  /** True when the quote currency was different from the trade currency. */
  approximated: boolean;
};

export function computeUnrealizedPnL(input: UnrealizedInput): UnrealizedResult | null {
  if (input.lots.length === 0) return null;

  let qty = new Decimal(0);
  let cost = new Decimal(0);
  for (const lot of input.lots) {
    const remain = new Decimal(lot.remainingQty);
    const orig = new Decimal(lot.originalQty);
    if (orig.lte(0) || remain.lte(0)) continue;
    const proceedsAbs = new Decimal(lot.proceeds).abs();
    const feeAbs = new Decimal(lot.fee).abs();
    const ratio = remain.div(orig);
    qty = qty.plus(remain);
    cost = cost.plus(proceedsAbs.plus(feeAbs).mul(ratio));
  }
  if (qty.lte(0)) return null;

  const pricePerUnit = nativePrice(
    new Decimal(input.lastPrice),
    input.quoteCurrency,
    input.tradeCurrency,
    input.fxRatesPerEur,
  );
  if (pricePerUnit === null) return null;

  const market = qty.mul(pricePerUnit);
  const pnl = market.minus(cost);
  const pct = cost.eq(0) ? new Decimal(0) : pnl.div(cost).mul(100);

  return {
    costBasisNative: cost.toDecimalPlaces(2).toNumber(),
    marketValueNative: market.toDecimalPlaces(2).toNumber(),
    unrealizedPnlNative: pnl.toDecimalPlaces(2).toNumber(),
    unrealizedPctNative: pct.toDecimalPlaces(2).toNumber(),
    qty: qty.toNumber(),
    avgPriceNative: cost.div(qty).toDecimalPlaces(4).toNumber(),
    approximated: input.quoteCurrency !== input.tradeCurrency,
  };
}

/**
 * Convert a quote price from `quoteCurrency` to `tradeCurrency`. ECB rates
 * are stored as `<ccy>-per-1-EUR`, so EUR is the pivot.
 */
function nativePrice(
  price: Decimal,
  quoteCurrency: string,
  tradeCurrency: string,
  fxRates: Map<string, number>,
): Decimal | null {
  if (quoteCurrency === tradeCurrency) return price;
  if (quoteCurrency === "EUR") {
    const fxTrade = fxRates.get(tradeCurrency);
    if (fxTrade === undefined) return null;
    return price.mul(fxTrade);
  }
  if (tradeCurrency === "EUR") {
    const fxQuote = fxRates.get(quoteCurrency);
    if (fxQuote === undefined || fxQuote === 0) return null;
    return price.div(fxQuote);
  }
  const fxQuote = fxRates.get(quoteCurrency);
  const fxTrade = fxRates.get(tradeCurrency);
  if (fxQuote === undefined || fxQuote === 0 || fxTrade === undefined) return null;
  return price.div(fxQuote).mul(fxTrade);
}
