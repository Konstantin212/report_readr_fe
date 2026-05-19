import Decimal from "decimal.js";

/**
 * Dual-view Unrealized P&L for a position. The same lots and the same
 * current price produce two complementary numbers:
 *
 *   `broker`  cost basis = Σ |proceeds|              × ratio   (per lot)
 *             — matches the brokerage UI's "Entry Price × qty".
 *             Fees are excluded; the view answers "did the share price
 *             move?".
 *
 *   `net`     cost basis = Σ (|proceeds| + |fee|)    × ratio   (per lot)
 *             — German Anschaffungskosten. Fees are part of the
 *             tax-deductible acquisition cost. This is the figure that
 *             feeds Anlage KAP.
 *
 * Dividends are NOT layered in here — they aren't unrealized P/L. The
 * position-data accessor adds them on top of `net` when composing the
 * full row metrics.
 *
 * Both views share `qty`, `marketValueNative`, `approximated`, and the
 * underlying FX conversion. Only the cost-side numbers differ.
 *
 * For partially-closed lots, both the gross proceeds AND the fee scale
 * by remainingQty / originalQty so FIFO sells reduce both proportionally.
 *
 * LSE pence quotes are already de-scaled by the Stooq fetcher; this
 * function works in unit-currency.
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

export type ViewMetrics = {
  costBasisNative: number;     // in tradeCurrency
  marketValueNative: number;   // in tradeCurrency
  unrealizedPnlNative: number; // in tradeCurrency
  unrealizedPctNative: number; // (market - cost) / cost * 100
  avgPriceNative: number;
};

export type UnrealizedResult = {
  qty: number;
  /** True when the quote currency was different from the trade currency. */
  approximated: boolean;
  /** Cost excludes fees — matches the broker's "Entry Price × qty". */
  broker: ViewMetrics;
  /** Cost includes fees — German Anschaffungskosten. */
  net: ViewMetrics;
};

export function computeUnrealizedPnL(input: UnrealizedInput): UnrealizedResult | null {
  if (input.lots.length === 0) return null;

  let qty = new Decimal(0);
  let costGross = new Decimal(0);
  let feesScaled = new Decimal(0);
  for (const lot of input.lots) {
    const remain = new Decimal(lot.remainingQty);
    const orig = new Decimal(lot.originalQty);
    if (orig.lte(0) || remain.lte(0)) continue;
    const proceedsAbs = new Decimal(lot.proceeds).abs();
    const feeAbs = new Decimal(lot.fee).abs();
    const ratio = remain.div(orig);
    qty = qty.plus(remain);
    costGross = costGross.plus(proceedsAbs.mul(ratio));
    feesScaled = feesScaled.plus(feeAbs.mul(ratio));
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
  const costNet = costGross.plus(feesScaled);

  return {
    qty: qty.toNumber(),
    approximated: input.quoteCurrency !== input.tradeCurrency,
    broker: buildView(costGross, market, qty),
    net: buildView(costNet, market, qty),
  };
}

function buildView(cost: Decimal, market: Decimal, qty: Decimal): ViewMetrics {
  const pnl = market.minus(cost);
  const pct = cost.eq(0) ? new Decimal(0) : pnl.div(cost).mul(100);
  return {
    costBasisNative: cost.toDecimalPlaces(2).toNumber(),
    marketValueNative: market.toDecimalPlaces(2).toNumber(),
    unrealizedPnlNative: pnl.toDecimalPlaces(2).toNumber(),
    unrealizedPctNative: pct.toDecimalPlaces(2).toNumber(),
    avgPriceNative: cost.div(qty).toDecimalPlaces(4).toNumber(),
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
