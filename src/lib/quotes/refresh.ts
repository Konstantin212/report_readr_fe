/**
 * Shared quote-refresh orchestrator used by both the daily cron and
 * the admin "Refresh quotes" button. Keeps the priority chain in one
 * place so the two endpoints can't diverge.
 *
 * Priority:
 *   1. FMP — when FMP_API_KEY is set. *Unlimited* symbols per batched
 *      call, 250 req/day free, US-only on free tier. Sits first
 *      because one call handles the whole US sleeve for ~1 credit.
 *   2. Twelve Data — when TWELVE_DATA_API_KEY is set. Batched
 *      (8 symbols/call), 8 credits/min, 800/day free. Covers the
 *      international tickers FMP free can't price.
 *   3. Yahoo v8 chart — per-symbol. Works locally; data-center IPs
 *      (Vercel) often get "Unauthorized".
 *   4. Stooq — per-symbol. Bot-challenged mid-2026; kept around in
 *      case they revert.
 *
 * The chain is best-of: each provider only sees symbols the providers
 * before it didn't price. So free-tier TD's 8/min cap only matters
 * for what FMP couldn't return (typically 6 international tickers in
 * the user's portfolio = 6 of 8 credits, fits in one minute).
 *
 * Returns the assembled quote list + a per-source counter so the
 * caller can render diagnostics ("fmp 14 · td 6 · yahoo 0 · stooq 0")
 * and a per-provider configured flag so the UI can tell "key missing"
 * apart from "provider failed".
 */
import { fetchFmpQuotes } from "./fmp";
import { fetchTwelveDataQuotes } from "./twelve-data";
import { fetchYahooQuote } from "./yahoo";
import { fetchStooqQuote } from "./stooq";

export type RefreshQuote = { symbol: string; date: string; close: string; currency: string };
export type RefreshSource = "fmp" | "twelveData" | "yahoo" | "stooq" | "none";
export type RefreshResult = {
  quotes: RefreshQuote[];
  bySource: Record<RefreshSource, number>;
  unpriced: string[];
  fmpConfigured: boolean;
  twelveDataConfigured: boolean;
};

export async function refreshQuotes(symbols: string[]): Promise<RefreshResult> {
  const bySource: Record<RefreshSource, number> = { fmp: 0, twelveData: 0, yahoo: 0, stooq: 0, none: 0 };
  const fmpConfigured = Boolean(process.env.FMP_API_KEY);
  const twelveDataConfigured = Boolean(process.env.TWELVE_DATA_API_KEY);
  if (!symbols.length) return { quotes: [], bySource, unpriced: [], fmpConfigured, twelveDataConfigured };

  const got = new Map<string, RefreshQuote>();

  // 1. FMP — one batched call covers every US symbol it knows. Unknown
  //    or non-US tickers simply aren't in the response.
  if (fmpConfigured) {
    const fmpQuotes = await fetchFmpQuotes(symbols);
    for (const q of fmpQuotes) {
      if (!got.has(q.symbol)) {
        got.set(q.symbol, q);
        bySource.fmp++;
      }
    }
  }

  // 2. Twelve Data — for whatever FMP didn't price (typically the EU
  //    leg). 8 credits/min cap; 6 international tickers fits easily in
  //    a single batched call.
  if (twelveDataConfigured) {
    const tdTargets = symbols.filter((s) => !got.has(s));
    if (tdTargets.length) {
      const tdQuotes = await fetchTwelveDataQuotes(tdTargets);
      for (const q of tdQuotes) {
        if (!got.has(q.symbol)) {
          got.set(q.symbol, q);
          bySource.twelveData++;
        }
      }
    }
  }

  // 3. Yahoo for anything still missing.
  const yahooTargets = symbols.filter((s) => !got.has(s));
  if (yahooTargets.length) {
    const yResults = await Promise.allSettled(yahooTargets.map((s) => fetchYahooQuote(s)));
    for (const r of yResults) {
      if (r.status === "fulfilled" && r.value && !got.has(r.value.symbol)) {
        got.set(r.value.symbol, r.value);
        bySource.yahoo++;
      }
    }
  }

  // 4. Stooq last-resort.
  const stooqTargets = symbols.filter((s) => !got.has(s));
  if (stooqTargets.length) {
    const sResults = await Promise.allSettled(stooqTargets.map((s) => fetchStooqQuote(s)));
    for (const r of sResults) {
      if (r.status === "fulfilled" && r.value && !got.has(r.value.symbol)) {
        got.set(r.value.symbol, r.value);
        bySource.stooq++;
      }
    }
  }

  const unpriced = symbols.filter((s) => !got.has(s));
  bySource.none = unpriced.length;
  return { quotes: [...got.values()], bySource, unpriced, fmpConfigured, twelveDataConfigured };
}
