import { fetchYahooHistory } from "./history";

/**
 * Latest spot quote from Yahoo using the v8/chart endpoint (the v7/quote
 * endpoint regularly 429s anonymous callers from Vercel IPs; the chart
 * endpoint is far more tolerant). We ask for a 5-day window and take the
 * most recent non-null close — same currency the chart endpoint reports.
 */
export type YahooSpot = { symbol: string; date: string; close: string; currency: string };

export type YahooSpotResult =
  | { ok: true; quote: YahooSpot }
  | { ok: false; symbol: string; error: string };

export async function fetchYahooSpot(symbol: string): Promise<YahooSpotResult> {
  try {
    const rows = await fetchYahooHistory(symbol, "5d");
    if (!rows.length) return { ok: false, symbol, error: "no rows" };
    // History is chronological; the last entry is the most recent close.
    const last = rows[rows.length - 1];
    return { ok: true, quote: { symbol, date: last.date, close: last.close, currency: last.currency } };
  } catch (e) {
    return { ok: false, symbol, error: (e as Error).message };
  }
}

export async function fetchYahooSpots(symbols: string[]): Promise<{ quotes: YahooSpot[]; errors: Array<{ symbol: string; error: string }> }> {
  const quotes: YahooSpot[] = [];
  const errors: Array<{ symbol: string; error: string }> = [];
  for (let i = 0; i < symbols.length; i++) {
    const r = await fetchYahooSpot(symbols[i]);
    if (r.ok) quotes.push(r.quote);
    else errors.push({ symbol: r.symbol, error: r.error });
    // Throttle to stay friendly with Yahoo's anonymous rate limit; cron
    // budget is 60 s and we only ever call this for the handful of
    // symbols Stooq can't cover (today: just IEMM).
    if (i < symbols.length - 1) {
      await new Promise((r) => setTimeout(r, 700));
    }
  }
  return { quotes, errors };
}

/**
 * Symbols where Yahoo is the authoritative source instead of Stooq —
 * typically because Stooq lacks the specific exchange listing the user
 * actually holds, and we'd otherwise approximate via a sibling listing in
 * a different currency.
 */
export const YAHOO_PRIMARY_SYMBOLS = new Set<string>([
  "IEMM", // iShares MSCI EM UCITS — Amsterdam EUR class (IEMM.AS). Stooq
          // only has the LSE GBP twin under EIMI, which tracks the same NAV
          // but in a different currency and slightly different price.
]);
