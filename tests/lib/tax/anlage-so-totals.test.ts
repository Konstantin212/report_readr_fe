import { describe, expect, it } from "vitest";

import { computeAnlageSoTotals, freigrenze23For, type Section23Match } from "@/lib/tax/anlage-so";

function m(gainEur: number, isLongTerm = false): Section23Match {
  return {
    symbol: "ETH",
    openedAt: "2025-01-01",
    closedAt: "2025-06-01",
    qty: 1,
    costEur: 100,
    proceedsEur: 100 + gainEur,
    gainEur,
    holdingDays: isLongTerm ? 400 : 150,
    isLongTerm,
  };
}

describe("computeAnlageSoTotals — §22 and §23 are independent buckets", () => {
  it("§22: staking below €256 is not taxable", () => {
    const t = computeAnlageSoTotals(200, 10, [], 2025);
    expect(t.section22.freigrenzeReached).toBe(false);
    expect(t.section22.taxableEur).toBe(0);
  });

  it("§22: staking at/above €256 is fully taxable (cliff)", () => {
    const t = computeAnlageSoTotals(256, 10, [], 2025);
    expect(t.section22.freigrenzeReached).toBe(true);
    expect(t.section22.taxableEur).toBe(256);
  });

  it("§23: net short-term gain below the €1000 cliff (2024+) is not taxable", () => {
    const t = computeAnlageSoTotals(0, 0, [m(900)], 2025);
    expect(t.section23.freigrenzeEur).toBe(1000);
    expect(t.section23.freigrenzeReached).toBe(false);
    expect(t.section23.taxableEur).toBe(0);
  });

  it("§23: net short-term gain at/above €1000 is fully taxable", () => {
    const t = computeAnlageSoTotals(0, 0, [m(1000)], 2025);
    expect(t.section23.freigrenzeReached).toBe(true);
    expect(t.section23.taxableEur).toBe(1000);
  });

  it("§23: pre-2024 cliff is €600", () => {
    expect(freigrenze23For(2023)).toBe(600);
    expect(freigrenze23For(2024)).toBe(1000);
    const t = computeAnlageSoTotals(0, 0, [m(700)], 2023);
    expect(t.section23.freigrenzeEur).toBe(600);
    expect(t.section23.freigrenzeReached).toBe(true);
    expect(t.section23.taxableEur).toBe(700);
  });

  it("§23: short-term gains and losses net against each other", () => {
    const t = computeAnlageSoTotals(0, 0, [m(1500), m(-600)], 2025);
    expect(t.section23.shortTermNetGainEur).toBe(900);
    expect(t.section23.freigrenzeReached).toBe(false); // 900 < 1000
    expect(t.section23.taxableEur).toBe(0);
  });

  it("§23: a net loss is never taxable and surfaces as a carryforward", () => {
    const t = computeAnlageSoTotals(0, 0, [m(-500)], 2025);
    expect(t.section23.shortTermNetGainEur).toBe(-500);
    expect(t.section23.freigrenzeReached).toBe(false);
    expect(t.section23.taxableEur).toBe(0);
    expect(t.section23.lossCarryforwardEur).toBe(500);
  });

  it("long-term matches are excluded from the §23 taxable net", () => {
    const t = computeAnlageSoTotals(0, 0, [m(5000, true), m(100)], 2025);
    expect(t.section23.shortTermNetGainEur).toBe(100);
    expect(t.section23.longTermTaxFreeEur).toBe(5000);
    expect(t.section23.taxableEur).toBe(0);
  });

  it("does NOT combine §22 and §23 into one threshold (the regression)", () => {
    // Staking €200 (<256) and §23 net €900 (<1000): each below its own
    // cliff, so nothing is taxable. The old code summed them to €1100 and
    // taxed the lot against a single €256 threshold.
    const t = computeAnlageSoTotals(200, 5, [m(900)], 2025);
    expect(t.section22.taxableEur).toBe(0);
    expect(t.section23.taxableEur).toBe(0);
    expect(t.totalTaxableEur).toBe(0);
  });

  it("a §23 loss does not reduce §22 staking income", () => {
    // Staking €300 (>256, taxable) with a §23 loss must NOT be netted down.
    const t = computeAnlageSoTotals(300, 5, [m(-100)], 2025);
    expect(t.section22.taxableEur).toBe(300);
    expect(t.section23.taxableEur).toBe(0);
    expect(t.section23.lossCarryforwardEur).toBe(100);
    expect(t.totalTaxableEur).toBe(300);
  });
});
