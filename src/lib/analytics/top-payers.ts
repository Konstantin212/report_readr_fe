import Decimal from "decimal.js";

export type TopPayer = { ticker: string; totalEur: number; count: number };

export function topDividendPayers(
  dividends: { ticker: string; amountEur: number }[],
  limit = 5,
): TopPayer[] {
  if (dividends.length === 0) return [];

  const map = new Map<string, { total: Decimal; count: number }>();

  for (const d of dividends) {
    const prev = map.get(d.ticker) ?? { total: new Decimal(0), count: 0 };
    map.set(d.ticker, { total: prev.total.plus(d.amountEur), count: prev.count + 1 });
  }

  const result: TopPayer[] = [...map.entries()].map(([ticker, { total, count }]) => ({
    ticker,
    totalEur: total.toNumber(),
    count,
  }));

  result.sort((a, b) => {
    if (b.totalEur !== a.totalEur) return b.totalEur - a.totalEur;
    return a.ticker.localeCompare(b.ticker);
  });

  return result.slice(0, limit);
}
