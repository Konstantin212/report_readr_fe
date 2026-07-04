/**
 * Yahoo Finance provider (market-data layer).
 *
 * This is the NEW marketdata-layer Yahoo adapter. It is independent of the
 * older `src/lib/quotes/yahoo.ts` (`fetchYahooQuote`) — do not conflate the
 * two; this module speaks the `MetadataProvider` / `QuoteResult` contract
 * from `../types` and resolves an instrument by ISIN before pricing it.
 *
 * Two public JSON endpoints are used:
 *   1. `v1/finance/search?q={ISIN}` — resolve an ISIN to Yahoo symbol(s) plus
 *      name / sector / industry.
 *   2. `v8/finance/chart/{symbol}?interval=1d&range=5d` — read the latest
 *      regular-market price.
 *
 * IMPORTANT: NEVER fetch the `finance.yahoo.com` HTML pages. Those hit a GDPR
 * consent wall (a redirect to `guce.yahoo.com`) that our serverless `fetch()`
 * cannot clear, so they return an HTML consent form instead of quote data.
 * The `query1`/`query2` JSON hosts below have no consent gate and work from
 * the app's servers — stick to them.
 *
 * The parse halves (`parseSearchResponse`, `parseChartMeta`) are PURE and
 * unit-tested without a network; the `fetch*` functions are the thin I/O shell.
 */
import type { AssetKind } from "@/lib/analytics/sector-map";
import type {
  InstrumentMetaFields,
  InstrumentMeta,
  InstrumentRef,
  MetadataProvider,
  MetaResult,
  QuoteResult,
} from "../types";

const SEARCH_ENDPOINT = "https://query2.finance.yahoo.com/v1/finance/search";
const CHART_ENDPOINT = "https://query1.finance.yahoo.com/v8/finance/chart";

/**
 * Browser-like headers. Yahoo's JSON hosts reject an empty / non-browser
 * User-Agent with `Unauthorized`, so we present a real Chrome UA string.
 */
const YAHOO_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

const REQUEST_TIMEOUT_MS = 10_000;

/** One entry in the search response `quotes[]` array (fields we read). */
type SearchQuote = {
  symbol?: unknown;
  score?: unknown;
  quoteType?: unknown;
  longname?: unknown;
  sectorDisp?: unknown;
  industryDisp?: unknown;
};

/**
 * Map Yahoo's `quoteType` to our coarse `AssetKind`. Yahoo uses upper-case
 * codes ("ETF", "EQUITY", "MUTUALFUND"); anything unrecognised falls back to
 * "other" so we never mis-tag an instrument we don't understand.
 */
function mapQuoteType(quoteType: unknown): AssetKind {
  switch (quoteType) {
    case "ETF":
      return "etf";
    case "EQUITY":
      return "stock";
    case "MUTUALFUND":
      return "other";
    default:
      return "other";
  }
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Pure parser for a `v1/finance/search` response.
 *
 * PRIMARY selection: the highest-`score` entry that carries a `sectorDisp`
 * (the classification-bearing listing, usually the home exchange); if none
 * has a sector, the first entry wins. Sector/industry/name are read off the
 * PRIMARY. `yahooQuoteSymbol` prefers the `{isin}.SG` Stuttgart line (a EUR
 * listing that prices cleanly) when present, else the primary's symbol.
 *
 * Empty / missing `quotes[]` → NOT_FOUND (authoritatively "not on Yahoo").
 */
export function parseSearchResponse(
  json: unknown,
  isin: string,
):
  | {
      status: "OK";
      source: "YAHOO";
      assetKind: AssetKind;
      fields: Partial<InstrumentMetaFields>;
      raw: unknown;
    }
  | { status: "NOT_FOUND" } {
  const quotes = (json as { quotes?: unknown })?.quotes;
  if (!Array.isArray(quotes) || quotes.length === 0) {
    return { status: "NOT_FOUND" };
  }

  const entries = quotes as SearchQuote[];

  const scoreOf = (q: SearchQuote): number =>
    typeof q.score === "number" && Number.isFinite(q.score) ? q.score : -Infinity;

  // PRIMARY: highest-score entry that has a sectorDisp, else the first entry.
  let primary: SearchQuote | undefined;
  for (const q of entries) {
    if (asString(q.sectorDisp) && (!primary || scoreOf(q) > scoreOf(primary))) {
      primary = q;
    }
  }
  if (!primary) primary = entries[0];

  const primarySymbol = asString(primary.symbol);

  // yahooQuoteSymbol: prefer the "{isin}.SG" line (Stuttgart EUR listing).
  const sgSymbol = `${isin}.SG`;
  const sgEntry = entries.find((q) => asString(q.symbol) === sgSymbol);
  const yahooQuoteSymbol = sgEntry ? sgSymbol : primarySymbol;

  const fields: Partial<InstrumentMetaFields> = {
    name: asString(primary.longname),
    sector: asString(primary.sectorDisp),
    industry: asString(primary.industryDisp),
    yahooSymbol: primarySymbol,
    yahooQuoteSymbol,
  };

  return {
    status: "OK",
    source: "YAHOO",
    assetKind: mapQuoteType(primary.quoteType),
    fields,
    raw: json,
  };
}

/**
 * Pure parser for a `v8/finance/chart` response, reading the single
 * `meta.regularMarketPrice` snapshot (not the candle array).
 *
 * GBp NORMALIZATION: LSE quotes in pence ("GBp"); we divide by 100 and report
 * "GBP" so downstream FX math never special-cases the venue. Other currencies
 * pass through unchanged. Missing meta / price → null.
 */
export function parseChartMeta(json: unknown): QuoteResult {
  const meta = (json as { chart?: { result?: Array<{ meta?: unknown }> } })?.chart
    ?.result?.[0]?.meta as
    | {
        regularMarketPrice?: unknown;
        currency?: unknown;
        regularMarketTime?: unknown;
      }
    | undefined;
  if (!meta) return null;

  const price = meta.regularMarketPrice;
  if (typeof price !== "number" || !Number.isFinite(price)) return null;

  const time = meta.regularMarketTime;
  const epochSeconds = typeof time === "number" && Number.isFinite(time) ? time : 0;
  const date = new Date(epochSeconds * 1000).toISOString().slice(0, 10);

  let close: string;
  let currency = asString(meta.currency) ?? "USD";
  if (currency === "GBp") {
    close = (price / 100).toFixed(2);
    currency = "GBP";
  } else {
    close = price.toFixed(2);
  }

  return { close, currency, date, source: "YAHOO" };
}

async function getJson(url: string): Promise<{ ok: boolean; json: unknown }> {
  const res = await fetch(url, {
    headers: YAHOO_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) return { ok: false, json: null };
  return { ok: true, json: await res.json() };
}

/**
 * Fetch a quote given an already-resolved `InstrumentMeta`. Prefers the
 * pricing listing (`yahooQuoteSymbol`), falling back to the primary Yahoo
 * symbol and finally the raw broker symbol. Any non-OK response / throw → null
 * (the refresh caller treats a missing quote as "keep the cached one").
 */
export async function fetchYahooQuoteByMeta(
  ref: InstrumentRef,
  meta: InstrumentMeta | null,
): Promise<QuoteResult> {
  const symbol = meta?.yahooQuoteSymbol ?? meta?.yahooSymbol ?? ref.symbol;
  if (!symbol) return null;
  const url =
    `${CHART_ENDPOINT}/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  try {
    const { ok, json } = await getJson(url);
    if (!ok) return null;
    return parseChartMeta(json);
  } catch {
    return null;
  }
}

export const yahooProvider: MetadataProvider = {
  id: "yahoo",

  async fetchMeta(ref: InstrumentRef): Promise<MetaResult> {
    const url =
      `${SEARCH_ENDPOINT}?q=${encodeURIComponent(ref.isin)}&quotesCount=6&newsCount=0`;
    try {
      const { ok, json } = await getJson(url);
      if (!ok) return { status: "ERROR", error: `Yahoo search HTTP error` };
      return parseSearchResponse(json, ref.isin);
    } catch (err) {
      return {
        status: "ERROR",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
