import { describe, expect, it } from "vitest";
import {
  periodReturn,
  monthlyReturns,
  twr,
  annualizedTwr,
  mwr,
} from "@/lib/analytics/returns";

describe("periodReturn", () => {
  it("returns 0 for empty array", () => {
    expect(periodReturn([])).toBe(0);
  });
  it("returns 0 if first value is 0", () => {
    expect(periodReturn([0, 100])).toBe(0);
  });
  it("returns 0.1 for [100, 110]", () => {
    expect(periodReturn([100, 110])).toBeCloseTo(0.1);
  });
  it("returns correct value for multi-element array", () => {
    expect(periodReturn([100, 90, 110])).toBeCloseTo(0.1);
  });
});

describe("monthlyReturns", () => {
  it("returns [] for empty array", () => {
    expect(monthlyReturns([])).toEqual([]);
  });
  it("returns [] for single element", () => {
    expect(monthlyReturns([100])).toEqual([]);
  });
  it("returns correct returns for two-element array", () => {
    expect(monthlyReturns([100, 110])).toHaveLength(1);
    expect(monthlyReturns([100, 110])[0]).toBeCloseTo(0.1);
  });
  it("computes step-by-step returns", () => {
    const result = monthlyReturns([100, 110, 99]);
    expect(result).toHaveLength(2);
    expect(result[0]).toBeCloseTo(0.1);
    expect(result[1]).toBeCloseTo(-0.1);
  });
});

describe("twr", () => {
  it("returns 0 for empty array", () => {
    expect(twr([])).toBe(0);
  });
  it("[0.1, 0.1] → ~0.21", () => {
    expect(twr([0.1, 0.1])).toBeCloseTo(0.21);
  });
  it("[0.1, -0.1] → ~-0.01", () => {
    expect(twr([0.1, -0.1])).toBeCloseTo(-0.01);
  });
});

describe("annualizedTwr", () => {
  it("returns raw return for periodDays < 30", () => {
    expect(annualizedTwr(0.05, 20)).toBe(0.05);
  });
  it("0.10 over 365 days → ~0.10", () => {
    expect(annualizedTwr(0.1, 365)).toBeCloseTo(0.1, 3);
  });
  it("0.10 over 180 days → ~0.21", () => {
    // (1.1)^(365/180) - 1 ≈ 0.2095
    expect(annualizedTwr(0.1, 180)).toBeCloseTo(0.2095, 2);
  });
});

describe("mwr", () => {
  it("returns 0 for empty cashflows", () => {
    expect(mwr([], 0, "2024-12-31")).toBe(0);
  });
  it("single cashflow: deposit 100, ending 110 after 365 days → ~0.10", () => {
    const result = mwr(
      [{ date: "2024-01-01", amount: -100 }],
      110,
      "2025-01-01",
    );
    expect(result).toBeCloseTo(0.1, 2);
  });
});
