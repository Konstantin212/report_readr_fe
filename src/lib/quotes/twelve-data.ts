/**
 * Twelve Data quote source.
 *
 * Free tier: 800 requests/day, 8 credits/min — each symbol in a
 * request counts as 1 credit regardless of whether it was sent
 * batched or per-symbol. The cron only ever asks for the 8 most-stale
 * symbols per run, so we stay right at the per-minute ceiling.
 *
 * Crucially: Twelve Data accepts requests from data-center IP ranges,
 * which means it works from Vercel where Yahoo (Unauthorized) and
 * Stooq (JS bot challenge) currently don't.
 *
 * Activated by setting TWELVE_DATA_API_KEY. When the key is absent
 * (e.g. local dev without a key), the orchestrator falls back to the
 * other providers in the chain.
 *
 * Why per-symbol parallel instead of batched: TD's batched /quote can
 * accept one global `&exchange=` query parameter, but our portfolio
 * mixes US (no exchange), LSE, XETR and Euronext tickers in the same
 * 8-symbol page. A single batched call can't specify a different
 * exchange per symbol, and bare `TRN` silently resolves to Trinity
 * Industries on NYSE instead of Trainline on LSE. Per-symbol calls
 * let us pass each ticker's exchange explicitly, which both fixes
 * disambiguation and matches how TD's API contract is actually shaped.
 */
import { toTwelveDataSymbol } from "./symbol-map";

export type Quote = { symbol: string; date: string; close: string; currency: string };

const BASE = "https://api.twelvedata.com";

/**
 * Pure parser for a single /quote response object. Returns null on any
 * shape that doesn't look like a quote — error envelopes ({code, message})
 * and missing-close cases all collapse to null so the caller can fall
 * back to the next source.
 */
export function parseTwelveDataQuote(json: unknown, symbol: string): Quote | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj = json as any;
  if (!obj || typeof obj !== "object") return null;
  // Twelve Data signals errors with either {code, message} or {status: "error"}.
  if (obj.code && typeof obj.code === "number" && obj.code >= 400) return null;
  if (obj.status === "error") return null;
  const datetime = typeof obj.datetime === "string" ? obj.datetime : undefined;
  const close = obj.close;
  if (!datetime || !close || close === "N/D") return null;
  const date = datetime.slice(0, 10);
  let rawClose = Number(close);
  if (!Number.isFinite(rawClose)) return null;
  let currency = typeof obj.currency === "string" ? obj.currency : "USD";
  if (currency === "GBp") {
    // LSE ordinary shares quote in pence; normalize to GBP so downstream
    // FX math doesn't need to special-case the venue.
    rawClose = rawClose / 100;
    currency = "GBP";
  }
  return { symbol, date, close: rawClose.toFixed(2), currency };
}

async function fetchOneTwelveDataQuote(internal: string, apiKey: string): Promise<Quote | null> {
  const { symbol: ext, exchange } = toTwelveDataSymbol(internal);
  let url =
    `${BASE}/quote?symbol=${encodeURIComponent(ext)}` +
    `&apikey=${encodeURIComponent(apiKey)}`;
  if (exchange) url += `&exchange=${encodeURIComponent(exchange)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const json = await res.json();
  const q = parseTwelveDataQuote(json, ext);
  if (!q) return null;
  // Re-key to the internal ticker so the cache write doesn't go under
  // whatever TD echoed back (e.g. `TRN` echoed for `TRN:LSE`).
  return { ...q, symbol: internal };
}

export async function fetchTwelveDataQuotes(symbols: string[]): Promise<Quote[]> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey || !symbols.length) return [];
  const results = await Promise.allSettled(
    symbols.map((s) => fetchOneTwelveDataQuote(s, apiKey)),
  );
  const out: Quote[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) out.push(r.value);
  }
  return out;
}

/** Convenience single-symbol wrapper that fits the same shape as
 *  fetchYahooQuote / fetchStooqQuote so the orchestrator can treat all
 *  providers symmetrically. */
export async function fetchTwelveDataQuote(symbol: string): Promise<Quote | null> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return null;
  return fetchOneTwelveDataQuote(symbol, apiKey);
}
