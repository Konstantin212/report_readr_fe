/**
 * Financial Modeling Prep (FMP) quote source.
 *
 * Free tier: 250 requests/day, no per-minute cap, *unlimited symbols
 * per batched request*. US stocks (NYSE/NASDAQ/AMEX) only on free —
 * European exchanges (LSE/Xetra/AS) require a paid plan and silently
 * return nothing on free, so we let the orchestrator fall back to
 * Twelve Data for those.
 *
 * Sits ahead of Twelve Data in the priority chain because one batched
 * call can carry the whole US portfolio (typically 10-15 of 20
 * holdings) for the cost of 1 request, leaving Twelve Data's 8/min cap
 * unspent for the international tickers that *only* TD can serve.
 */

export type Quote = { symbol: string; date: string; close: string; currency: string };

const BASE = "https://financialmodelingprep.com/api/v3";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json",
};

/**
 * Pure parser for FMP's /quote/{tickers} response. Defensive against:
 *  - error envelopes ({"Error Message": "..."} or {"message": "..."})
 *    served when the API key is invalid or the daily limit is hit
 *  - entries with null price or timestamp (very rare, but cleaner to
 *    drop than to write zero-priced rows)
 *  - symbols FMP echoes back that weren't in the request (defensive —
 *    never write into the cache for a ticker we didn't ask for)
 */
export function parseFmpBatch(json: unknown, requestedSymbols: string[]): Quote[] {
  if (!Array.isArray(json)) return [];
  const requested = new Set(requestedSymbols);
  const out: Quote[] = [];
  for (const entry of json) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = entry as any;
    if (!e || typeof e !== "object") continue;
    const symbol = typeof e.symbol === "string" ? e.symbol : null;
    if (!symbol || !requested.has(symbol)) continue;
    const price = typeof e.price === "number" ? e.price : null;
    const ts = typeof e.timestamp === "number" ? e.timestamp : null;
    if (price === null || ts === null) continue;
    if (!Number.isFinite(price) || !Number.isFinite(ts)) continue;
    const date = new Date(ts * 1000).toISOString().slice(0, 10);
    out.push({ symbol, date, close: price.toFixed(2), currency: "USD" });
  }
  return out;
}

export async function fetchFmpQuotes(symbols: string[]): Promise<Quote[]> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey || !symbols.length) return [];

  // FMP accepts an unlimited list of comma-separated tickers in a
  // single batched /quote call. One HTTP call = 1 of our 250 daily
  // requests, regardless of N.
  const tickers = symbols.join(",");
  const url = `${BASE}/quote/${encodeURIComponent(tickers)}?apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!res.ok) return [];
  const json = await res.json();
  return parseFmpBatch(json, symbols);
}
