import { describe, it, expect } from "vitest";
import { applyBucketIsolation } from "@/lib/tax/bucket-isolation";

describe("applyBucketIsolation", () => {
  const baseInputs = {
    aktienRealisedNetEur: 0,
    sonstigeRealisedNetEur: 0,
    dividendsEur: 0,
    interestEur: 0,
    forecastDividendsEur: 0,
    allowanceEur: 1000,
  };

  it("the user's actual scenario: €4 stock loss does NOT offset €1008 Sonstige income", () => {
    // Reproduces the discrepancy between the loss-harvest page (€171) and
    // the main tax page (€167) — bucket isolation must close the €4 gap.
    const result = applyBucketIsolation({
      ...baseInputs,
      aktienRealisedNetEur: -4,
      sonstigeRealisedNetEur: 796,      // 792 total - (-4) = 796 ETF/bond gain
      dividendsEur: 214,
      interestEur: -2,
      forecastDividendsEur: 163,
      allowanceEur: 1000,
    });
    expect(result.aktienNetEur).toBe(0);                  // €4 stock loss wasted
    expect(result.sonstigeNetEur).toBeCloseTo(1008, 2);   // 796 + 214 - 2
    expect(result.combinedNetEur).toBeCloseTo(1008, 2);
    expect(result.taxableBaseEur).toBeCloseTo(8, 2);       // 1008 - 1000
    expect(result.forecastTaxableBaseEur).toBeCloseTo(171, 2); // 1008 + 163 - 1000
  });

  it("aktien losses cannot offset Sonstige income (the core §20 Abs. 6 rule)", () => {
    const result = applyBucketIsolation({
      ...baseInputs,
      aktienRealisedNetEur: -500,
      sonstigeRealisedNetEur: 0,
      dividendsEur: 1500,
      interestEur: 0,
    });
    expect(result.aktienNetEur).toBe(0);              // floor at 0
    expect(result.sonstigeNetEur).toBe(1500);
    expect(result.taxableBaseEur).toBe(500);          // 1500 - 1000, NOT 500 (would be if -500 leaked)
  });

  it("Sonstige losses cannot offset Aktien gains", () => {
    const result = applyBucketIsolation({
      ...baseInputs,
      aktienRealisedNetEur: 1500,
      sonstigeRealisedNetEur: -500,
      dividendsEur: 0,
    });
    expect(result.aktienNetEur).toBe(1500);
    expect(result.sonstigeNetEur).toBe(0);            // -500 floored
    expect(result.taxableBaseEur).toBe(500);
  });

  it("margin interest reduces Sonstige (negative interestEur)", () => {
    const result = applyBucketIsolation({
      ...baseInputs,
      sonstigeRealisedNetEur: 0,
      dividendsEur: 1100,
      interestEur: -100,
    });
    expect(result.sonstigeNetEur).toBe(1000);         // 1100 - 100
    expect(result.taxableBaseEur).toBe(0);            // exactly at cap
  });

  it("forecast dividends only flow into the Sonstige bucket", () => {
    const result = applyBucketIsolation({
      ...baseInputs,
      aktienRealisedNetEur: 0,
      sonstigeRealisedNetEur: 500,
      forecastDividendsEur: 600,
    });
    expect(result.combinedNetEur).toBe(500);           // current — no forecast applied
    expect(result.forecastCombinedNetEur).toBe(1100);  // 500 + 600
    expect(result.taxableBaseEur).toBe(0);             // current: 500 < 1000
    expect(result.forecastTaxableBaseEur).toBe(100);   // 1100 - 1000
  });

  it("usedEur is clipped at the allowance", () => {
    const result = applyBucketIsolation({
      ...baseInputs,
      sonstigeRealisedNetEur: 600,
      dividendsEur: 600,
    });
    expect(result.combinedNetEur).toBe(1200);
    expect(result.usedEur).toBe(1000);                 // clipped
    expect(result.taxableBaseEur).toBe(200);
  });

  it("usedEur is zero when both buckets net at zero (all losses)", () => {
    const result = applyBucketIsolation({
      ...baseInputs,
      aktienRealisedNetEur: -100,
      sonstigeRealisedNetEur: -200,
    });
    expect(result.usedEur).toBe(0);
    expect(result.taxableBaseEur).toBe(0);
  });

  it("joint allowance (€2000) is honoured", () => {
    const result = applyBucketIsolation({
      ...baseInputs,
      sonstigeRealisedNetEur: 0,
      dividendsEur: 2100,
      allowanceEur: 2000,
    });
    expect(result.taxableBaseEur).toBe(100);
  });
});

/**
 * Verlustvortrag (§20 Abs. 6 S. 4). A share loss that exceeds share gains is
 * NOT relief this year — it is carried forward and may only ever meet future
 * share gains. The 2025 return made this concrete: €587 share gains against
 * €2,324 share losses left a €1,642 carryforward while €826 of dividends and
 * interest still had to face the allowance on its own.
 */
describe("applyBucketIsolation — share-loss carryforward", () => {
  it("reports the unusable share loss as a carryforward", () => {
    const r = applyBucketIsolation({
      aktienRealisedNetEur: -1650,
      sonstigeRealisedNetEur: 55,
      dividendsEur: 738,
      interestEur: 32,
      forecastDividendsEur: 0,
      allowanceEur: 1000,
    });
    expect(r.aktienCarryforwardEur).toBeCloseTo(1650, 2);
    // The loss cannot touch the Sonstige pot.
    expect(r.sonstigeNetEur).toBeCloseTo(825, 2);
    expect(r.taxableBaseEur).toBe(0);
  });

  it("is zero when the Aktien bucket is net positive", () => {
    const r = applyBucketIsolation({
      aktienRealisedNetEur: 400,
      sonstigeRealisedNetEur: 0,
      dividendsEur: 0,
      interestEur: 0,
      forecastDividendsEur: 0,
      allowanceEur: 1000,
    });
    expect(r.aktienCarryforwardEur).toBe(0);
  });
});
