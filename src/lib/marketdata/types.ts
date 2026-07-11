/**
 * Market-data layer — shared domain types and provider ports.
 *
 * PURE by contract: this module may import ONLY other pure modules
 * (currently just the classifier taxonomy types). It must NOT import
 * the DB client, Drizzle schema, or any provider adapter. Everything
 * downstream (router, providers, enrich, store, classification) depends
 * on these types; keeping the file I/O-free is what lets the router and
 * provider-parse halves be unit-tested without a database or network.
 */
import type { AssetKind, FundSubtype } from "@/lib/analytics/sector-map";

export type MetaStatus = "OK" | "NOT_FOUND" | "ERROR";
export type MetaSource = "JUSTETF" | "YAHOO" | "FMP" | "MANUAL";
export type DistributionPolicy = "DISTRIBUTING" | "ACCUMULATING";
export type ProviderId = "justetf" | "yahoo" | "fmp" | "finviz";

/**
 * Synthetic ISIN key for instruments that have no real ISIN but were
 * pinned by a manual Yahoo link (AC-4.2). Format: `SYM:{symbol}`.
 * `selectCandidates` exempts these from the ISIN-shape check, and
 * `buildClassificationOverrides` matches them back to the position by
 * the embedded symbol.
 */
export const SYNTHETIC_ISIN_PREFIX = "SYM:";

export function syntheticIsin(symbol: string): string {
  return `${SYNTHETIC_ISIN_PREFIX}${symbol}`;
}

export function isSyntheticIsin(isin: string): boolean {
  return isin.startsWith(SYNTHETIC_ISIN_PREFIX);
}

/** The minimal identity a provider needs to resolve an instrument. */
export type InstrumentRef = {
  isin: string;
  symbol: string;
  currency: string | null;
};

/**
 * Fields a provider can populate on a metadata row. All optional — a
 * provider fills what it knows and leaves the rest null. `terPct` is a
 * numeric-as-string (Drizzle `numeric`); `teilfreistellungPct` is a
 * small integer (30/15/60/80).
 */
export type InstrumentMetaFields = {
  name: string | null;
  sector: string | null;
  industry: string | null;
  yahooSymbol: string | null;      // primary listing, e.g. "TRN.L"
  yahooQuoteSymbol: string | null; // listing used for pricing, e.g. "GB00BKDTK925.SG"
  justetfTicker: string | null;
  wkn: string | null;
  fundCurrency: string | null;
  domicile: string | null;
  indexName: string | null;
  investmentFocus: string | null;
  replication: string | null;
  terPct: string | null;
  distributionPolicy: DistributionPolicy | null;
  distributionFrequency: string | null;
  teilfreistellungPct: number | null;
  fundSubtype: FundSubtype | null;
};

/**
 * A provider's answer for one instrument.
 *  - OK        → this provider authoritatively owns the instrument; the
 *                router stops the chain and persists the fields.
 *  - NOT_FOUND → authoritatively "not mine" (e.g. justETF 302 to search);
 *                the router advances to the next provider.
 *  - ERROR     → transient failure (network / timeout / 5xx / parse); the
 *                router STOPS the chain and records the error for retry.
 */
export type MetaResult =
  | {
      status: "OK";
      source: Exclude<MetaSource, "MANUAL">;
      assetKind: AssetKind;
      fields: Partial<InstrumentMetaFields>;
      raw: unknown;
    }
  | { status: "NOT_FOUND" }
  | { status: "ERROR"; error: string };

/**
 * A single EOD price datum. The provider returns the price without a
 * symbol — one ISIN can map to several user symbols, so the caller
 * (enrich/refresh) attaches the symbol(s) when writing to quote_cache.
 */
export type QuoteResult = {
  close: string;
  currency: string;
  date: string; // YYYY-MM-DD
  source: string; // "JUSTETF" | "YAHOO" | "FMP"
} | null;

/**
 * Persisted metadata as a plain domain object. `store.ts` maps the
 * Drizzle row to this so nothing downstream depends on Drizzle. Carries
 * both the classification-relevant fields and the bookkeeping fields the
 * TTL/backoff gate needs. Timestamps are ISO strings.
 */
export type InstrumentMeta = {
  isin: string;
  status: MetaStatus;
  source: MetaSource | null;
  assetKind: AssetKind | null;
  manualUrl: string | null;
  failCount: number;
  scrapedAt: string | null;
  updatedAt: string;
  /** Last error message (ERROR rows), surfaced to the manual-link card so a
   *  failed pin shows a specific reason instead of a generic retry prompt. */
  lastError?: string | null;
} & InstrumentMetaFields;

/** Bookkeeping subset used by the pure `selectCandidates` gate. */
export type InstrumentMetaGate = Pick<
  InstrumentMeta,
  "isin" | "status" | "failCount" | "scrapedAt" | "updatedAt"
>;

/**
 * Result of parsing a manual link the user pasted. `provider` decides
 * routing; `isin` / `yahooSymbol` pin the resolution. `ticker`+`exchange`
 * are the raw B-form parts before the EXCHANGE_SUFFIX map turns them into
 * `yahooSymbol`.
 */
export type ManualLink =
  | { provider: "justetf"; isin: string }
  | {
      provider: "yahoo";
      isin?: string;
      yahooSymbol?: string;
      ticker?: string;
      exchange?: string;
    };

// --- Ports (Strategy pattern; one adapter per external source) -----------

export interface MetadataProvider {
  readonly id: ProviderId;
  fetchMeta(ref: InstrumentRef): Promise<MetaResult>;
}

export interface QuoteProvider {
  readonly id: ProviderId;
  fetchQuote(ref: InstrumentRef, meta: InstrumentMeta | null): Promise<QuoteResult>;
}
