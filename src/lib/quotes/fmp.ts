/**
 * Financial Modeling Prep (FMP) quote source.
 *
 * As of late 2025 FMP deprecated their /api/v3 namespace. The new
 * /stable/quote endpoint is single-symbol only on the free tier
 * (batch quotes, international tickers, and the legacy /api/v3 paths
 * all require a paid plan).
 *
 * Free tier: 250 requests/day. For our ~14 US holdings that's 14
 * requests per refresh; the daily cron + an occasional manual click
 * stays comfortably under 250. Calls fan out in parallel — FMP free
 * doesn't publish a per-minute cap and the per-call latency is
 * ~200-300 ms, so 14 parallel requests resolve in well under 1 s.
 *
 * International tickers fall through to Twelve Data, which is the
 * only free provider that prices LSE / Xetra / Amsterdam without
 * upgrading.
 */

export type Quote = { symbol: string; date: string; close: string; currency: string };

const BASE = "https://financialmodelingprep.com/stable";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json",
};

/**
 * Pure parser for FMP's /stable/quote response (one symbol per call,
 * returns a one-element array). Defensive against:
 *  - error envelopes ({"Error Message": "..."} or {"message": "..."})
 *    served when the key is bad, the daily limit is hit, or the
 *    endpoint requires a higher plan ("Legacy Endpoint", "Premium
 *    only", etc.)
 *  - empty array (symbol unknown to FMP — e.g. an international
 *    ticker on the free tier, or a Freedom24 alias like RY4C)
 *  - missing price / timestamp
 *  - symbol mismatch (defensive — don't smuggle a stray response into
 *    the cache under the wrong ticker)
 */
export function parseFmpQuoteResponse(json: unknown, requestedSymbol: string): Quote | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = json[0] as any;
  if (!e || typeof e !== "object") return null;
  if (e.symbol !== requestedSymbol) return null;
  const price = typeof e.price === "number" ? e.price : null;
  const ts = typeof e.timestamp === "number" ? e.timestamp : null;
  if (price === null || ts === null) return null;
  if (!Number.isFinite(price) || !Number.isFinite(ts)) return null;
  const date = new Date(ts * 1000).toISOString().slice(0, 10);
  return { symbol: requestedSymbol, date, close: price.toFixed(2), currency: "USD" };
}

async function fetchOneFmpQuote(symbol: string, apiKey: string): Promise<Quote | null> {
  const url =
    `${BASE}/quote?symbol=${encodeURIComponent(symbol)}` +
    `&apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!res.ok) return null;
  const json = await res.json();
  return parseFmpQuoteResponse(json, symbol);
}

export async function fetchFmpQuotes(symbols: string[]): Promise<Quote[]> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey || !symbols.length) return [];

  const results = await Promise.allSettled(
    symbols.map((s) => fetchOneFmpQuote(s, apiKey)),
  );
  const out: Quote[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) out.push(r.value);
  }
  return out;
}
