/**
 * Twelve Data quote source.
 *
 * Free tier: 800 requests/day, 8/min. Batched /quote returns the
 * latest close + datetime + currency for up to 8 symbols per call,
 * so 20 holdings → 3 requests → well within both limits.
 *
 * Crucially: Twelve Data accepts requests from data-center IP ranges,
 * which means it works from Vercel where Yahoo (Unauthorized) and
 * Stooq (JS bot challenge) currently don't.
 *
 * Activated by setting TWELVE_DATA_API_KEY. When the key is absent
 * (e.g. local dev without a key), the cron falls back to Yahoo → Stooq
 * and we behave as before.
 */
import { toYahooSymbol } from "./symbol-map";

export type Quote = { symbol: string; date: string; close: string; currency: string };

export const TWELVE_DATA_MAX_BATCH = 8;

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

/**
 * Pure parser for a batched /quote response. Twelve Data shapes the
 * batched reply as `{ SYMBOL: <quote-or-error>, ... }` when the
 * request had ≥2 symbols, but unwraps to a bare quote object for a
 * single symbol. Handle both.
 *
 * `requestedSymbols` is the list we sent (in our internal form) and
 * is used to key the output back to our internal ticker — Twelve
 * Data may echo a normalised symbol (e.g. `TRN` for `TRN.L`).
 */
export function parseTwelveDataBatch(json: unknown, requestedSymbols: string[]): Quote[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj = json as any;
  if (!obj || typeof obj !== "object") return [];
  // Whole-batch failure.
  if (obj.code && typeof obj.code === "number" && obj.code >= 400) return [];
  if (obj.status === "error") return [];

  // Single-symbol shape: top-level keys look like a quote (datetime+close).
  if (typeof obj.datetime === "string" && obj.close !== undefined) {
    const sym = requestedSymbols[0];
    if (!sym) return [];
    const q = parseTwelveDataQuote(obj, sym);
    return q ? [q] : [];
  }

  // Multi-symbol shape: {SYMBOL: quote-or-error}. Map the per-key reply
  // back to our internal ticker.
  const out: Quote[] = [];
  for (const requested of requestedSymbols) {
    // Twelve Data keys the batch by the symbol exactly as the caller
    // submitted it (incl. suffixes like ".L" or ".DE"), so a direct
    // lookup works without normalisation.
    const entry = obj[requested];
    if (!entry) continue;
    const q = parseTwelveDataQuote(entry, requested);
    if (q) out.push(q);
  }
  return out;
}

export async function fetchTwelveDataQuotes(symbols: string[]): Promise<Quote[]> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey || !symbols.length) return [];

  // Translate our internal symbols to Twelve Data form (matches Yahoo's
  // suffix style: .L, .DE, .AS, .ST, …). Keep a back-map so we can
  // re-key the response to our internal ticker.
  const externalForInternal = new Map<string, string>();
  for (const s of symbols) externalForInternal.set(s, toYahooSymbol(s));

  const out: Quote[] = [];
  for (let i = 0; i < symbols.length; i += TWELVE_DATA_MAX_BATCH) {
    const slice = symbols.slice(i, i + TWELVE_DATA_MAX_BATCH);
    const externals = slice.map((s) => externalForInternal.get(s) ?? s);
    const url = `${BASE}/quote?symbol=${encodeURIComponent(externals.join(","))}&apikey=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) continue;
    const json = await res.json();
    // The Twelve Data response is keyed by the EXTERNAL symbol we sent.
    // parseTwelveDataBatch expects to look up by the same key, so pass
    // the externals (and re-key back to internals afterwards).
    const parsed = parseTwelveDataBatch(json, externals);
    for (const q of parsed) {
      const internal = slice[externals.indexOf(q.symbol)];
      if (!internal) continue;
      out.push({ ...q, symbol: internal });
    }
  }
  return out;
}

/** Convenience single-symbol wrapper that fits the same shape as
 *  fetchYahooQuote / fetchStooqQuote so the orchestrator can treat all
 *  three providers symmetrically. */
export async function fetchTwelveDataQuote(symbol: string): Promise<Quote | null> {
  const quotes = await fetchTwelveDataQuotes([symbol]);
  return quotes[0] ?? null;
}
