/**
 * Split realized matches into the two §20 Abs. 6 EStG loss pots.
 *
 * Why this exists as its own pure module: the tax dashboard used to bucket by
 * SYMBOL (`classifyKind(m.symbol, …)`), which cannot separate a bond from a
 * stock that share a ticker. The user's real 2025 return exposed it — the
 * Citigroup bond (US172967MZ11) and Citigroup common stock (US1729674242) both
 * trade as "C", and the bond's −€86.52 was filed as an Aktien loss while ELSTER
 * booked it as "other capital losses". Classification is now ISIN-first via the
 * same `kindFor` the KAP draft uses, so the page and the form can't drift.
 *
 * Also returns gains/losses SEPARATELY per bucket, because that's what the user
 * has to see: an Aktien loss can never reduce ETF gains, dividends or interest —
 * it only offsets Aktien gains, and the remainder is a Verlustvortrag.
 */
import { kindFor, type ClassificationMap } from "./german-tax";

export type RealizedMatchLike = {
  symbol: string;
  isin?: string | null;
  gainEur: string | number;
};

export type BucketTotals = {
  /** Sum of positive results (≥ 0). */
  gains: number;
  /** Sum of negative results (≤ 0). */
  losses: number;
  /** gains + losses (signed). */
  net: number;
};

export type RealizedBucketSplit = {
  /** Individual shares — losses ring-fenced by §20 Abs. 6 S. 4. */
  aktien: BucketTotals;
  /** Funds/ETFs, bonds and everything else — shares the general pot with
   *  dividends and interest. */
  sonstige: BucketTotals;
};

const empty = (): BucketTotals => ({ gains: 0, losses: 0, net: 0 });

function add(t: BucketTotals, gain: number): void {
  if (gain >= 0) t.gains += gain;
  else t.losses += gain;
  t.net += gain;
}

export function splitRealizedByBucket(
  matches: RealizedMatchLike[],
  classification?: ClassificationMap,
): RealizedBucketSplit {
  const out: RealizedBucketSplit = { aktien: empty(), sonstige: empty() };
  for (const m of matches) {
    const gain = Number(m.gainEur);
    if (!Number.isFinite(gain)) continue;
    const kind = kindFor(m.symbol, classification, m.isin ?? undefined);
    add(kind === "stock" ? out.aktien : out.sonstige, gain);
  }
  return out;
}
