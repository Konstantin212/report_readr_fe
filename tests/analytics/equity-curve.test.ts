import { describe, expect, it } from "vitest";
import { computeEquityCurve } from "@/lib/analytics/equity-curve";
import type { EquityCurveInput } from "@/lib/analytics/equity-curve";

describe("computeEquityCurve", () => {
  it("returns empty array for empty monthEnds", () => {
    const input: EquityCurveInput = {
      monthEnds: [],
      holdings: {},
      closesBySymbolDate: new Map(),
      currencyBySymbol: new Map(),
      fxRates: new Map(),
    };
    expect(computeEquityCurve(input)).toEqual([]);
  });

  it("single EUR symbol single month", () => {
    const input: EquityCurveInput = {
      monthEnds: ["2024-01-31"],
      holdings: { "2024-01-31": { NESN: 10 } },
      closesBySymbolDate: new Map([["NESN|2024-01-31", 100]]),
      currencyBySymbol: new Map([["NESN", "EUR"]]),
      fxRates: new Map(),
    };
    const result = computeEquityCurve(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ date: "2024-01-31", valueEur: 1000 });
  });

  it("multi-month USD position with FX conversion", () => {
    // 10 shares at $100 each; USD→EUR rate 1 EUR = 1.1 USD → value = 1000/1.1 ≈ 909.09
    const input: EquityCurveInput = {
      monthEnds: ["2024-01-31", "2024-02-29"],
      holdings: {
        "2024-01-31": { AAPL: 10 },
        "2024-02-29": { AAPL: 10 },
      },
      closesBySymbolDate: new Map([
        ["AAPL|2024-01-31", 100],
        ["AAPL|2024-02-29", 110],
      ]),
      currencyBySymbol: new Map([["AAPL", "USD"]]),
      fxRates: new Map([
        ["2024-01-31|USD", 1.1],
        ["2024-02-29|USD", 1.1],
      ]),
    };
    const result = computeEquityCurve(input);
    expect(result).toHaveLength(2);
    expect(result[0].valueEur).toBeCloseTo(909.09, 1);
    expect(result[1].valueEur).toBeCloseTo(1000, 1);
  });

  it("missing close → contributes 0 for that position", () => {
    const input: EquityCurveInput = {
      monthEnds: ["2024-01-31"],
      holdings: { "2024-01-31": { AAPL: 10, NESN: 5 } },
      closesBySymbolDate: new Map([["NESN|2024-01-31", 50]]), // AAPL missing
      currencyBySymbol: new Map([["AAPL", "USD"], ["NESN", "EUR"]]),
      fxRates: new Map([["2024-01-31|USD", 1.1]]),
    };
    const result = computeEquityCurve(input);
    expect(result[0].valueEur).toBe(250); // only NESN: 5 × 50
  });

  it("missing FX rate → contributes 0 for non-EUR position", () => {
    const input: EquityCurveInput = {
      monthEnds: ["2024-01-31"],
      holdings: { "2024-01-31": { AAPL: 10 } },
      closesBySymbolDate: new Map([["AAPL|2024-01-31", 100]]),
      currencyBySymbol: new Map([["AAPL", "USD"]]),
      fxRates: new Map(), // no FX rate
    };
    const result = computeEquityCurve(input);
    expect(result[0].valueEur).toBe(0);
  });
});
