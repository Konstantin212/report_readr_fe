/**
 * Pure-function module for the loss-harvest tax optimisation page.
 *
 * Encodes German Abgeltungsteuer mechanics:
 *  - Two separate loss buckets: "Aktien" (individual stocks) and
 *    "Sonstige" (everything else — ETFs, bonds, dividends, interest).
 *  - Aktien losses can only offset Aktien gains; same for Sonstige.
 *  - Each bucket's net is independently floored at zero before summing;
 *    the Sparer-Pauschbetrag is applied to the combined total.
 *  - Tax rate (Abgeltungsteuer 25% + 5.5% Soli on the tax) ≈ 26.375%.
 *
 * No I/O — all functions are pure so they're trivially testable and
 * reusable from a server component, an API route, or a script.
 */
import type { PositionRow } from "@/lib/data/positions";

import { ABGELT_RATE } from "@/lib/tax/constants";

export type HarvestBucket = "aktien" | "sonstige";

export type HarvestCandidate = {
  symbol: string;
  isin: string | undefined;
  name: string | undefined;
  broker: string;             // "FF" | "IBKR" | …
  bucket: HarvestBucket;
  /** Shares to sell to realise the maximum harvestable loss. With FIFO
   *  lots this is the harvest CAP — the prefix of oldest lots up to the
   *  most-negative point of the cumulative realised-P/L curve; selling
   *  more starts consuming cheaper profitable lots and erodes the loss. */
  qty: number;
  /** Cost basis per share of the shares that would actually be sold (the
   *  FIFO prefix), not the whole-position average. */
  avgCostEur: number;
  pricePerUnitEur: number;
  /** Always negative — the maximum loss realisable by selling `qty`. */
  unrealisedLossEur: number;
  /** unrealisedLossEur / qty; always ≤ 0. */
  lossPerShareEur: number;
  quoteSource: string | null;
  asOf: string | null;
  /** Full position size — `qty` may be smaller (FIFO harvest cap). */
  positionQty: number;
  /** Whole-position unrealised P/L (broker view). POSITIVE for hidden-loss
   *  rows: the position is green on average, the harvest comes purely from
   *  underwater front lots. */
  positionPlEur: number | null;
  /** True when the position is overall profitable but its oldest FIFO lots
   *  are underwater at the current price (§20 Abs. 4 EStG mandates FIFO,
   *  so selling exactly `qty` shares realises the loss anyway). */
  hiddenLoss: boolean;
};

/** One open FIFO lot, oldest-first ordering expected by the helpers below. */
export type FifoLot = { qty: number; costEur: number };

/**
 * Walk the FIFO queue at the current price and find the sell quantity that
 * realises the MAXIMUM loss. Selling n shares consumes lots oldest-first
 * (§20 Abs. 4 EStG), so cumulative realised P/L is piecewise linear in n
 * with kinks only at lot boundaries — scanning lot ends is exact. Returns
 * the prefix at the curve's minimum, or null when no prefix realises a
 * loss (i.e. the oldest lots are all at or below the current price).
 *
 * This is what makes "hidden" losses harvestable: a position bought high
 * first and averaged down later is profitable OVERALL, yet selling exactly
 * the first lots realises their loss while keeping the cheap lots.
 */
export function fifoHarvestPrefix(
  lots: FifoLot[],
  priceEur: number,
): { qty: number; lossEur: number; costEur: number } | null {
  let cumQty = 0;
  let cumPnl = 0;
  let cumCost = 0;
  let best: { qty: number; lossEur: number; costEur: number } | null = null;
  for (const lot of lots) {
    if (lot.qty <= 0) continue;
    cumQty += lot.qty;
    cumCost += lot.costEur;
    cumPnl += priceEur * lot.qty - lot.costEur;
    // Strictly-below keeps the FIRST minimum on plateaus — no reason to
    // sell extra shares that change the realised loss by nothing.
    if (cumPnl < -0.005 && (best === null || cumPnl < best.lossEur)) {
      best = { qty: cumQty, lossEur: cumPnl, costEur: cumCost };
    }
  }
  return best;
}

export type BucketSnapshot = {
  realisedGainsEur: number;
  dividendsEur: number;
  interestEur: number;
  forecastAdditionalEur: number;
  totalIncomeEur: number;
};

export type HarvestInputs = {
  allowanceEur: number;
  aktien: BucketSnapshot;
  sonstige: BucketSnapshot;
  candidates: HarvestCandidate[];
};

export type SellInstruction = {
  candidate: HarvestCandidate;
  qtyToSell: number;
  /** Always negative — the loss realised by this sell. Clamped to candidate.qty. */
  realisedLossEur: number;
};

export type HarvestResult = {
  /** Aktien total income + selected aktien losses, floored at zero. */
  aktienNetEur: number;
  sonstigeNetEur: number;
  totalNetCapitalIncomeEur: number;
  taxableBaseEur: number;
  estTaxSavedEur: number;
  totalLossRealisedEur: number;
};

// ---------------------------------------------------------------------------
// buildCandidates — derive harvestable rows from the live positions table
// ---------------------------------------------------------------------------

export function buildCandidates(rows: PositionRow[]): HarvestCandidate[] {
  const out: HarvestCandidate[] = [];
  for (const r of rows) {
    // Explicit null check — a zero price (data-quality glitch) is still a price,
    // not a missing-quote signal. The data layer sets this to null when no
    // quote exists; only that case should skip the row.
    if (r.pricePerUnitEur === null) continue;
    if (r.qty <= 0) continue;
    const positionPl = r.views.broker.plEur;
    const base = {
      symbol: r.symbol,
      isin: r.isin,
      name: r.name,
      broker: r.broker,
      bucket: (r.kind === "stock" ? "aktien" : "sonstige") as HarvestBucket,
      pricePerUnitEur: r.pricePerUnitEur,
      quoteSource: r.quoteSource ?? null,
      asOf: r.asOf,
      positionQty: r.qty,
      positionPlEur: positionPl,
    };

    const lots = r.fifoLots?.filter((l) => l.qty > 0);
    if (lots?.length) {
      // Lot-aware path: harvest the FIFO prefix at the cumulative-loss
      // minimum. Catches BOTH ordinary losers (all lots underwater → prefix
      // = whole position, at true Anschaffungskosten instead of the avg-cost
      // approximation) and hidden losses inside overall-profitable positions.
      const prefix = fifoHarvestPrefix(lots, r.pricePerUnitEur);
      if (!prefix) continue;
      out.push({
        ...base,
        qty: prefix.qty,
        avgCostEur: prefix.costEur / prefix.qty,
        unrealisedLossEur: prefix.lossEur,
        lossPerShareEur: prefix.lossEur / prefix.qty,
        hiddenLoss: positionPl !== null && positionPl >= 0,
      });
      continue;
    }

    // Legacy path (no lot data): whole-position average-cost loss only.
    if (positionPl === null || positionPl >= 0) continue;
    out.push({
      ...base,
      qty: r.qty,
      avgCostEur: r.views.broker.avgCostEur,
      unrealisedLossEur: positionPl,
      lossPerShareEur: positionPl / r.qty,
      hiddenLoss: false,
    });
  }
  // Biggest absolute loss first — the user's eye lands on highest-impact rows.
  out.sort((a, b) => Math.abs(b.unrealisedLossEur) - Math.abs(a.unrealisedLossEur));
  return out;
}

// ---------------------------------------------------------------------------
// computeHarvest — apply selected sells, return per-bucket nets + tax saved
// ---------------------------------------------------------------------------

export function computeHarvest(inputs: HarvestInputs, sells: SellInstruction[]): HarvestResult {
  // Per-bucket: clamp each sell to the candidate's actual qty before summing
  // its realised loss. Defensive against bad URL state ("999 shares" when
  // user only holds 5) and partial-share rounding errors.
  let aktienLossEur = 0;
  let sonstigeLossEur = 0;
  for (const s of sells) {
    const qty = Math.max(0, Math.min(s.candidate.qty, s.qtyToSell));
    if (qty === 0) continue;
    const realised = s.candidate.lossPerShareEur * qty;
    if (s.candidate.bucket === "aktien") aktienLossEur += realised;
    else sonstigeLossEur += realised;
  }

  // Each bucket's net is floored at zero — under §20 Abs. 6 EStG, intra-bucket
  // losses can drag a bucket to zero but never offset the OTHER bucket.
  const aktienNetEur = Math.max(0, inputs.aktien.totalIncomeEur + aktienLossEur);
  const sonstigeNetEur = Math.max(0, inputs.sonstige.totalIncomeEur + sonstigeLossEur);
  const totalNet = aktienNetEur + sonstigeNetEur;
  const taxableBaseEur = Math.max(0, totalNet - inputs.allowanceEur);

  // Current taxable base (zero sells) — what would be owed without any harvest.
  const currentTaxableBase = Math.max(
    0,
    Math.max(0, inputs.aktien.totalIncomeEur)
    + Math.max(0, inputs.sonstige.totalIncomeEur)
    - inputs.allowanceEur,
  );
  const estTaxSavedEur = (currentTaxableBase - taxableBaseEur) * ABGELT_RATE;
  const totalLossRealisedEur = aktienLossEur + sonstigeLossEur;

  return {
    aktienNetEur,
    sonstigeNetEur,
    totalNetCapitalIncomeEur: totalNet,
    taxableBaseEur,
    estTaxSavedEur,
    totalLossRealisedEur,
  };
}

// ---------------------------------------------------------------------------
// suggestOptimum — greedy minimum-sell set to bring taxable base to zero
// ---------------------------------------------------------------------------

export function suggestOptimum(inputs: HarvestInputs): SellInstruction[] {
  const aktienGross = Math.max(0, inputs.aktien.totalIncomeEur);
  const sonstigeGross = Math.max(0, inputs.sonstige.totalIncomeEur);
  const currentTaxableBase = Math.max(0, aktienGross + sonstigeGross - inputs.allowanceEur);
  if (currentTaxableBase <= 0) return [];

  // Strategy: only harvest losses in buckets that have positive gross income
  // (otherwise the loss is "wasted" — see the bucket-isolation test). The
  // allocation between buckets matters: we want to reduce whichever bucket
  // still has positive gain after the allowance, but the allowance applies
  // to the combined total, not per-bucket. So pick losses anywhere a
  // positive-gain bucket exists, biggest absolute loss first.
  const usefulBuckets: Set<HarvestBucket> = new Set();
  if (aktienGross > 0) usefulBuckets.add("aktien");
  if (sonstigeGross > 0) usefulBuckets.add("sonstige");
  const eligible = inputs.candidates.filter((c) => usefulBuckets.has(c.bucket));

  const sells: SellInstruction[] = [];
  let aktienLossUsed = 0;
  let sonstigeLossUsed = 0;
  let remaining = currentTaxableBase;
  for (const c of eligible) {
    if (remaining <= 0) break;
    // Headroom in this bucket — how much loss this bucket can usefully
    // absorb before its net hits zero. Past that point the loss is wasted.
    const usedSoFar = c.bucket === "aktien" ? aktienLossUsed : sonstigeLossUsed;
    const grossInBucket = c.bucket === "aktien" ? aktienGross : sonstigeGross;
    const headroom = Math.max(0, grossInBucket - usedSoFar);
    if (headroom <= 0) continue;
    // Pick the smaller of: position's full loss, headroom, remaining overage.
    const targetLossAbs = Math.min(Math.abs(c.unrealisedLossEur), headroom, remaining);
    const lossPerShareAbs = Math.abs(c.lossPerShareEur);
    if (lossPerShareAbs <= 0) continue;
    let qtyToSell = targetLossAbs / lossPerShareAbs;
    if (qtyToSell >= c.qty) qtyToSell = c.qty;
    const realisedLossEur = -lossPerShareAbs * qtyToSell;
    sells.push({ candidate: c, qtyToSell, realisedLossEur });
    if (c.bucket === "aktien") aktienLossUsed += Math.abs(realisedLossEur);
    else sonstigeLossUsed += Math.abs(realisedLossEur);
    remaining -= Math.abs(realisedLossEur);
  }
  return sells;
}

// ---------------------------------------------------------------------------
// Per-bucket remaining overage + per-candidate suggested shares
// ---------------------------------------------------------------------------

/**
 * Remaining overage per bucket AFTER applying the user's current sells.
 *
 * Used to drive the per-row "shares to zero" hint. Bucket-aware: an Aktien
 * loss only counts against the Aktien bucket, never against Sonstige.
 *
 * Reasoning for the maths: each bucket's *net* is floored at zero before
 * the Pauschbetrag is applied to the combined total (§20 Abs. 6 EStG).
 * To bring taxable base to zero, each bucket's net must be ≤ its share of
 * the allowance. Since the allowance is shared, the OTHER bucket may
 * already consume part of it. So this bucket's target is
 * `max(0, allowance − otherBucket.net)` and the overage to cover is
 * `max(0, thisBucket.net − target)`.
 */
export function bucketOverages(
  inputs: HarvestInputs,
  sells: SellInstruction[],
): { aktien: number; sonstige: number } {
  let aktienLossEur = 0;
  let sonstigeLossEur = 0;
  for (const s of sells) {
    const qty = Math.max(0, Math.min(s.candidate.qty, s.qtyToSell));
    if (qty === 0) continue;
    const realised = s.candidate.lossPerShareEur * qty;
    if (s.candidate.bucket === "aktien") aktienLossEur += realised;
    else sonstigeLossEur += realised;
  }
  const aktienNet = Math.max(0, inputs.aktien.totalIncomeEur + aktienLossEur);
  const sonstigeNet = Math.max(0, inputs.sonstige.totalIncomeEur + sonstigeLossEur);
  const aktienTarget = Math.max(0, inputs.allowanceEur - sonstigeNet);
  const sonstigeTarget = Math.max(0, inputs.allowanceEur - aktienNet);
  return {
    aktien: Math.max(0, aktienNet - aktienTarget),
    sonstige: Math.max(0, sonstigeNet - sonstigeTarget),
  };
}

/**
 * For a single candidate, the integer number of shares that would zero
 * its bucket's remaining overage. Returns null when:
 *   - the bucket has no overage left to cover, OR
 *   - the candidate's loss per share is zero (defensive)
 * The result is clamped to the candidate's own qty.
 */
export function suggestedSharesToZero(
  c: HarvestCandidate,
  overages: { aktien: number; sonstige: number },
): number | null {
  const overage = c.bucket === "aktien" ? overages.aktien : overages.sonstige;
  if (overage <= 0) return null;
  const lossPerShareAbs = Math.abs(c.lossPerShareEur);
  if (lossPerShareAbs <= 0) return null;
  return Math.min(c.qty, Math.ceil(overage / lossPerShareAbs));
}

// ---------------------------------------------------------------------------
// URL param encode / decode
// ---------------------------------------------------------------------------

const FULL_SELL = "all";

export function encodeSellParams(sells: SellInstruction[]): string {
  return sells
    .map((s) => {
      const key = `${s.candidate.symbol}.${s.candidate.broker}`;
      const qty = s.qtyToSell >= s.candidate.qty ? FULL_SELL : String(s.qtyToSell);
      return `${key}:${qty}`;
    })
    .join(",");
}

export function decodeSellParams(raw: string, candidates: HarvestCandidate[]): SellInstruction[] {
  if (!raw) return [];
  const byKey = new Map<string, HarvestCandidate>();
  for (const c of candidates) byKey.set(`${c.symbol}.${c.broker}`, c);
  const out: SellInstruction[] = [];
  for (const chunk of raw.split(",")) {
    const [key, qtyStr] = chunk.split(":");
    if (!key || !qtyStr) continue;
    const cand = byKey.get(key);
    if (!cand) continue;       // unknown candidate — silently skip
    const qty = qtyStr === FULL_SELL ? cand.qty : Number(qtyStr);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const clamped = Math.min(cand.qty, qty);
    out.push({
      candidate: cand,
      qtyToSell: clamped,
      realisedLossEur: cand.lossPerShareEur * clamped,
    });
  }
  return out;
}
