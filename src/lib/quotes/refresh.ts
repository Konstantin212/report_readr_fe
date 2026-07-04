/**
 * Shared quote-refresh orchestrator used by both the daily cron and
 * the admin "Refresh quotes" button. Keeps the priority chain in one
 * place so the two endpoints can't diverge.
 *
 * Two layers:
 *
 *   1. Router-driven (per symbol that carries an ISIN). The caller
 *      supplies `isinBySymbol` + `metaByIsin`; for each symbol we build
 *      an InstrumentRef and ask the market-data router `planQuote()` for
 *      the ordered provider list (justETF for owned ETFs, FMP→Yahoo for
 *      US/synthetic, Yahoo for other non-US listings), then try each via
 *      `fetchQuoteFor` and take the first non-null. This is what lets an
 *      EU ETF price off justETF's EUR endpoint instead of guessing a
 *      Yahoo ticker.
 *
 *   2. Raw-symbol fallback (FMP → Yahoo) for symbols with no ISIN, or
 *      whose routed providers all came back empty. FMP prices the US
 *      sleeve (one call per symbol, free tier), Yahoo v8 chart covers
 *      the rest where the data-center IP isn't blocked.
 *
 * TwelveData and Stooq were removed from the chain (TD's 8/min cap made
 * batches unreliable; Stooq is bot-challenged). The `twelveDataConfigured`
 * flag is retained on RefreshResult (always `false`) only so the admin
 * refresh route — which still reads it — keeps compiling.
 *
 * Returns the assembled quote list + a per-source counter so the caller
 * can render diagnostics ("fmp 14 · yahoo 4 · justEtf 2 · none 0") and a
 * per-provider configured flag so the UI can tell "key missing" apart
 * from "provider failed".
 */
import { fetchFmpQuotes } from "./fmp";
import { fetchYahooQuote } from "./yahoo";
import { fetchQuoteFor } from "@/lib/marketdata/enrich";
import { planQuote } from "@/lib/marketdata/router";
import type { InstrumentMeta, InstrumentRef, ProviderId } from "@/lib/marketdata/types";

export type RefreshQuote = { symbol: string; date: string; close: string; currency: string; source: string };
export type RefreshSource = "fmp" | "yahoo" | "justEtf" | "none";
export type RefreshResult = {
  quotes: RefreshQuote[];
  bySource: Record<RefreshSource, number>;
  unpriced: string[];
  fmpConfigured: boolean;
  /** Always false — TwelveData was removed; kept so the admin route compiles. */
  twelveDataConfigured: boolean;
};

export type RefreshOptions = {
  isinBySymbol?: Map<string, string>;
  metaByIsin?: Map<string, InstrumentMeta>;
};

/** Map a router provider id onto the RefreshSource tally bucket. */
const PROVIDER_SOURCE: Record<ProviderId, RefreshSource> = {
  justetf: "justEtf",
  yahoo: "yahoo",
  fmp: "fmp",
};

export async function refreshQuotes(
  symbols: string[],
  opts?: RefreshOptions,
): Promise<RefreshResult> {
  const bySource: Record<RefreshSource, number> = { fmp: 0, yahoo: 0, justEtf: 0, none: 0 };
  const fmpConfigured = Boolean(process.env.FMP_API_KEY);
  if (!symbols.length) {
    return { quotes: [], bySource, unpriced: [], fmpConfigured, twelveDataConfigured: false };
  }

  const got = new Map<string, RefreshQuote>();
  const isinBySymbol = opts?.isinBySymbol;
  const metaByIsin = opts?.metaByIsin;

  // 1. Router-driven path for symbols that carry an ISIN. planQuote picks
  //    the provider order; the first non-null quote wins.
  if (isinBySymbol) {
    for (const symbol of symbols) {
      const isin = isinBySymbol.get(symbol);
      if (!isin) continue;
      const ref: InstrumentRef = { isin, symbol, currency: null };
      const meta = metaByIsin?.get(isin) ?? null;
      const plan = planQuote(ref, meta);
      for (const id of plan) {
        const q = await fetchQuoteFor(id, ref, meta);
        if (q) {
          got.set(symbol, { symbol, date: q.date, close: q.close, currency: q.currency, source: q.source });
          bySource[PROVIDER_SOURCE[id]]++;
          break;
        }
      }
    }
  }

  // 2. Raw-symbol fallback for symbols with no ISIN, or whose routed
  //    providers all came back empty. FMP first (US sleeve), then Yahoo.
  const fallbackTargets = symbols.filter((s) => !got.has(s));

  if (fmpConfigured && fallbackTargets.length) {
    const fmpQuotes = await fetchFmpQuotes(fallbackTargets);
    for (const q of fmpQuotes) {
      if (!got.has(q.symbol)) {
        got.set(q.symbol, { ...q, source: "FMP" });
        bySource.fmp++;
      }
    }
  }

  const yahooTargets = fallbackTargets.filter((s) => !got.has(s));
  if (yahooTargets.length) {
    const yResults = await Promise.allSettled(yahooTargets.map((s) => fetchYahooQuote(s)));
    for (const r of yResults) {
      if (r.status === "fulfilled" && r.value && !got.has(r.value.symbol)) {
        got.set(r.value.symbol, { ...r.value, source: "YAHOO" });
        bySource.yahoo++;
      }
    }
  }

  const unpriced = symbols.filter((s) => !got.has(s));
  bySource.none = unpriced.length;
  return { quotes: [...got.values()], bySource, unpriced, fmpConfigured, twelveDataConfigured: false };
}
