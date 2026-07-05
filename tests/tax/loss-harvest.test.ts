/**
 * Pure-function tests for the loss-harvest tax optimisation module.
 *
 * Encodes the bedrock German tax rules:
 *  - Aktien losses can ONLY offset Aktien gains (no cross-bucket offset)
 *  - Sonstige (ETF/bonds/dividends/interest) losses offset only other Sonstige
 *  - The Sparer-Pauschbetrag applies to the combined net (after each bucket
 *    is independently floored at zero)
 */
import { describe, it, expect } from "vitest";
import {
  buildCandidates,
  bucketOverages,
  computeHarvest,
  decodeSellParams,
  encodeSellParams,
  fifoHarvestPrefix,
  suggestedSharesToZero,
  suggestOptimum,
  type HarvestCandidate,
  type HarvestInputs,
  type SellInstruction,
} from "@/lib/tax/loss-harvest";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const makeCand = (overrides: Partial<HarvestCandidate> = {}): HarvestCandidate => ({
  symbol: "TEST",
  isin: undefined,
  name: "Test Co",
  broker: "IBKR",
  bucket: "aktien",
  qty: 100,
  avgCostEur: 50,
  pricePerUnitEur: 40,
  unrealisedLossEur: -1000,
  lossPerShareEur: -10,
  quoteSource: "FMP",
  asOf: "2026-06-05",
  positionQty: 100,
  positionPlEur: -1000,
  hiddenLoss: false,
  ...overrides,
});

const makeInputs = (overrides: Partial<HarvestInputs> = {}): HarvestInputs => ({
  allowanceEur: 1000,
  aktien: {
    realisedGainsEur: 0,
    dividendsEur: 0,
    interestEur: 0,
    forecastAdditionalEur: 0,
    totalIncomeEur: 0,
  },
  sonstige: {
    realisedGainsEur: 0,
    dividendsEur: 0,
    interestEur: 0,
    forecastAdditionalEur: 0,
    totalIncomeEur: 0,
  },
  candidates: [],
  ...overrides,
});

const sellAll = (c: HarvestCandidate): SellInstruction => ({
  candidate: c,
  qtyToSell: c.qty,
  realisedLossEur: c.unrealisedLossEur,
});

// ---------------------------------------------------------------------------
// buildCandidates
// ---------------------------------------------------------------------------

describe("buildCandidates", () => {
  it("excludes rows with no unrealised loss (plEur null or >= 0)", () => {
    const rows = [
      // winner — excluded
      { symbol: "WIN", isin: "x1", name: "Winner", broker: "IBKR", kind: "stock",
        qty: 10, pricePerUnitEur: 100, asOf: "2026-06-05", quoteSource: "FMP",
        views: { broker: { avgCostEur: 50, plEur: 500 } } },
      // no quote — excluded (plEur null)
      { symbol: "NOQ", isin: "x2", name: "No quote", broker: "FF", kind: "stock",
        qty: 5, pricePerUnitEur: null, asOf: null, quoteSource: null,
        views: { broker: { avgCostEur: 20, plEur: null } } },
      // loser — included
      { symbol: "LOSS", isin: "x3", name: "Loser", broker: "IBKR", kind: "stock",
        qty: 10, pricePerUnitEur: 40, asOf: "2026-06-05", quoteSource: "FMP",
        views: { broker: { avgCostEur: 50, plEur: -100 } } },
    ];
    // @ts-expect-error — minimal PositionRow shape for the test
    const out = buildCandidates(rows);
    expect(out.map((c) => c.symbol)).toEqual(["LOSS"]);
  });

  it("classifies kind=stock as aktien, everything else as sonstige", () => {
    const rows = [
      { symbol: "S1", broker: "IBKR", kind: "stock", qty: 1, pricePerUnitEur: 1, asOf: null, quoteSource: null,
        views: { broker: { avgCostEur: 2, plEur: -1 } } },
      { symbol: "S2", broker: "IBKR", kind: "etf",   qty: 1, pricePerUnitEur: 1, asOf: null, quoteSource: null,
        views: { broker: { avgCostEur: 2, plEur: -1 } } },
      { symbol: "S3", broker: "IBKR", kind: "bond",  qty: 1, pricePerUnitEur: 1, asOf: null, quoteSource: null,
        views: { broker: { avgCostEur: 2, plEur: -1 } } },
      { symbol: "S4", broker: "IBKR", kind: "other", qty: 1, pricePerUnitEur: 1, asOf: null, quoteSource: null,
        views: { broker: { avgCostEur: 2, plEur: -1 } } },
    ];
    // @ts-expect-error
    const out = buildCandidates(rows);
    expect(out.find((c) => c.symbol === "S1")?.bucket).toBe("aktien");
    expect(out.find((c) => c.symbol === "S2")?.bucket).toBe("sonstige");
    expect(out.find((c) => c.symbol === "S3")?.bucket).toBe("sonstige");
    expect(out.find((c) => c.symbol === "S4")?.bucket).toBe("sonstige");
  });

  it("sorts by absolute loss size descending within the full list", () => {
    const rows = [
      { symbol: "A", broker: "IBKR", kind: "stock", qty: 1, pricePerUnitEur: 1, asOf: null, quoteSource: null,
        views: { broker: { avgCostEur: 11, plEur: -10 } } },
      { symbol: "B", broker: "IBKR", kind: "stock", qty: 1, pricePerUnitEur: 1, asOf: null, quoteSource: null,
        views: { broker: { avgCostEur: 101, plEur: -100 } } },
      { symbol: "C", broker: "IBKR", kind: "stock", qty: 1, pricePerUnitEur: 1, asOf: null, quoteSource: null,
        views: { broker: { avgCostEur: 51, plEur: -50 } } },
    ];
    // @ts-expect-error
    const out = buildCandidates(rows);
    expect(out.map((c) => c.symbol)).toEqual(["B", "C", "A"]);
  });

  it("computes per-share loss as unrealisedLoss / qty", () => {
    const rows = [
      { symbol: "X", broker: "IBKR", kind: "stock", qty: 4, pricePerUnitEur: 80, asOf: null, quoteSource: null,
        views: { broker: { avgCostEur: 100, plEur: -80 } } },
    ];
    // @ts-expect-error
    const out = buildCandidates(rows);
    expect(out[0].lossPerShareEur).toBe(-20);
  });
});

// ---------------------------------------------------------------------------
// FIFO lot-aware harvesting — hidden losses inside profitable positions
// ---------------------------------------------------------------------------

describe("fifoHarvestPrefix", () => {
  it("finds the loss in the oldest lot of an overall-profitable position", () => {
    // Buy 10 @ €100, then 10 @ €50. Price €80: position = +€100 overall,
    // but FIFO sells the €100 lot first → selling 10 realises −€200.
    const prefix = fifoHarvestPrefix(
      [{ qty: 10, costEur: 1000 }, { qty: 10, costEur: 500 }],
      80,
    );
    expect(prefix).toEqual({ qty: 10, lossEur: -200, costEur: 1000 });
  });

  it("returns null when the oldest lots are the cheap ones (rising DCA)", () => {
    // Bought low first, averaged UP. Every FIFO prefix is profitable.
    const prefix = fifoHarvestPrefix(
      [{ qty: 10, costEur: 500 }, { qty: 10, costEur: 1000 }],
      80,
    );
    expect(prefix).toBeNull();
  });

  it("covers the whole position when all lots are underwater", () => {
    const prefix = fifoHarvestPrefix(
      [{ qty: 5, costEur: 600 }, { qty: 5, costEur: 550 }],
      100,
    );
    expect(prefix).toEqual({ qty: 10, lossEur: -150, costEur: 1150 });
  });

  it("sells THROUGH a profitable front lot when a deeper loss lot follows", () => {
    // Lot 1: 10 @ €70 (gain +100 at price 80); lot 2: 10 @ €120 (loss −400).
    // Min of the cumulative curve is at qty 20: +100 − 400 = −300.
    const prefix = fifoHarvestPrefix(
      [{ qty: 10, costEur: 700 }, { qty: 10, costEur: 1200 }],
      80,
    );
    expect(prefix).toEqual({ qty: 20, lossEur: -300, costEur: 1900 });
  });

  it("stops at the loss minimum — later cheap lots are never included", () => {
    // Loss lot, then a big cheap lot. Selling past qty 10 erodes the loss.
    const prefix = fifoHarvestPrefix(
      [{ qty: 10, costEur: 1000 }, { qty: 100, costEur: 1000 }],
      80,
    );
    expect(prefix).toEqual({ qty: 10, lossEur: -200, costEur: 1000 });
  });
});

describe("buildCandidates — lot-aware (hidden losses)", () => {
  const baseRow = {
    broker: "IBKR", asOf: null, quoteSource: null,
  };

  it("surfaces an overall-PROFITABLE position whose front lots are underwater", () => {
    const rows = [
      { ...baseRow, symbol: "ETF1", kind: "etf", qty: 20, pricePerUnitEur: 80,
        views: { broker: { avgCostEur: 75, plEur: 100 } },
        fifoLots: [
          { openedAt: "2024-01-02", qty: 10, costEur: 1000 },
          { openedAt: "2025-06-01", qty: 10, costEur: 500 },
        ] },
    ];
    // @ts-expect-error — minimal PositionRow shape for the test
    const out = buildCandidates(rows);
    expect(out).toHaveLength(1);
    const c = out[0];
    expect(c.hiddenLoss).toBe(true);
    expect(c.bucket).toBe("sonstige");
    expect(c.qty).toBe(10);            // harvest cap: only the underwater lot
    expect(c.positionQty).toBe(20);
    expect(c.unrealisedLossEur).toBe(-200);
    expect(c.avgCostEur).toBe(100);    // prefix cost basis, not position avg
  });

  it("skips profitable positions with no underwater prefix", () => {
    const rows = [
      { ...baseRow, symbol: "UP", kind: "etf", qty: 20, pricePerUnitEur: 80,
        views: { broker: { avgCostEur: 40, plEur: 800 } },
        fifoLots: [
          { openedAt: "2024-01-02", qty: 10, costEur: 300 },
          { openedAt: "2025-06-01", qty: 10, costEur: 500 },
        ] },
    ];
    // @ts-expect-error
    expect(buildCandidates(rows)).toHaveLength(0);
  });

  it("uses lot-level Anschaffungskosten for ordinary losers too", () => {
    const rows = [
      { ...baseRow, symbol: "DOWN", kind: "stock", qty: 10, pricePerUnitEur: 50,
        views: { broker: { avgCostEur: 100, plEur: -500 } },
        fifoLots: [{ openedAt: "2024-01-02", qty: 10, costEur: 1020 }] }, // incl. €20 fees
    ];
    // @ts-expect-error
    const out = buildCandidates(rows);
    expect(out).toHaveLength(1);
    expect(out[0].hiddenLoss).toBe(false);
    expect(out[0].unrealisedLossEur).toBe(-520); // lot basis, incl. fees
    expect(out[0].qty).toBe(10);
  });

  it("a hidden Sonstige loss becomes pickable against a dividend overage", () => {
    const rows = [
      { ...baseRow, symbol: "ETF1", kind: "etf", qty: 20, pricePerUnitEur: 80,
        views: { broker: { avgCostEur: 75, plEur: 100 } },
        fifoLots: [
          { openedAt: "2024-01-02", qty: 10, costEur: 1000 },
          { openedAt: "2025-06-01", qty: 10, costEur: 500 },
        ] },
    ];
    // @ts-expect-error
    const candidates = buildCandidates(rows);
    // €1,150 of Sonstige income vs €1,000 allowance → €150 overage.
    const inputs = makeInputs({
      sonstige: { realisedGainsEur: 0, dividendsEur: 1150, interestEur: 0, forecastAdditionalEur: 0, totalIncomeEur: 1150 },
      candidates,
    });
    const optimum = suggestOptimum(inputs);
    expect(optimum).toHaveLength(1);
    expect(optimum[0].candidate.symbol).toBe("ETF1");
    // €150 target at −€20/share → 7.5 shares, well inside the 10-share cap.
    expect(optimum[0].qtyToSell).toBeCloseTo(7.5, 5);
    expect(computeHarvest(inputs, optimum).taxableBaseEur).toBeCloseTo(0, 5);
  });
});

// ---------------------------------------------------------------------------
// computeHarvest — bucket isolation law
// ---------------------------------------------------------------------------

describe("computeHarvest — bucket isolation", () => {
  it("aktien loss does NOT reduce sonstige net (cross-offset prohibited)", () => {
    const inputs = makeInputs({
      aktien:   { realisedGainsEur: 0,   dividendsEur: 0,   interestEur: 0, forecastAdditionalEur: 0, totalIncomeEur: 0 },
      sonstige: { realisedGainsEur: 800, dividendsEur: 200, interestEur: 0, forecastAdditionalEur: 0, totalIncomeEur: 1000 },
    });
    const stockLoss = makeCand({ bucket: "aktien", unrealisedLossEur: -2000, qty: 1, lossPerShareEur: -2000 });
    const out = computeHarvest(inputs, [sellAll(stockLoss)]);
    // Sonstige bucket should still owe €0 (€1000 - €1000 allowance)
    // Aktien bucket should NOT subtract the €2000 loss from sonstige's €1000
    expect(out.sonstigeNetEur).toBe(1000);
    expect(out.aktienNetEur).toBe(0);     // floored at 0 (was 0 - 2000 = -2000)
    expect(out.taxableBaseEur).toBe(0);   // 1000 + 0 - 1000 allowance
  });

  it("sonstige loss does NOT reduce aktien net", () => {
    const inputs = makeInputs({
      aktien:   { realisedGainsEur: 1500, dividendsEur: 0, interestEur: 0, forecastAdditionalEur: 0, totalIncomeEur: 1500 },
      sonstige: { realisedGainsEur: 0,    dividendsEur: 0, interestEur: 0, forecastAdditionalEur: 0, totalIncomeEur: 0 },
    });
    const etfLoss = makeCand({ bucket: "sonstige", unrealisedLossEur: -5000, qty: 1, lossPerShareEur: -5000 });
    const out = computeHarvest(inputs, [sellAll(etfLoss)]);
    expect(out.aktienNetEur).toBe(1500);
    expect(out.sonstigeNetEur).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeHarvest — allowance arithmetic
// ---------------------------------------------------------------------------

describe("computeHarvest — allowance arithmetic", () => {
  it("zero sells: taxable base equals current state", () => {
    const inputs = makeInputs({
      aktien:   { realisedGainsEur: 800, dividendsEur: 0, interestEur: 0, forecastAdditionalEur: 0, totalIncomeEur: 800 },
      sonstige: { realisedGainsEur: 0,   dividendsEur: 400, interestEur: 0, forecastAdditionalEur: 0, totalIncomeEur: 400 },
    });
    const out = computeHarvest(inputs, []);
    expect(out.aktienNetEur).toBe(800);
    expect(out.sonstigeNetEur).toBe(400);
    expect(out.taxableBaseEur).toBe(200); // 800 + 400 - 1000
  });

  it("selling exactly enough aktien losses to neutralise the overage", () => {
    const inputs = makeInputs({
      aktien:   { realisedGainsEur: 800, dividendsEur: 0, interestEur: 0, forecastAdditionalEur: 0, totalIncomeEur: 800 },
      sonstige: { realisedGainsEur: 0,   dividendsEur: 400, interestEur: 0, forecastAdditionalEur: 0, totalIncomeEur: 400 },
    });
    const loss = makeCand({ bucket: "aktien", unrealisedLossEur: -200, qty: 1, lossPerShareEur: -200 });
    const out = computeHarvest(inputs, [sellAll(loss)]);
    expect(out.aktienNetEur).toBe(600);   // 800 - 200
    expect(out.sonstigeNetEur).toBe(400);
    expect(out.taxableBaseEur).toBe(0);   // 1000 - 1000 allowance
  });

  it("estimated tax saved at 26.375% (Abgeltungsteuer + Soli)", () => {
    // Current taxable base = 200; harvest brings it to 0 → tax saved = 200 * 0.26375 = 52.75
    const inputs = makeInputs({
      aktien:   { realisedGainsEur: 800, dividendsEur: 0, interestEur: 0, forecastAdditionalEur: 0, totalIncomeEur: 800 },
      sonstige: { realisedGainsEur: 0,   dividendsEur: 400, interestEur: 0, forecastAdditionalEur: 0, totalIncomeEur: 400 },
    });
    const loss = makeCand({ bucket: "aktien", unrealisedLossEur: -200, qty: 1, lossPerShareEur: -200 });
    const out = computeHarvest(inputs, [sellAll(loss)]);
    expect(out.estTaxSavedEur).toBeCloseTo(200 * 0.26375, 2);
  });

  it("over-harvesting beyond the bucket floor wastes the excess (no negative carry to other bucket)", () => {
    const inputs = makeInputs({
      aktien:   { realisedGainsEur: 200, dividendsEur: 0, interestEur: 0, forecastAdditionalEur: 0, totalIncomeEur: 200 },
      sonstige: { realisedGainsEur: 0,   dividendsEur: 500, interestEur: 0, forecastAdditionalEur: 0, totalIncomeEur: 500 },
    });
    const loss = makeCand({ bucket: "aktien", unrealisedLossEur: -1000, qty: 1, lossPerShareEur: -1000 });
    const out = computeHarvest(inputs, [sellAll(loss)]);
    expect(out.aktienNetEur).toBe(0);     // floored — €800 of loss wasted
    expect(out.sonstigeNetEur).toBe(500);
    expect(out.taxableBaseEur).toBe(0);   // 500 < 1000 allowance
  });

  it("forecast dividends are added to sonstige bucket", () => {
    const inputs = makeInputs({
      aktien:   { realisedGainsEur: 0, dividendsEur: 0,   interestEur: 0, forecastAdditionalEur: 0,   totalIncomeEur: 0 },
      sonstige: { realisedGainsEur: 0, dividendsEur: 800, interestEur: 0, forecastAdditionalEur: 300, totalIncomeEur: 1100 },
    });
    const out = computeHarvest(inputs, []);
    expect(out.sonstigeNetEur).toBe(1100);
    expect(out.taxableBaseEur).toBe(100); // 1100 - 1000 allowance
  });
});

// ---------------------------------------------------------------------------
// computeHarvest — partial-qty sells
// ---------------------------------------------------------------------------

describe("computeHarvest — partial-qty sells", () => {
  it("selling half the qty realises half the loss", () => {
    const inputs = makeInputs({
      aktien: { realisedGainsEur: 500, dividendsEur: 0, interestEur: 0, forecastAdditionalEur: 0, totalIncomeEur: 500 },
    });
    const c = makeCand({ bucket: "aktien", qty: 100, unrealisedLossEur: -200, lossPerShareEur: -2 });
    const out = computeHarvest(inputs, [{ candidate: c, qtyToSell: 50, realisedLossEur: -100 }]);
    expect(out.aktienNetEur).toBe(400); // 500 - 100
  });

  it("clamps qty above the position size to the full qty", () => {
    const inputs = makeInputs({
      aktien: { realisedGainsEur: 500, dividendsEur: 0, interestEur: 0, forecastAdditionalEur: 0, totalIncomeEur: 500 },
    });
    const c = makeCand({ bucket: "aktien", qty: 100, unrealisedLossEur: -200, lossPerShareEur: -2 });
    // Try to sell more than we hold — should clamp to qty=100, realising the full -200
    const out = computeHarvest(inputs, [{ candidate: c, qtyToSell: 500, realisedLossEur: -1000 }]);
    expect(out.aktienNetEur).toBe(300); // 500 - 200 (full loss only)
  });

  it("zero or negative qty contributes nothing", () => {
    const inputs = makeInputs({
      aktien: { realisedGainsEur: 500, dividendsEur: 0, interestEur: 0, forecastAdditionalEur: 0, totalIncomeEur: 500 },
    });
    const c = makeCand({ bucket: "aktien", qty: 100, unrealisedLossEur: -200, lossPerShareEur: -2 });
    const out = computeHarvest(inputs, [{ candidate: c, qtyToSell: 0, realisedLossEur: 0 }]);
    expect(out.aktienNetEur).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// suggestOptimum
// ---------------------------------------------------------------------------

describe("suggestOptimum", () => {
  it("returns empty when already inside the allowance", () => {
    const inputs = makeInputs({
      sonstige: { realisedGainsEur: 0, dividendsEur: 500, interestEur: 0, forecastAdditionalEur: 0, totalIncomeEur: 500 },
    });
    const out = suggestOptimum(inputs);
    expect(out).toEqual([]);
  });

  it("picks the smallest combination that neutralises the overage", () => {
    // sonstige overage = €200. Candidates: -€50, -€500. Greedy picks the -€500 in full but only realises €200 worth.
    const c50  = makeCand({ symbol: "S50",  bucket: "sonstige", qty: 50,  unrealisedLossEur: -50,  lossPerShareEur: -1 });
    const c500 = makeCand({ symbol: "S500", bucket: "sonstige", qty: 100, unrealisedLossEur: -500, lossPerShareEur: -5 });
    const inputs = makeInputs({
      sonstige: { realisedGainsEur: 0, dividendsEur: 1200, interestEur: 0, forecastAdditionalEur: 0, totalIncomeEur: 1200 },
      candidates: [c500, c50],
    });
    const out = suggestOptimum(inputs);
    expect(out).toHaveLength(1);
    expect(out[0].candidate.symbol).toBe("S500");
    expect(out[0].realisedLossEur).toBeCloseTo(-200);  // partial sell to exactly hit zero
    // qtyToSell = 200 / lossPerShare(5) = 40 shares
    expect(out[0].qtyToSell).toBeCloseTo(40);
  });

  it("does not assign aktien losses to neutralise sonstige overages (and vice-versa)", () => {
    // Sonstige overage = €200. Only aktien losses available.
    const inputs = makeInputs({
      sonstige: { realisedGainsEur: 0, dividendsEur: 1200, interestEur: 0, forecastAdditionalEur: 0, totalIncomeEur: 1200 },
      candidates: [makeCand({ bucket: "aktien", unrealisedLossEur: -500, qty: 1, lossPerShareEur: -500 })],
    });
    const out = suggestOptimum(inputs);
    // Aktien loss is useless against a sonstige overage — return empty
    expect(out).toEqual([]);
  });

  it("respects the joint allowance (€2000)", () => {
    const inputs = makeInputs({
      allowanceEur: 2000,
      sonstige: { realisedGainsEur: 0, dividendsEur: 2100, interestEur: 0, forecastAdditionalEur: 0, totalIncomeEur: 2100 },
      candidates: [makeCand({ bucket: "sonstige", unrealisedLossEur: -500, qty: 100, lossPerShareEur: -5 })],
    });
    const out = suggestOptimum(inputs);
    expect(out).toHaveLength(1);
    // Overage = €100 (€2100 − €2000). Pick 20 shares at €5 loss/share.
    expect(out[0].qtyToSell).toBeCloseTo(20);
    expect(out[0].realisedLossEur).toBeCloseTo(-100);
  });
});

// ---------------------------------------------------------------------------
// bucketOverages
// ---------------------------------------------------------------------------

describe("bucketOverages", () => {
  it("reports the per-bucket overage that needs covering, no sells yet", () => {
    const inputs = makeInputs({
      aktien:   { realisedGainsEur: 0,    dividendsEur: 0,   interestEur: 0, forecastAdditionalEur: 0,   totalIncomeEur: 0 },
      sonstige: { realisedGainsEur: 796,  dividendsEur: 214, interestEur: -2, forecastAdditionalEur: 163, totalIncomeEur: 1171 },
    });
    const o = bucketOverages(inputs, []);
    expect(o.aktien).toBe(0);
    expect(o.sonstige).toBeCloseTo(171, 2);
  });

  it("user's portfolio: Aktien sells have ZERO impact on Sonstige overage when Aktien is already at zero", () => {
    // The case from the screenshot: aktien is already floored at 0 (a small
    // realised stock loss). Selling more aktien losers doesn't help — the
    // Sonstige bucket is what's over the cap.
    const inputs = makeInputs({
      aktien:   { realisedGainsEur: -4,   dividendsEur: 0,   interestEur: 0,  forecastAdditionalEur: 0,   totalIncomeEur: -4 },
      sonstige: { realisedGainsEur: 796,  dividendsEur: 214, interestEur: -2, forecastAdditionalEur: 163, totalIncomeEur: 1171 },
    });
    const dis = makeCand({ bucket: "aktien", unrealisedLossEur: -362.92, qty: 20, lossPerShareEur: -18.15 });
    // Even at 20-share DIS sell (full position), sonstige overage is unchanged.
    const after = bucketOverages(inputs, [sellAll(dis)]);
    expect(after.aktien).toBe(0);
    expect(after.sonstige).toBeCloseTo(171, 2);
  });

  it("a same-bucket loss reduces that bucket's overage, ceteris paribus", () => {
    const inputs = makeInputs({
      sonstige: { realisedGainsEur: 0, dividendsEur: 1500, interestEur: 0, forecastAdditionalEur: 0, totalIncomeEur: 1500 },
    });
    // Sonstige overage starts at 500. Sell a -€200 Sonstige loss → drops to 300.
    const etf = makeCand({ bucket: "sonstige", unrealisedLossEur: -200, qty: 1, lossPerShareEur: -200 });
    const after = bucketOverages(inputs, [sellAll(etf)]);
    expect(after.sonstige).toBeCloseTo(300, 2);
  });

  it("returns zero overage when the bucket already fits under the allowance", () => {
    const inputs = makeInputs({
      sonstige: { realisedGainsEur: 0, dividendsEur: 500, interestEur: 0, forecastAdditionalEur: 0, totalIncomeEur: 500 },
    });
    const o = bucketOverages(inputs, []);
    expect(o.sonstige).toBe(0);
  });

  it("mixed buckets: each bucket's overage = amount it could absorb ALONE to zero taxable base", () => {
    // Both buckets at 600 with allowance 1000 → true taxable base = 200.
    // EITHER bucket can absorb 200 of loss to zero taxable. So per-bucket
    // overage = 200 for each. Critical: this is NOT additive — the user
    // only needs to harvest 200 worth from ONE bucket, not 400 from both.
    const inputs = makeInputs({
      aktien:   { realisedGainsEur: 600, dividendsEur: 0,   interestEur: 0, forecastAdditionalEur: 0, totalIncomeEur: 600 },
      sonstige: { realisedGainsEur: 0,   dividendsEur: 600, interestEur: 0, forecastAdditionalEur: 0, totalIncomeEur: 600 },
    });
    const o = bucketOverages(inputs, []);
    expect(o.aktien).toBe(200);
    expect(o.sonstige).toBe(200);
    // Confirm: selling 200 of aktien alone zeros it. Selling 100 of each
    // ALSO zeros it (over-harvesting waste = 0 since each contribution
    // applies to the same combined sum).
    const ak200 = makeCand({ bucket: "aktien", unrealisedLossEur: -200, qty: 1, lossPerShareEur: -200 });
    const afterAktienOnly = bucketOverages(inputs, [sellAll(ak200)]);
    expect(afterAktienOnly.aktien).toBe(0);
    expect(afterAktienOnly.sonstige).toBe(0); // also drops to 0 — single sell zeros taxable
  });
});

// ---------------------------------------------------------------------------
// suggestedSharesToZero
// ---------------------------------------------------------------------------

describe("suggestedSharesToZero", () => {
  it("returns null when the candidate's bucket has no overage", () => {
    // The user's exact scenario: Aktien candidates exist but only Sonstige
    // has overage. All Aktien rows must show "—".
    const dis = makeCand({ bucket: "aktien", unrealisedLossEur: -362.92, qty: 20, lossPerShareEur: -18.15 });
    const result = suggestedSharesToZero(dis, { aktien: 0, sonstige: 171.39 });
    expect(result).toBeNull();
  });

  it("rounds up to the nearest whole share", () => {
    const cand = makeCand({ bucket: "sonstige", lossPerShareEur: -10, qty: 100 });
    // overage 31 / 10 = 3.1 → ceil → 4
    expect(suggestedSharesToZero(cand, { aktien: 0, sonstige: 31 })).toBe(4);
  });

  it("clamps to the candidate's own qty (can't sell what we don't hold)", () => {
    const cand = makeCand({ bucket: "sonstige", lossPerShareEur: -1, qty: 50 });
    // overage 1000 / 1 = 1000, but qty is 50 → clamped to 50
    expect(suggestedSharesToZero(cand, { aktien: 0, sonstige: 1000 })).toBe(50);
  });

  it("returns null defensively when lossPerShare is zero", () => {
    const cand = makeCand({ bucket: "sonstige", lossPerShareEur: 0, qty: 100, unrealisedLossEur: 0 });
    expect(suggestedSharesToZero(cand, { aktien: 0, sonstige: 100 })).toBeNull();
  });

  it("matches the user's DIS example math when DIS's bucket has overage", () => {
    // Hypothetical: if DIS were Sonstige, 10 shares would cover €171.39.
    const dis = makeCand({ bucket: "sonstige", lossPerShareEur: -18.15, qty: 20 });
    expect(suggestedSharesToZero(dis, { aktien: 0, sonstige: 171.39 })).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// URL param round-trip
// ---------------------------------------------------------------------------

describe("encodeSellParams / decodeSellParams", () => {
  const COIN = makeCand({ symbol: "COIN", broker: "IBKR", qty: 5, unrealisedLossEur: -100, lossPerShareEur: -20 });
  const SPYW = makeCand({ symbol: "SPYW", broker: "FF",   qty: 100, unrealisedLossEur: -50, lossPerShareEur: -0.5, bucket: "sonstige" });

  it("encodes 'all' for full-quantity sells", () => {
    const raw = encodeSellParams([sellAll(COIN), sellAll(SPYW)]);
    expect(raw).toContain("COIN.IBKR:all");
    expect(raw).toContain("SPYW.FF:all");
  });

  it("encodes the explicit qty for partial sells", () => {
    const raw = encodeSellParams([{ candidate: COIN, qtyToSell: 3, realisedLossEur: -60 }]);
    expect(raw).toBe("COIN.IBKR:3");
  });

  it("decodes a full-sell instruction back to the candidate's qty", () => {
    const out = decodeSellParams("COIN.IBKR:all", [COIN, SPYW]);
    expect(out).toHaveLength(1);
    expect(out[0].qtyToSell).toBe(5);
    expect(out[0].realisedLossEur).toBe(-100);
  });

  it("decodes a partial-sell instruction with realised loss = qty × loss/share", () => {
    const out = decodeSellParams("COIN.IBKR:2", [COIN, SPYW]);
    expect(out).toHaveLength(1);
    expect(out[0].qtyToSell).toBe(2);
    expect(out[0].realisedLossEur).toBeCloseTo(-40);
  });

  it("silently ignores unknown symbol.broker keys in the param string", () => {
    const out = decodeSellParams("UNKNOWN.IBKR:all,COIN.IBKR:2", [COIN, SPYW]);
    expect(out).toHaveLength(1);
    expect(out[0].candidate.symbol).toBe("COIN");
  });

  it("clamps qty above the position size", () => {
    const out = decodeSellParams("COIN.IBKR:999", [COIN, SPYW]);
    expect(out[0].qtyToSell).toBe(5);
  });

  it("empty string decodes to empty array", () => {
    expect(decodeSellParams("", [COIN])).toEqual([]);
  });

  it("round-trips through encode → decode", () => {
    const original: SellInstruction[] = [
      { candidate: COIN, qtyToSell: 3, realisedLossEur: -60 },
      sellAll(SPYW),
    ];
    const decoded = decodeSellParams(encodeSellParams(original), [COIN, SPYW]);
    expect(decoded.map((s) => s.qtyToSell)).toEqual([3, 100]);
  });
});
