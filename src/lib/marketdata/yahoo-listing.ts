/**
 * Ordered Yahoo quote-symbol candidates for an instrument.
 *
 * Priority: any listing metadata already pinned (justETF/Yahoo enrichment or a
 * manual link), then — for a non-US ISIN — the primary listing derived from the
 * ISIN country. A US or synthetic (symbol-pinned) instrument prices off the
 * bare broker symbol; a non-US instrument NEVER does, because a bare ticker
 * collides with a same-named US listing (Yahoo "TRN" = Trinity Industries, not
 * Trainline "TRN.L"). An unmapped non-US exchange yields no guess — better a
 * broker snapshot than a wrong-company price.
 */
import { isSyntheticIsin, type InstrumentMeta, type InstrumentRef } from "./types";

/** ISIN country prefix → Yahoo suffix for that country's primary exchange. */
export const ISIN_COUNTRY_SUFFIX: Record<string, string> = {
  GB: ".L", IE: ".L", DE: ".DE", FR: ".PA", NL: ".AS", CH: ".SW",
  IT: ".MI", ES: ".MC", BE: ".BR", PT: ".LS", AT: ".VI", FI: ".HE",
  SE: ".ST", NO: ".OL", DK: ".CO",
};

export function yahooQuoteCandidates(ref: InstrumentRef, meta: InstrumentMeta | null): string[] {
  const out: string[] = [];
  const push = (s?: string | null) => { if (s && !out.includes(s)) out.push(s); };

  push(meta?.yahooQuoteSymbol);
  push(meta?.yahooSymbol);

  const usOrSynthetic = !ref.isin || isSyntheticIsin(ref.isin) || ref.isin.startsWith("US");
  if (usOrSynthetic) {
    push(ref.symbol);
  } else {
    const suffix = ISIN_COUNTRY_SUFFIX[ref.isin.slice(0, 2)];
    if (suffix) push(`${ref.symbol}${suffix}`);
    // Unmapped non-US exchange: no safe guess — rely on pinned meta only.
  }
  return out;
}
