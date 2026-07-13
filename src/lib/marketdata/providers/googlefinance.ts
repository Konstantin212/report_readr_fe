/**
 * Google Finance quote provider (non-US stocks).
 *
 * Yahoo's chart endpoint is blocked/throttled from our Vercel data-center IP,
 * and justETF/finviz don't cover individual LSE/EU stocks (Trainline TRN:LON,
 * etc.). Google Finance IS reachable from the data-center IP, so we scrape the
 * quote page. The current price is the FIRST "{CURRENCY} {price}" token in the
 * page (the stats — prev close, high, low — follow it). GBX (pence) → GBP ÷100.
 *
 * The parse half is PURE + unit-tested; the fetch half is the thin I/O shell.
 * Used only via a manual link (the user pins Google Finance for an instrument),
 * so volume is a handful of symbols — one request each.
 */
import type { QuoteResult } from "../types";

const QUOTE_ENDPOINT = "https://www.google.com/finance/quote";

const GOOGLE_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const REQUEST_TIMEOUT_MS = 10_000;

// Only match real ISO currency codes so a stray "ABC 12.34" elsewhere in the
// markup can't be mistaken for the price.
const PRICE_RE =
  /\b(GBX|GBP|USD|EUR|CHF|JPY|CAD|AUD|HKD|SEK|NOK|DKK|PLN|ZAR|SGD)\s+([\d,]+\.\d+)/;

/**
 * Extract the current price from a Google Finance quote page. The first
 * currency-prefixed number is the live/last price; GBX pence is normalised to
 * GBP. Returns null when no price token is present. `now` dates the quote (GF
 * doesn't expose a clean EOD date on the price).
 */
export function parseGoogleFinanceQuote(html: string, now: Date = new Date()): QuoteResult {
  if (!html) return null;
  const m = PRICE_RE.exec(html);
  if (!m) return null;

  let currency = m[1];
  let price = Number(m[2].replace(/,/g, ""));
  if (!Number.isFinite(price) || price <= 0) return null;

  if (currency === "GBX") {
    price = price / 100;
    currency = "GBP";
  }
  return { close: price.toFixed(2), currency, date: now.toISOString().slice(0, 10), source: "GOOGLE" };
}

/** Fetch + parse one instrument's price from Google Finance. Any failure → null. */
export async function fetchGoogleFinanceQuote(ticker: string, exchange: string): Promise<QuoteResult> {
  if (!ticker || !exchange) return null;
  // ucbcb=1 bypasses the EU consent interstitial that otherwise 302s us away.
  const url = `${QUOTE_ENDPOINT}/${encodeURIComponent(ticker)}:${encodeURIComponent(exchange)}?ucbcb=1`;
  try {
    const res = await fetch(url, {
      headers: GOOGLE_HEADERS,
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return parseGoogleFinanceQuote(await res.text());
  } catch {
    return null;
  }
}
