/**
 * Enrichment orchestrator. Walks candidate instruments through the
 * router's provider plan, applies the TTL/backoff gate, and persists
 * results via the store. This is the only place that composes the
 * providers; the provider adapters and the router stay independent.
 *
 * Chain semantics (per provider, from the router plan):
 *   OK        → persist fields, stop.
 *   NOT_FOUND → advance to the next provider.
 *   ERROR     → persist ERROR + bump failCount, STOP (retry later via
 *               backoff). Never let a transient outage cause the next
 *               provider to mis-own the instrument.
 *
 * Politeness: sequential with a 1.5 s gap between instruments; ≤10 per
 * post-upload run, ≤5 per cron TTL sweep. Public pages only.
 */
import type {
  InstrumentMeta,
  InstrumentMetaGate,
  InstrumentRef,
  ManualLink,
  MetadataProvider,
  ProviderId,
  QuoteResult,
} from "./types";
import { isSyntheticIsin } from "./types";
import { planEnrichment, planQuote } from "./router";
import { justEtfProvider, fetchEtfQuote } from "./providers/justetf";
import { yahooProvider, fetchYahooQuoteByMeta } from "./providers/yahoo";
import { fmpProvider } from "./providers/fmp";
import {
  getHeldRefs,
  getMetaByIsins,
  getSymbolsByIsin,
  upsertMeta,
  writeQuotes,
} from "./store";

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const TTL_MS = 30 * 86_400_000; // 30 days
const MAX_FAIL = 5;
const SPACING_MS = 1_500;
const DEFAULT_LIMIT = 10;

const META_PROVIDERS: Record<ProviderId, MetadataProvider> = {
  justetf: justEtfProvider,
  yahoo: yahooProvider,
  fmp: fmpProvider,
};

/** Dispatch a quote fetch to the right provider (their quote signatures differ). */
async function fetchQuoteFor(
  id: ProviderId,
  ref: InstrumentRef,
  meta: InstrumentMeta | null,
): Promise<QuoteResult> {
  if (id === "justetf") return fetchEtfQuote(ref.isin);
  if (id === "yahoo") return fetchYahooQuoteByMeta(ref, meta);
  return fmpProvider.fetchQuote(ref, meta);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type EnrichSummary = {
  attempted: number;
  ok: number;
  notFound: number;
  errors: number;
};

/**
 * Pure gate: which candidate ISINs are due for a (re)scrape. Exported
 * for unit testing — no DB, no clock of its own (caller passes `now`).
 *  - invalid ISIN shape (and not a synthetic SYM: key) → skip
 *  - OK / NOT_FOUND younger than 30 d → skip
 *  - ERROR with failCount ≥ 5 → skip; otherwise retry after 1d·2^failCount
 *  - dedupe by ISIN, cap at `limit`
 */
export function selectCandidates(
  refs: InstrumentRef[],
  existing: InstrumentMetaGate[],
  now: Date,
  limit = DEFAULT_LIMIT,
): InstrumentRef[] {
  const byIsin = new Map(existing.map((e) => [e.isin, e]));
  const seen = new Set<string>();
  const out: InstrumentRef[] = [];
  for (const ref of refs) {
    if (out.length >= limit) break;
    if (seen.has(ref.isin)) continue;
    if (!isSyntheticIsin(ref.isin) && !ISIN_RE.test(ref.isin)) continue;
    const e = byIsin.get(ref.isin);
    if (e) {
      if (e.status === "OK" || e.status === "NOT_FOUND") {
        const stamp = e.scrapedAt ?? e.updatedAt;
        if (now.getTime() - new Date(stamp).getTime() < TTL_MS) continue;
      } else if (e.status === "ERROR") {
        if (e.failCount >= MAX_FAIL) continue;
        const backoff = 86_400_000 * Math.pow(2, e.failCount);
        if (now.getTime() - new Date(e.updatedAt).getTime() < backoff) continue;
      }
    }
    seen.add(ref.isin);
    out.push(ref);
  }
  return out;
}

/**
 * Run one instrument through its provider plan and persist the outcome.
 * On a successful ETF classification (justETF), also fetch the EOD quote
 * and fan it out to every user symbol mapped to the ISIN. Returns the
 * freshly-persisted metadata row (or null on NOT_FOUND/ERROR).
 */
async function enrichOne(ref: InstrumentRef, manual: ManualLink | null): Promise<void> {
  const manualUrl = manual ? manualUrlFor(manual) : undefined;
  const plan = planEnrichment(ref, manual);

  for (const id of plan) {
    let result;
    try {
      result = await META_PROVIDERS[id].fetchMeta(ref);
    } catch (e) {
      result = { status: "ERROR" as const, error: (e as Error).message };
    }

    if (result.status === "OK") {
      await upsertMeta({
        isin: ref.isin,
        status: "OK",
        source: result.source,
        assetKind: result.assetKind,
        fields: result.fields,
        raw: result.raw,
        markScraped: true,
        manualUrl,
      });
      if (result.assetKind === "etf" && result.source === "JUSTETF") {
        await writeEtfQuote(ref);
      }
      return;
    }
    if (result.status === "ERROR") {
      await upsertMeta({
        isin: ref.isin,
        status: "ERROR",
        error: result.error,
        bumpFailCount: true,
        manualUrl,
      });
      return; // ERROR stops the chain
    }
    // NOT_FOUND → try the next provider
  }

  // Every provider returned NOT_FOUND.
  await upsertMeta({ isin: ref.isin, status: "NOT_FOUND", markScraped: true, manualUrl });
}

async function writeEtfQuote(ref: InstrumentRef): Promise<void> {
  const q = await fetchEtfQuote(ref.isin);
  if (!q) return;
  const symbols = new Set<string>(await getSymbolsByIsin(ref.isin));
  if (ref.symbol) symbols.add(ref.symbol);
  await writeQuotes(
    [...symbols].map((symbol) => ({
      symbol,
      close: q.close,
      currency: q.currency,
      date: q.date,
      source: q.source,
    })),
  );
}

function manualUrlFor(manual: ManualLink): string | undefined {
  // The parsed link doesn't carry the original URL; the API route passes
  // manualUrl explicitly via enrichSingle. This helper only fires when a
  // ManualLink is present without a stored URL, so return undefined.
  void manual;
  return undefined;
}

/**
 * Post-upload / cron entry point. Filters `refs` through the TTL gate,
 * then enriches sequentially with polite spacing.
 */
export async function enrichInstruments(
  refs: InstrumentRef[],
  limit = DEFAULT_LIMIT,
  spacingMs = SPACING_MS,
): Promise<EnrichSummary> {
  const isins = [...new Set(refs.map((r) => r.isin))];
  const existing = await getMetaByIsins(isins);
  const candidates = selectCandidates(refs, existing, new Date(), limit);

  const summary: EnrichSummary = { attempted: candidates.length, ok: 0, notFound: 0, errors: 0 };
  for (let i = 0; i < candidates.length; i++) {
    await enrichOne(candidates[i], null);
    if (i < candidates.length - 1) await sleep(spacingMs);
  }
  // Re-read to report outcome counts.
  const after = await getMetaByIsins(candidates.map((c) => c.isin));
  for (const m of after) {
    if (m.status === "OK") summary.ok++;
    else if (m.status === "NOT_FOUND") summary.notFound++;
    else summary.errors++;
  }
  return summary;
}

/**
 * Manual-link path: enrich one instrument immediately (bypasses the TTL
 * gate), persisting the provided source URL. Returns the fresh row so
 * the API can echo it back to the UI.
 */
export async function enrichSingle(
  ref: InstrumentRef,
  manual: ManualLink | null,
  manualUrl?: string,
): Promise<InstrumentMeta | null> {
  const plan = planEnrichment(ref, manual);
  for (const id of plan) {
    let result;
    try {
      result = await META_PROVIDERS[id].fetchMeta(ref);
    } catch (e) {
      result = { status: "ERROR" as const, error: (e as Error).message };
    }
    if (result.status === "OK") {
      await upsertMeta({
        isin: ref.isin,
        status: "OK",
        source: result.source,
        assetKind: result.assetKind,
        fields: result.fields,
        raw: result.raw,
        markScraped: true,
        manualUrl,
      });
      if (result.assetKind === "etf" && result.source === "JUSTETF") await writeEtfQuote(ref);
      const [m] = await getMetaByIsins([ref.isin]);
      return m ?? null;
    }
    if (result.status === "ERROR") {
      await upsertMeta({ isin: ref.isin, status: "ERROR", error: result.error, bumpFailCount: true, manualUrl });
      const [m] = await getMetaByIsins([ref.isin]);
      return m ?? null;
    }
  }
  await upsertMeta({ isin: ref.isin, status: "NOT_FOUND", markScraped: true, manualUrl });
  const [m] = await getMetaByIsins([ref.isin]);
  return m ?? null;
}

/**
 * Daily metadata TTL sweep for the cron: enrich up to `limit` of the
 * most-due held instruments across all users. Quote refresh itself is
 * handled by the refactored `refreshQuotes` (planQuote routes ETFs to
 * justETF); this only keeps classification/fund facts fresh.
 */
export async function sweepHeldMetadata(limit = 5): Promise<EnrichSummary> {
  const refs = await getHeldRefs();
  return enrichInstruments(refs, limit);
}

export { planQuote, fetchQuoteFor };
