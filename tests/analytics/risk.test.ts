import { describe, expect, it } from "vitest";
import { volatility, sharpe, beta, maxDrawdown } from "@/lib/analytics/risk";

describe("volatility", () => {
  it("returns 0 for empty array", () => {
    expect(volatility([])).toBe(0);
  });
  it("returns 0 for single element", () => {
    expect(volatility([0.05])).toBe(0);
  });
  it("returns 0 for constant series", () => {
    expect(volatility([0.05, 0.05, 0.05, 0.05])).toBe(0);
  });
  it("[0.05, -0.05, 0.05, -0.05] → ~0.2 (sample stddev × sqrt(12))", () => {
    // sample stddev of alternating ±0.05 with n=4 is ~0.05774,
    // annualized = 0.05774 * sqrt(12) ≈ 0.2
    expect(volatility([0.05, -0.05, 0.05, -0.05])).toBeCloseTo(0.2, 2);
  });
});

describe("sharpe", () => {
  it("0.1 return, 0.1 vol, 0 rf → 1.0", () => {
    expect(sharpe(0.1, 0.1)).toBeCloseTo(1.0);
  });
  it("returns 0 when volatility is 0", () => {
    expect(sharpe(0.1, 0)).toBe(0);
  });
  it("custom risk-free rate", () => {
    expect(sharpe(0.1, 0.1, 0.02)).toBeCloseTo(0.8);
  });
});

describe("beta", () => {
  it("returns 0 for empty arrays", () => {
    expect(beta([], [])).toBe(0);
  });
  it("identical series → beta of 1.0", () => {
    const series = [0.05, -0.03, 0.08, -0.02];
    expect(beta(series, series)).toBeCloseTo(1.0);
  });
  it("anti-correlated series → beta of -1.0", () => {
    const port = [0.05, -0.03, 0.08];
    const bench = [-0.05, 0.03, -0.08];
    expect(beta(port, bench)).toBeCloseTo(-1.0);
  });
  it("returns 0 when benchmark has zero variance", () => {
    expect(beta([0.05, 0.05, 0.05], [0.03, 0.03, 0.03])).toBe(0);
  });
});

describe("maxDrawdown", () => {
  it("returns 0 for empty array", () => {
    expect(maxDrawdown([])).toBe(0);
  });
  it("returns 0 for single-element array", () => {
    expect(maxDrawdown([100])).toBe(0);
  });
  it("all-rising series → 0 drawdown", () => {
    expect(maxDrawdown([100, 110, 120])).toBe(0);
  });
  it("[100, 120, 100, 110] → ≈ -0.1667", () => {
    // peak at 120, trough at 100 → (100/120)-1 = -0.1667
    expect(maxDrawdown([100, 120, 100, 110])).toBeCloseTo(-1 / 6, 3);
  });
  it("multi-trough takes worst", () => {
    // peak 120, troughs: 100 (−16.7%), 60 (−50%)
    expect(maxDrawdown([100, 120, 100, 80, 60, 90])).toBeCloseTo(-0.5, 3);
  });
});
