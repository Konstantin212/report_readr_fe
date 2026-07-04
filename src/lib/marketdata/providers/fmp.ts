/**
 * Financial Modeling Prep (FMP) provider (market-data layer).
 *
 * This adapter speaks the `MetadataProvider` / `QuoteProvider` contract from
 * `../types`. It is a thin wrapper over FMP's `/stable` API:
 *
 *   1. `/stable/profile?symbol={sym}` — company profile (name / sector /
 *      industry / ETF+fund flags), used for metadata.
 *   2. `/stable/quote?symbol={sym}`  — single-symbol EOD price. The quote
 *      half reuses `fetchFmpQuotes` from `@/lib/quotes/fmp` rather than
 *      re-implementing the URL + parse dance; see that module for the
 *      free-tier / deprecation notes.
 *
 * FMP's free tier is US-only and single-symbol, so this provider resolves an
 * instrument by its `symbol` (not ISIN). The profile mapping half
 * (`parseFmpProfile`) is PURE and unit-testable without a network; `fetchMeta`
 * is the thin I/O shell around it.
 */
import type { AssetKind } from "@/lib/analytics/sector-map";
import { fetchFmpQuotes } from "@/lib/quotes/fmp";
import type {
  InstrumentMetaFields,
  InstrumentMeta,
  InstrumentRef,
  MetadataProvider,
  MetaResult,
  QuoteProvider,
  QuoteResult,
} from "../types";

const PROFILE_ENDPOINT = "https://financialmodelingprep.com/stable/profile";

const FMP_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json",
};

const REQUEST_TIMEOUT_MS = 10_000;

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Pure parser for FMP's `/stable/profile` response (an array; one element per
 * requested symbol). Maps the ETF/fund flags to our coarse `AssetKind`:
 *   - `isEtf`  → "etf"
 *   - `isFund` → "other" (mutual fund / not an ETF)
 *   - else     → "stock"
 * Empty array / non-array → null (authoritatively "not on FMP").
 */
export function parseFmpProfile(
  json: unknown,
): { assetKind: AssetKind; fields: Partial<InstrumentMetaFields> } | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  const e = json[0] as {
    companyName?: unknown;
    sector?: unknown;
    industry?: unknown;
    isEtf?: unknown;
    isFund?: unknown;
  };
  if (!e || typeof e !== "object") return null;

  let assetKind: AssetKind;
  if (e.isEtf === true) assetKind = "etf";
  else if (e.isFund === true) assetKind = "other";
  else assetKind = "stock";

  const fields: Partial<InstrumentMetaFields> = {
    name: asString(e.companyName),
    sector: asString(e.sector),
    industry: asString(e.industry),
  };

  return { assetKind, fields };
}

export const fmpProvider: MetadataProvider & QuoteProvider = {
  id: "fmp",

  async fetchMeta(ref: InstrumentRef): Promise<MetaResult> {
    const apiKey = process.env.FMP_API_KEY;
    // No key is a config state, not a transient failure: return NOT_FOUND so
    // the router advances to the next provider (Yahoo) instead of stopping
    // the chain (ERROR would strand every US instrument if FMP were ever
    // unconfigured). Genuine fetch/HTTP failures below still return ERROR.
    if (!apiKey) return { status: "NOT_FOUND" };

    const url =
      `${PROFILE_ENDPOINT}?symbol=${encodeURIComponent(ref.symbol)}` +
      `&apikey=${encodeURIComponent(apiKey)}`;
    try {
      const res = await fetch(url, {
        headers: FMP_HEADERS,
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) return { status: "ERROR", error: `FMP profile HTTP ${res.status}` };
      const json = await res.json();
      const parsed = parseFmpProfile(json);
      if (!parsed) return { status: "NOT_FOUND" };
      return {
        status: "OK",
        source: "FMP",
        assetKind: parsed.assetKind,
        fields: parsed.fields,
        raw: Array.isArray(json) ? json[0] : json,
      };
    } catch (err) {
      return {
        status: "ERROR",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },

  async fetchQuote(
    ref: InstrumentRef,
    _meta: InstrumentMeta | null = null,
  ): Promise<QuoteResult> {
    const quotes = await fetchFmpQuotes([ref.symbol]);
    const q = quotes[0];
    if (!q) return null;
    return { close: q.close, currency: "USD", date: q.date, source: "FMP" };
  },
};
