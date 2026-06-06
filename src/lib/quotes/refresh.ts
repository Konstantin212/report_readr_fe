/**
 * Shared quote-refresh orchestrator used by both the daily cron and
 * the admin "Refresh quotes" button. Keeps the priority chain in one
 * place so the two endpoints can't diverge.
 *
 * Priority:
 *   1. Twelve Data — when TWELVE_DATA_API_KEY is set. Batched
 *      (8 symbols/call), works from data-center IPs, 800/day free.
 *   2. Yahoo v8 chart — per-symbol. Works locally; data-center IPs
 *      often get "Unauthorized".
 *   3. Stooq — per-symbol. Currently bot-challenged in mid-2026 but
 *      kept around in case they revert.
 *
 * Returns the assembled quote list + a per-source counter so the
 * caller can render diagnostics ("yahoo 0 · stooq 0 · none 20" tells
 * the admin every provider failed and it's time to investigate).
 */
import { fetchTwelveDataQuotes } from "./twelve-data";
import { fetchYahooQuote } from "./yahoo";
import { fetchStooqQuote } from "./stooq";

export type RefreshQuote = { symbol: string; date: string; close: string; currency: string };
export type RefreshSource = "twelveData" | "yahoo" | "stooq" | "none";
export type RefreshResult = {
  quotes: RefreshQuote[];
  bySource: Record<RefreshSource, number>;
  unpriced: string[];
  /** True when TWELVE_DATA_API_KEY isn't set in the runtime environment.
   *  Distinct from "key set but provider failed" so the UI can tell the
   *  admin to add the key (vs. that the provider itself is having a bad
   *  day). */
  twelveDataConfigured: boolean;
};

export async function refreshQuotes(symbols: string[]): Promise<RefreshResult> {
  const bySource: Record<RefreshSource, number> = { twelveData: 0, yahoo: 0, stooq: 0, none: 0 };
  const twelveDataConfigured = Boolean(process.env.TWELVE_DATA_API_KEY);
  if (!symbols.length) return { quotes: [], bySource, unpriced: [], twelveDataConfigured };

  const got = new Map<string, RefreshQuote>();

  // 1. Twelve Data (when configured). Batched, so cheapest provider.
  if (twelveDataConfigured) {
    const tdQuotes = await fetchTwelveDataQuotes(symbols);
    for (const q of tdQuotes) {
      if (!got.has(q.symbol)) {
        got.set(q.symbol, q);
        bySource.twelveData++;
      }
    }
  }

  // 2. Yahoo for anything Twelve Data missed.
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

  // 3. Stooq last-resort.
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
  return { quotes: [...got.values()], bySource, unpriced, twelveDataConfigured };
}
