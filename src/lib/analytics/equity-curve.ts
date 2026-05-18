import Decimal from "decimal.js";

export type EquityPoint = { date: string; valueEur: number };

export type EquityCurveInput = {
  /** ISO YYYY-MM-DD dates, sorted ascending */
  monthEnds: string[];
  /** date → symbol → qty */
  holdings: Record<string, Record<string, number>>;
  /** key = `${symbol}|${date}` → close in native currency */
  closesBySymbolDate: Map<string, number>;
  /** symbol → currency code */
  currencyBySymbol: Map<string, string>;
  /** key = `${date}|${currency}` → rate (1 EUR = X foreign) */
  fxRates: Map<string, number>;
};

export function computeEquityCurve(input: EquityCurveInput): EquityPoint[] {
  const { monthEnds, holdings, closesBySymbolDate, currencyBySymbol, fxRates } = input;

  if (monthEnds.length === 0) return [];

  return monthEnds.map((date) => {
    const positionsOnDate = holdings[date] ?? {};
    let total = new Decimal(0);

    for (const [symbol, qty] of Object.entries(positionsOnDate)) {
      const closeKey = `${symbol}|${date}`;
      const close = closesBySymbolDate.get(closeKey);
      if (close === undefined) continue;

      const currency = currencyBySymbol.get(symbol) ?? "EUR";

      let valueEur: Decimal;
      if (currency === "EUR") {
        valueEur = new Decimal(qty).mul(close);
      } else {
        const fxKey = `${date}|${currency}`;
        const fxRate = fxRates.get(fxKey);
        if (fxRate === undefined || fxRate === 0) continue;
        valueEur = new Decimal(qty).mul(close).div(fxRate);
      }

      total = total.plus(valueEur);
    }

    return { date, valueEur: total.toNumber() };
  });
}
