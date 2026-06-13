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

export const ABGELT_RATE = 0.26375;

export type HarvestBucket = "aktien" | "sonstige";

export type HarvestCandidate = {
  symbol: string;
  isin: string | undefined;
  name: string | undefined;
  broker: string;             // "FF" | "IBKR" | …
  bucket: HarvestBucket;
  qty: number;
  avgCostEur: number;
  pricePerUnitEur: number;
  /** Always negative — the unrealised loss in EUR (broker view, excl. dividends). */
  unrealisedLossEur: number;
  /** unrealisedLossEur / qty; always ≤ 0. */
  lossPerShareEur: number;
  quoteSource: string | null;
  asOf: string | null;
};

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
    const loss = r.views.broker.plEur;
    if (loss === null || loss >= 0) continue;
    // Explicit null check — a zero price (data-quality glitch) is still a price,
    // not a missing-quote signal. The data layer sets this to null when no
    // quote exists; only that case should skip the row.
    if (r.pricePerUnitEur === null) continue;
    const qty = r.qty;
    if (qty <= 0) continue;
    out.push({
      symbol: r.symbol,
      isin: r.isin,
      name: r.name,
      broker: r.broker,
      bucket: r.kind === "stock" ? "aktien" : "sonstige",
      qty,
      avgCostEur: r.views.broker.avgCostEur,
      pricePerUnitEur: r.pricePerUnitEur,
      unrealisedLossEur: loss,
      lossPerShareEur: loss / qty,
      quoteSource: r.quoteSource ?? null,
      asOf: r.asOf,
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
