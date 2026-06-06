/**
 * Stooq spot quotes — free, no API key, no batched-symbol support.
 *
 * One HTTP call per symbol. Stooq is fast (~300-500ms each) so 10 symbols
 * runs in ~5s, comfortable under the 60s Hobby cap.
 *
 * Stooq doesn't gate the live-quote endpoint behind a key (unlike its
 * historical endpoint), so this works reliably without rate-limit issues
 * at our scale.
 */
import { resolveStooq } from "./stooq-symbol-map";

export type StooqQuote = {
  symbol: string;
  date: string;     // ISO YYYY-MM-DD
  close: string;
  currency: string;
};

const ENDPOINT = "https://stooq.com/q/l/";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/csv,text/plain,*/*",
};

// Stooq returns the close currency by suffix (.us=USD, .uk=GBp/GBP, .de=EUR, etc.).
// Build the inferred currency from the suffix; the caller can override.
function currencyForStooqSuffix(stooqSymbol: string): string {
  if (stooqSymbol.startsWith("^")) return "USD";
  const suffix = stooqSymbol.slice(stooqSymbol.lastIndexOf(".") + 1).toLowerCase();
  switch (suffix) {
    case "us": return "USD";
    case "uk": return "GBP";   // Stooq returns pence; we treat as GBP for now (positions handle FX)
    case "de": return "EUR";
    case "nl": return "EUR";
    case "fr": return "EUR";
    case "se": return "SEK";
    case "ch": return "CHF";
    case "jp": return "JPY";
    case "hk": return "HKD";
    default:   return "USD";
  }
}

/**
 * Pure parser for Stooq's CSV reply. Extracted so we can unit-test it
 * directly — Stooq has, at different times, returned: real CSV, an
 * "N/D" row for missing data, an HTML error page, and (as of mid-2026)
 * a JavaScript proof-of-work bot challenge. The latter would have
 * slipped past a naive line/cell split and inserted JS-blob substrings
 * into quote_cache; reject anything that doesn't look like the CSV
 * header we expect.
 *
 * Returns `{date, closeRaw}` so the caller can apply the scale (e.g.
 * LSE pence → GBP) on top of the parsed string.
 */
export function parseStooqCsv(body: string): { date: string; closeRaw: string } | null {
  const trimmed = body.trim();
  if (!trimmed) return null;
  // Reject any non-CSV response (HTML error page, bot-challenge script, …).
  // The legitimate body always starts with the literal header line.
  if (!/^Symbol,Date,Time,/i.test(trimmed)) return null;
  const lines = trimmed.split(/\r?\n/);
  if (lines.length < 2) return null;
  const cells = lines[1].split(",");
  if (cells.length < 7) return null;
  const date = cells[1];
  const closeRaw = cells[6];
  if (!date || date === "N/D" || !closeRaw || closeRaw === "N/D") return null;
  return { date, closeRaw };
}

export async function fetchStooqQuote(symbol: string): Promise<StooqQuote | null> {
  const { stooq: stooqSymbol, scale } = resolveStooq(symbol);
  const url = `${ENDPOINT}?s=${encodeURIComponent(stooqSymbol)}&f=sd2t2ohlcv&h&e=csv`;
  const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!res.ok) throw new Error(`STOOQ_${res.status}_${symbol}`);
  const parsed = parseStooqCsv(await res.text());
  if (!parsed) return null;
  // Apply scale (e.g. LSE ordinary shares quote in pence; scale=0.01)
  const close = scale === 1 ? parsed.closeRaw : (Number(parsed.closeRaw) * scale).toString();
  return {
    symbol,                              // return the internal symbol, not the Stooq variant
    date: parsed.date,
    close,
    currency: currencyForStooqSuffix(stooqSymbol),
  };
}

export async function fetchStooqQuotes(symbols: string[]): Promise<StooqQuote[]> {
  const results = await Promise.allSettled(symbols.map((s) => fetchStooqQuote(s)));
  const out: StooqQuote[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) out.push(r.value);
  }
  return out;
}
