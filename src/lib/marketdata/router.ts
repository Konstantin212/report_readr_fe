/**
 * Provider routing policy — PURE.
 *
 * Given an instrument and (for quotes) its persisted metadata, decide the
 * ORDERED list of providers to try. This module makes no I/O and holds no
 * state; it only encodes "who to ask, and in what order".
 *
 * ## Chain semantics (enforced by the enrich orchestrator, NOT here)
 * The returned array is a fallback chain the orchestrator walks in order:
 *  - a provider that returns OK        → the chain STOPS, its fields win;
 *  - a provider that returns NOT_FOUND → the orchestrator CONTINUES to the
 *                                        next provider in the list;
 *  - a provider that returns ERROR     → the chain STOPS (transient failure
 *                                        is recorded for retry/backoff).
 * The router itself is unaware of results — it just returns the plan. Keeping
 * the ordering pure is what lets it be unit-tested without a DB or network.
 */
import type { InstrumentRef, InstrumentMeta, ManualLink, ProviderId } from "./types";
import { isSyntheticIsin } from "./types";

/**
 * Which providers to consult for METADATA enrichment, in order.
 *
 * - A manual link short-circuits everything: the user told us exactly which
 *   provider owns this instrument, so we return that single provider with no
 *   fallthrough.
 * - US instruments (ISIN "US…") are best served by FMP, with Yahoo as a
 *   fallback.
 * - Everything else defaults to justETF (fund metadata) then Yahoo.
 */
export function planEnrichment(
  ref: InstrumentRef,
  manual: ManualLink | null,
): ProviderId[] {
  if (manual) return [manual.provider];
  if (ref.isin.startsWith("US")) return ["fmp", "yahoo"];
  return ["justetf", "yahoo"];
}

/**
 * Which providers to consult for a QUOTE (EOD price), in order.
 *
 * - justETF-sourced instruments price off justETF by ISIN — for ETFs AND for
 *   the EU stocks its quote API also covers (e.g. RY4C). No ticker guessing,
 *   and justETF is reachable from our Vercel IP where Yahoo often is not.
 * - US listings (and synthetic/absent ISINs) go to FMP, then finviz. Finviz
 *   replaces Yahoo here: Yahoo's chart endpoint throttles/refuses the Vercel
 *   data-center IP for many US names, and FMP's free tier only covers a subset
 *   (DIS/C/HOOD yes; TTWO/NEM/O no) — finviz covers the rest.
 * - Any other non-US listing tries Yahoo, then justETF; if both miss the user
 *   pins it via a manual link (Google Finance / Yahoo / justETF).
 */
export function planQuote(
  ref: InstrumentRef,
  meta: InstrumentMeta | null,
): ProviderId[] {
  if (meta?.source === "JUSTETF") return ["justetf"];
  if (!ref.isin || isSyntheticIsin(ref.isin) || ref.isin.startsWith("US")) {
    return ["fmp", "finviz"];
  }
  return ["yahoo", "justetf"];
}
