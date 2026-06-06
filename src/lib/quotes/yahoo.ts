import { toYahooSymbol } from "./symbol-map";

/**
 * Yahoo Finance chart-API quote source.
 *
 * We previously used Yahoo's `v7/finance/quote` endpoint, but in 2025
 * Yahoo started returning `Unauthorized` for unauthenticated callers
 * (`User is unauthorized`). Stooq's CSV worked for a while as a
 * substitute, but mid-2026 they added a JavaScript proof-of-work bot
 * challenge that our serverless `fetch()` can't solve — the cron then
 * silently fetched nothing and the quote cache went stale, manifesting
 * as P/L numbers off by a full trading day's price move.
 *
 * Yahoo's `v8/finance/chart` endpoint is still public, returns JSON
 * with a small window of daily candles, and lets us read the latest
 * non-null close. One HTTP call per symbol (Yahoo doesn't batch chart
 * calls); ~200-400 ms each is fine within the 60 s Hobby cap.
 */

export const YAHOO_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

export type Quote = { symbol: string; date: string; currency: string; close: string };

/**
 * Pure parser for a `v8/finance/chart` response. Walks the close array
 * from the tail forward so a trailing null (Yahoo sometimes pads the
 * array when a session hasn't reported yet) doesn't kill the read.
 * Normalises `GBp` (LSE pence) into `GBP` units so downstream FX math
 * doesn't have to special-case the venue.
 */
export function parseYahooChart(json: unknown, symbol: string): Quote | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = (json as any)?.chart?.result?.[0];
  if (!r) return null;
  const timestamps: number[] | undefined = r.timestamp;
  const closes: (number | null)[] | undefined = r.indicators?.quote?.[0]?.close;
  const rawCurrency: string | undefined = r.meta?.currency;
  if (!timestamps?.length || !closes?.length) return null;

  let idx = -1;
  for (let i = closes.length - 1; i >= 0; i--) {
    const c = closes[i];
    if (c !== null && c !== undefined && Number.isFinite(c)) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return null;

  const date = new Date((timestamps[idx] ?? 0) * 1000).toISOString().slice(0, 10);
  let close = closes[idx] as number;
  let currency = rawCurrency ?? "USD";
  if (currency === "GBp") {
    close = close / 100;
    currency = "GBP";
  }
  return { symbol, date, close: close.toFixed(2), currency };
}

export async function fetchYahooQuote(symbol: string): Promise<Quote | null> {
  const yahooSymbol = toYahooSymbol(symbol);
  const url =
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}` +
    `?interval=1d&range=5d`;
  let res = await fetch(url, { headers: YAHOO_HEADERS, cache: "no-store" });
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 3_000));
    res = await fetch(url, { headers: YAHOO_HEADERS, cache: "no-store" });
  }
  if (!res.ok) return null;
  const json = await res.json();
  return parseYahooChart(json, symbol);
}

export async function fetchYahooQuotes(symbols: string[]): Promise<Quote[]> {
  if (!symbols.length) return [];
  const results = await Promise.allSettled(symbols.map((s) => fetchYahooQuote(s)));
  const out: Quote[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) out.push(r.value);
  }
  return out;
}
