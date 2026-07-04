/**
 * Manual-link parser — PURE.
 *
 * The user pastes a URL from a finance site to pin an instrument to a
 * specific provider/listing when auto-resolution fails or is ambiguous.
 * This module turns a supported URL into a {@link ManualLink}, or an
 * `{ error }` describing why it could not. No I/O — just URL parsing.
 *
 * Supported hosts: justETF, Yahoo Finance, Google Finance, Stockopedia.
 */
import type { ManualLink } from "./types";

/**
 * Maps a Google/Stockopedia `EXCHANGE` code to the suffix Yahoo Finance
 * appends to a ticker (e.g. Google `TRN:LON` → Yahoo `TRN.L`). An empty
 * string means a US listing, where the Yahoo symbol is the bare ticker.
 *
 * Extensible: add one entry per line as new venues are encountered.
 */
export const EXCHANGE_SUFFIX: Record<string, string> = {
  LON: ".L", // London Stock Exchange
  ETR: ".DE", // Xetra
  FRA: ".F", // Frankfurt
  GER: ".DE", // Xetra (Google alias)
  EPA: ".PA", // Euronext Paris
  AMS: ".AS", // Euronext Amsterdam
  STU: ".SG", // Stuttgart
  SWX: ".SW", // SIX Swiss Exchange
  EBS: ".SW", // SIX Swiss Exchange (alias)
  BIT: ".MI", // Borsa Italiana / Milan
  MIL: ".MI", // Milan (alias)
  MCE: ".MC", // Bolsa de Madrid
  BME: ".MC", // Bolsa de Madrid (alias)
  TSE: ".T", // Tokyo Stock Exchange
  HKG: ".HK", // Hong Kong Stock Exchange
  NYSE: "", // US listing — bare ticker
  NASDAQ: "", // US listing — bare ticker
  NYSEARCA: "", // US listing — bare ticker
  BATS: "", // US listing — bare ticker
};

/** A 12-char ISIN, optionally with a Yahoo-style `.SG` venue suffix. */
const ISIN_WITH_SUFFIX = /^([A-Z]{2}[A-Z0-9]{9}[0-9])(\.[A-Z]+)?$/;

/**
 * Parse a pasted finance URL into a {@link ManualLink}, or `{ error }` if
 * the host is unsupported, a required part is missing, or the URL is
 * malformed.
 */
export function parseManualLink(url: string): ManualLink | { error: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: `Malformed URL: ${url}` };
  }

  const host = parsed.hostname.toLowerCase();
  const segments = parsed.pathname.split("/").filter(Boolean);

  switch (host) {
    case "www.justetf.com":
    case "justetf.com":
      return parseJustetf(parsed);
    case "finance.yahoo.com":
      return parseYahoo(segments);
    case "www.google.com":
    case "google.com":
      return parseGoogle(segments);
    case "www.stockopedia.com":
    case "stockopedia.com":
      return parseStockopedia(segments);
    default:
      return {
        error: `Unsupported host: ${host}. Paste a Yahoo Finance, justETF, Google Finance or Stockopedia link.`,
      };
  }
}

function parseJustetf(parsed: URL): ManualLink | { error: string } {
  const isin = parsed.searchParams.get("isin");
  if (!isin) {
    return { error: "justETF link is missing the ?isin= parameter." };
  }
  return { provider: "justetf", isin };
}

function parseYahoo(segments: string[]): ManualLink | { error: string } {
  // /quote/{SYM}, also /quote/{SYM}/history — take the segment after "quote".
  const quoteIdx = segments.indexOf("quote");
  const sym = quoteIdx >= 0 ? segments[quoteIdx + 1] : undefined;
  if (!sym) {
    return { error: "Yahoo Finance link is missing the /quote/{symbol} path." };
  }
  const yahooSymbol = decodeURIComponent(sym);
  const isinMatch = ISIN_WITH_SUFFIX.exec(yahooSymbol);
  if (isinMatch) {
    return { provider: "yahoo", yahooSymbol, isin: isinMatch[1] };
  }
  return { provider: "yahoo", yahooSymbol };
}

function parseGoogle(segments: string[]): ManualLink | { error: string } {
  // /finance/quote/{TICKER}:{EXCHANGE} or /finance/beta/quote/{TICKER}:{EXCHANGE}
  const quoteIdx = segments.indexOf("quote");
  const pair = quoteIdx >= 0 ? segments[quoteIdx + 1] : undefined;
  if (!pair || !pair.includes(":")) {
    return {
      error: "Google Finance link is missing the /finance/quote/{ticker}:{exchange} path.",
    };
  }
  const [ticker, exchange] = decodeURIComponent(pair).split(":");
  return toYahooFromExchange(ticker, exchange);
}

function parseStockopedia(segments: string[]): ManualLink | { error: string } {
  // /share-prices/{slug}-{EXCHANGE}:{TICKER}/  e.g. trainline-LON:TRN
  const priceIdx = segments.indexOf("share-prices");
  const slug = priceIdx >= 0 ? segments[priceIdx + 1] : undefined;
  if (!slug || !slug.includes(":")) {
    return {
      error:
        "Stockopedia link is missing the /share-prices/{slug}-{exchange}:{ticker}/ path.",
    };
  }
  // The exchange:ticker lives in the last "-"-delimited segment of the slug.
  const lastSeg = decodeURIComponent(slug).split("-").pop() ?? "";
  const [exchange, ticker] = lastSeg.split(":");
  return toYahooFromExchange(ticker, exchange);
}

/** Shared EXCHANGE_SUFFIX conversion for Google/Stockopedia ticker:exchange. */
function toYahooFromExchange(
  ticker: string | undefined,
  exchange: string | undefined,
): ManualLink | { error: string } {
  if (!ticker || !exchange) {
    return { error: "Could not parse ticker and exchange from link." };
  }
  const suffix = EXCHANGE_SUFFIX[exchange];
  if (suffix === undefined) {
    return { error: `Unknown exchange code: ${exchange}` };
  }
  return {
    provider: "yahoo",
    ticker,
    exchange,
    yahooSymbol: ticker + suffix,
  };
}
