import { toYahooSymbol } from "./symbol-map";

export type Quote = { symbol: string; date: string; currency: string; close: string };

export async function fetchYahooQuotes(symbols: string[]): Promise<Quote[]> {
  if (!symbols.length) return [];
  const mapped = symbols.map(toYahooSymbol).join(",");
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(mapped)}`;
  const res = await fetch(url, { headers: { "User-Agent": "portfolio-tax/1.0" }, cache: "no-store" });
  if (!res.ok) throw new Error(`YAHOO_${res.status}`);
  const json = await res.json() as { quoteResponse: { result: Array<{ symbol: string; regularMarketPrice: number; currency: string; regularMarketTime: number }> } };
  return json.quoteResponse.result.map((r, i) => ({
    symbol: symbols[i],
    date: new Date(r.regularMarketTime * 1000).toISOString().slice(0, 10),
    currency: r.currency,
    close: String(r.regularMarketPrice),
  }));
}
