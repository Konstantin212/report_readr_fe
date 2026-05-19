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
import { toStooqSymbol } from "./stooq-symbol-map";

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

export async function fetchStooqQuote(symbol: string): Promise<StooqQuote | null> {
  const stooqSymbol = toStooqSymbol(symbol);
  const url = `${ENDPOINT}?s=${encodeURIComponent(stooqSymbol)}&f=sd2t2ohlcv&h&e=csv`;
  const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!res.ok) throw new Error(`STOOQ_${res.status}_${symbol}`);
  const text = await res.text();
  // Format:
  //   Symbol,Date,Time,Open,High,Low,Close,Volume
  //   COIN.US,2026-05-18,22:00:18,190.25,194.2,184.15,189.44,10399788
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const cells = lines[1].split(",");
  const date = cells[1];
  const close = cells[6];
  if (!date || date === "N/D" || !close || close === "N/D") return null;
  return {
    symbol,                              // return the internal symbol, not the Stooq variant
    date,
    close,
    currency: currencyForStooqSuffix(stooqSymbol),
  };
}

export async function fetchStooqQuotes(symbols: string[]): Promise<StooqQuote[]> {
  const out: StooqQuote[] = [];
  for (const symbol of symbols) {
    try {
      const q = await fetchStooqQuote(symbol);
      if (q) out.push(q);
    } catch {
      // skip — leave the symbol unpriced for this run
    }
  }
  return out;
}
