import { toYahooSymbol } from "./symbol-map";

export const YAHOO_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

export type Quote = { symbol: string; date: string; currency: string; close: string };

export async function fetchYahooQuotes(symbols: string[]): Promise<Quote[]> {
  if (!symbols.length) return [];
  const mapped = symbols.map(toYahooSymbol).join(",");
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(mapped)}`;
  const res = await fetch(url, { headers: YAHOO_HEADERS, cache: "no-store" });
  if (!res.ok) throw new Error(`YAHOO_${res.status}`);
  const json = await res.json() as { quoteResponse: { result: Array<{ symbol: string; regularMarketPrice: number; currency: string; regularMarketTime: number }> } };
  return json.quoteResponse.result.map((r, i) => ({
    symbol: symbols[i],
    date: new Date(r.regularMarketTime * 1000).toISOString().slice(0, 10),
    currency: r.currency,
    close: String(r.regularMarketPrice),
  }));
}
